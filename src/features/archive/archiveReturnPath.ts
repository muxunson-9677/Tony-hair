import { curatedHairstyles } from '../hairstyle-library/curatedCatalog'

export type ArchivePlanAddPointer =
  | { readonly kind: 'catalog'; readonly id: string }
  | { readonly kind: 'private_reference'; readonly id: string }

export interface ArchivePlanReturnTarget {
  readonly path: string
  readonly pointer: ArchivePlanAddPointer
}

const PLAN_CREATE_PATH = '/archive/plans/new'
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u

const hasAsciiControl = (value: string) => Array.from(value).some((character) => {
  const code = character.charCodeAt(0)
  return code < 32 || code === 127
})

const hasUnsafeInput = (value: string) => hasAsciiControl(value) || /[\\#\s]/u.test(value)
const hasUnsafeDecodedPath = (value: string) => hasUnsafeInput(value) || value.includes('%')

const isActiveCatalogId = (id: string) => curatedHairstyles.some(
  (style) => style.id === id && style.status === 'active',
)

export const parseArchivePlanAddQuery = (value: unknown): ArchivePlanAddPointer | null => {
  if (typeof value !== 'string') return null

  const separator = value.indexOf(':')
  if (separator < 1 || separator !== value.lastIndexOf(':')) return null

  const kind = value.slice(0, separator)
  const id = value.slice(separator + 1)
  if (!SAFE_ID.test(id)) return null

  if (kind === 'catalog') {
    return isActiveCatalogId(id) ? { kind, id } : null
  }
  if (kind === 'private_reference') {
    return { kind, id }
  }
  return null
}

const pointerToAddQuery = (pointer: unknown): string | null => {
  if (!pointer || typeof pointer !== 'object' || Array.isArray(pointer)) return null

  const record = pointer as Record<string, unknown>
  if (
    Object.keys(record).length !== 2
    || !Object.hasOwn(record, 'kind')
    || !Object.hasOwn(record, 'id')
    || typeof record.kind !== 'string'
    || typeof record.id !== 'string'
  ) {
    return null
  }

  const value = `${record.kind}:${record.id}`
  return parseArchivePlanAddQuery(value) ? value : null
}

export const buildArchivePlanReturnPath = (pointer: unknown): string | null => {
  const add = pointerToAddQuery(pointer)
  return add ? `${PLAN_CREATE_PATH}?add=${add}` : null
}

export const parseArchivePlanReturnPath = (value: unknown): ArchivePlanReturnTarget | null => {
  if (typeof value !== 'string' || !value || hasUnsafeInput(value)) return null

  let decoded = value
  if (!decoded.startsWith('/')) {
    try {
      decoded = decodeURIComponent(decoded)
    } catch {
      return null
    }
  }

  if (
    !decoded.startsWith('/')
    || decoded.startsWith('//')
    || hasUnsafeDecodedPath(decoded)
  ) {
    return null
  }

  const parsed = new URL(decoded, 'https://zajianfa.invalid')
  const entries = [...parsed.searchParams.entries()]
  if (
    parsed.origin !== 'https://zajianfa.invalid'
    || parsed.pathname !== PLAN_CREATE_PATH
    || parsed.hash
    || entries.length !== 1
    || entries[0]?.[0] !== 'add'
  ) {
    return null
  }

  const pointer = parseArchivePlanAddQuery(entries[0][1])
  if (!pointer) return null

  const path = buildArchivePlanReturnPath(pointer)
  return path && decoded === path ? { path, pointer } : null
}
