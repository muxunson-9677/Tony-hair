import type { ZajianfaDb } from './ArchiveRepository'

const BACKUP_FORMAT = 'zajianfa-local-backup'
const BACKUP_VERSION = 1
const TABLE_NAMES = [
  'profiles',
  'plans',
  'candidates',
  'briefs',
  'records',
  'photos',
  'avoidRules',
  'standardStyles',
  'privateReferences',
  'favoriteFolders',
  'favorites',
] as const

interface EncodedBlob {
  readonly $blob: {
    readonly type: string
    readonly base64: string
  }
}

interface BackupPayload {
  readonly format: typeof BACKUP_FORMAT
  readonly version: typeof BACKUP_VERSION
  readonly exportedAt: string
  readonly tables: Record<(typeof TABLE_NAMES)[number], unknown[]>
}

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return btoa(binary)
}

const base64ToBytes = (value: string) => {
  const binary = atob(value)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

const isBlobLike = (value: unknown): value is Blob => Boolean(
  value
  && typeof value === 'object'
  && typeof (value as Blob).arrayBuffer === 'function'
  && typeof (value as Blob).type === 'string'
  && typeof (value as Blob).size === 'number',
)

const encodeValue = async (value: unknown): Promise<unknown> => {
  if (isBlobLike(value)) {
    const encoded: EncodedBlob = {
      $blob: {
        type: value.type,
        base64: bytesToBase64(new Uint8Array(await value.arrayBuffer())),
      },
    }
    return encoded
  }
  if (Array.isArray(value)) {
    return Promise.all(value.map(encodeValue))
  }
  if (value && typeof value === 'object') {
    const entries = await Promise.all(Object.entries(value).map(async ([key, item]) => (
      [key, await encodeValue(item)] as const
    )))
    return Object.fromEntries(entries)
  }
  return value
}

const isEncodedBlob = (value: unknown): value is EncodedBlob => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const blob = (value as { $blob?: unknown }).$blob
  return Boolean(
    blob
    && typeof blob === 'object'
    && typeof (blob as { type?: unknown }).type === 'string'
    && typeof (blob as { base64?: unknown }).base64 === 'string',
  )
}

type BlobFactory = (parts: BlobPart[], options: BlobPropertyBag) => Blob

const decodeValue = (value: unknown, createBlob: BlobFactory): unknown => {
  if (isEncodedBlob(value)) {
    return createBlob([base64ToBytes(value.$blob.base64)], { type: value.$blob.type })
  }
  if (Array.isArray(value)) return value.map((item) => decodeValue(item, createBlob))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, decodeValue(item, createBlob)]))
  }
  return value
}

const parseBackup = (content: string): BackupPayload => {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    throw new Error('这不是有效的咋剪发备份文件。')
  }
  if (
    !parsed
    || typeof parsed !== 'object'
    || (parsed as { format?: unknown }).format !== BACKUP_FORMAT
    || (parsed as { version?: unknown }).version !== BACKUP_VERSION
  ) {
    throw new Error('这不是受支持的咋剪发备份文件。')
  }
  const tables = (parsed as { tables?: unknown }).tables
  if (!tables || typeof tables !== 'object') {
    throw new Error('备份文件缺少本机数据。')
  }
  for (const tableName of TABLE_NAMES) {
    if (!Array.isArray((tables as Record<string, unknown>)[tableName])) {
      throw new Error('备份文件内容不完整。')
    }
  }
  return parsed as BackupPayload
}

export const exportLocalBackup = async (db: ZajianfaDb, now = new Date()) => {
  const entries = await Promise.all(TABLE_NAMES.map(async (tableName) => (
    [tableName, await encodeValue(await db.table(tableName).toArray())] as const
  )))
  const payload: BackupPayload = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    tables: Object.fromEntries(entries) as BackupPayload['tables'],
  }
  return JSON.stringify(payload)
}

export const importLocalBackup = async (
  db: ZajianfaDb,
  content: string,
  createBlob: BlobFactory = (parts, options) => new Blob(parts, options),
) => {
  const payload = parseBackup(content)
  const decoded = Object.fromEntries(TABLE_NAMES.map((tableName) => (
    [tableName, decodeValue(payload.tables[tableName], createBlob) as unknown[]]
  ))) as Record<(typeof TABLE_NAMES)[number], unknown[]>

  await db.transaction('rw', TABLE_NAMES.map((tableName) => db.table(tableName)), async () => {
    for (const tableName of TABLE_NAMES) {
      const table = db.table(tableName)
      await table.clear()
      if (decoded[tableName].length) await table.bulkAdd(decoded[tableName])
    }
  })
}
