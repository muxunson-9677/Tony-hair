import type { ZajianfaDb } from '../archive/ArchiveRepository'
import { mapArchiveStorageError } from '../archive/ArchiveRepository'
import type {
  FavoriteFolder,
  FavoriteFolderWrite,
  HairstyleFavorite,
  HairstyleFavoriteTarget,
  PrivateHairstyleReference,
  PrivateHairstyleReferenceDetailsWrite,
  PrivateReferenceFocusArea,
  PrivateHairstyleReferenceImageWrite,
  PrivateHairstyleReferenceWrite,
} from './types'

const MAX_IMAGE_BYTES = 1_500_000
const MAX_IMAGE_LONG_EDGE = 1920
const MAX_NAME_CHARACTERS = 40
const MAX_NOTES_CHARACTERS = 300
const MAX_TAGS = 8
const MAX_TAG_CHARACTERS = 12
const MAX_FOCUS_AREA_NOTE_CHARACTERS = 80
const MAX_FOLDER_NAME_CHARACTERS = 24
const MAX_ITEM_ID_CHARACTERS = 128
const SUPPORTED_IMAGE_TYPES = new Set(['image/webp', 'image/jpeg'])
const FAVORITE_ITEM_TYPES = new Set(['curated_style', 'private_reference'])
const FOCUS_REGIONS = new Set(['fringe', 'top', 'sides', 'back'])
const FOCUS_INTENTS = new Set(['keep', 'avoid'])

export interface HairstyleLibraryRepositoryOptions {
  readonly now?: () => Date
  readonly createId?: () => string
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null
)

const countCharacters = (value: string) => Array.from(value).length

const normalizeText = (value: unknown, label: string) => {
  if (typeof value !== 'string') {
    throw new RangeError(`${label} must be text`)
  }
  return value.normalize('NFKC')
}

const normalizeBoundedText = (
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
) => {
  const normalized = normalizeText(value, label).trim()
  const length = countCharacters(normalized)
  if (length < minimum || length > maximum) {
    throw new RangeError(`${label} must contain ${minimum}–${maximum} characters`)
  }
  return normalized
}

const normalizeNotes = (value: unknown) => {
  const normalized = normalizeText(value, 'notes')
  if (countCharacters(normalized) > MAX_NOTES_CHARACTERS) {
    throw new RangeError(`notes must contain at most ${MAX_NOTES_CHARACTERS} characters`)
  }
  return normalized
}

const comparisonKey = (value: string) => value.toLocaleLowerCase('zh-CN')

const normalizeTags = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    throw new RangeError('tags must be an array')
  }

  const tags: string[] = []
  const seen = new Set<string>()
  for (const valueTag of value) {
    const tag = normalizeBoundedText(valueTag, 'tag', 1, MAX_TAG_CHARACTERS)
    const key = comparisonKey(tag)
    if (!seen.has(key)) {
      seen.add(key)
      tags.push(tag)
    }
  }
  if (tags.length > MAX_TAGS) {
    throw new RangeError(`tags must contain at most ${MAX_TAGS} items`)
  }
  return tags
}

const normalizeFocusAreas = (value: unknown): PrivateReferenceFocusArea[] => {
  if (value === undefined) {
    return []
  }
  if (!Array.isArray(value)) {
    throw new RangeError('focusAreas must be an array')
  }
  const areas: PrivateReferenceFocusArea[] = []
  const seen = new Set<string>()
  for (const area of value) {
    if (
      !isRecord(area)
      || typeof area.region !== 'string'
      || !FOCUS_REGIONS.has(area.region)
      || typeof area.intent !== 'string'
      || !FOCUS_INTENTS.has(area.intent)
    ) {
      throw new RangeError('focus area region or intent is invalid')
    }
    if (seen.has(area.region)) {
      throw new RangeError(`focus area region is duplicated: ${area.region}`)
    }
    seen.add(area.region)
    areas.push({
      region: area.region as PrivateReferenceFocusArea['region'],
      intent: area.intent as PrivateReferenceFocusArea['intent'],
      note: normalizeBoundedText(
        area.note,
        'focus area note',
        1,
        MAX_FOCUS_AREA_NOTE_CHARACTERS,
      ),
    })
  }
  return areas
}

const assertNoRepositoryFields = (value: unknown) => {
  if (!isRecord(value)) {
    throw new RangeError('reference write must be an object')
  }
  for (const field of ['id', 'fingerprint', 'createdAt', 'updatedAt']) {
    if (Object.prototype.hasOwnProperty.call(value, field)) {
      throw new Error(`${field} is assigned by the hairstyle library repository`)
    }
  }
}

const isBlobValue = (value: unknown): value is Blob => Boolean(
  value
  && typeof value === 'object'
  && typeof (value as Blob).size === 'number'
  && typeof (value as Blob).type === 'string'
  && typeof (value as Blob).arrayBuffer === 'function'
  && typeof (value as Blob).slice === 'function',
)

const isValidDateValue = (value: unknown): value is string => (
  typeof value === 'string'
  && value.trim().length > 0
  && !Number.isNaN(Date.parse(value))
)

const validateImageWrite = (
  value: PrivateHairstyleReferenceImageWrite,
): PrivateHairstyleReferenceImageWrite => {
  if (!isRecord(value) || !isBlobValue(value.image)) {
    throw new RangeError('image must be a Blob')
  }
  if (!SUPPORTED_IMAGE_TYPES.has(value.image.type)) {
    throw new RangeError('image must be a prepared WebP or JPEG')
  }
  if (
    !Number.isInteger(value.width)
    || !Number.isInteger(value.height)
    || value.width < 1
    || value.height < 1
    || Math.max(value.width, value.height) > MAX_IMAGE_LONG_EDGE
  ) {
    throw new RangeError(`image dimensions must be positive integers within ${MAX_IMAGE_LONG_EDGE}px`)
  }
  if (
    !Number.isInteger(value.bytes)
    || value.bytes < 1
    || value.bytes > MAX_IMAGE_BYTES
    || value.bytes !== value.image.size
  ) {
    throw new RangeError(`image bytes must match a non-empty Blob within ${MAX_IMAGE_BYTES} bytes`)
  }
  if (!isValidDateValue(value.processedAt)) {
    throw new RangeError('processedAt must be a valid date')
  }
  return {
    image: value.image,
    width: value.width,
    height: value.height,
    bytes: value.bytes,
    processedAt: value.processedAt,
  }
}

const normalizeReferenceDetails = (
  value: PrivateHairstyleReferenceDetailsWrite,
): PrivateHairstyleReferenceDetailsWrite => {
  if (!isRecord(value)) {
    throw new RangeError('reference details must be an object')
  }
  return {
    name: normalizeBoundedText(value.name, 'name', 1, MAX_NAME_CHARACTERS),
    notes: normalizeNotes(value.notes),
    tags: normalizeTags(value.tags),
    ...(value.focusAreas === undefined
      ? {}
      : { focusAreas: normalizeFocusAreas(value.focusAreas) }),
  }
}

const normalizeStoredReference = (
  reference: PrivateHairstyleReference,
): PrivateHairstyleReference => ({
  ...reference,
  focusAreas: normalizeFocusAreas(reference.focusAreas),
})

const normalizeFolderWrite = (value: FavoriteFolderWrite): FavoriteFolderWrite => {
  if (!isRecord(value)) {
    throw new RangeError('folder write must be an object')
  }
  return {
    name: normalizeBoundedText(value.name, 'folder name', 1, MAX_FOLDER_NAME_CHARACTERS),
  }
}

const normalizeFavoriteTarget = (
  target: HairstyleFavoriteTarget,
): HairstyleFavoriteTarget => {
  if (
    !isRecord(target)
    || typeof target.itemType !== 'string'
    || !FAVORITE_ITEM_TYPES.has(target.itemType)
  ) {
    throw new RangeError('favorite item type is invalid')
  }
  return {
    itemType: target.itemType as HairstyleFavoriteTarget['itemType'],
    itemId: normalizeBoundedText(
      target.itemId,
      'favorite item id',
      1,
      MAX_ITEM_ID_CHARACTERS,
    ),
  }
}

const favoriteKey = ({ itemType, itemId }: HairstyleFavoriteTarget) => (
  `${itemType}:${itemId}`
)

const materializePreparedImage = async (
  image: PrivateHairstyleReferenceImageWrite,
) => {
  const bytes = await image.image.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  const fingerprint = Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, '0'),
  ).join('')
  const storedImage = image.image.slice(0, bytes.byteLength, image.image.type)
  return {
    ...image,
    image: storedImage,
    fingerprint,
  }
}

export class HairstyleLibraryRepository {
  private readonly now: () => Date
  private readonly createId: () => string

  constructor(
    private readonly db: ZajianfaDb,
    options: HairstyleLibraryRepositoryOptions = {},
  ) {
    this.now = options.now ?? (() => new Date())
    this.createId = options.createId ?? (() => crypto.randomUUID())
  }

  private async run<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation()
    } catch (error) {
      return mapArchiveStorageError(error)
    }
  }

  private timestamp() {
    const value = this.now()
    if (!(value instanceof Date) || Number.isNaN(value.valueOf())) {
      throw new RangeError('repository clock must return a valid date')
    }
    return value.toISOString()
  }

  private nextId() {
    const value = this.createId()
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new Error('repository id generator must return a non-empty string')
    }
    return value
  }

  private async assertFolderExists(folderId: string | null) {
    if (folderId !== null && !(await this.db.favoriteFolders.get(folderId))) {
      throw new Error(`favorite folder not found: ${folderId}`)
    }
  }

  private async assertPrivateReferenceExists(target: HairstyleFavoriteTarget) {
    if (
      target.itemType === 'private_reference'
      && !(await this.db.privateReferences.get(target.itemId))
    ) {
      throw new Error(`private reference not found: ${target.itemId}`)
    }
  }

  private async assertUniqueFolderName(name: string, exceptId?: string) {
    const key = comparisonKey(name)
    const folders = await this.db.favoriteFolders.toArray()
    if (folders.some((folder) => folder.id !== exceptId && comparisonKey(folder.name) === key)) {
      throw new Error(`favorite folder already exists: ${name}`)
    }
  }

  listPrivateReferences(): Promise<PrivateHairstyleReference[]> {
    return this.run(async () => (
      (await this.db.privateReferences.toArray()).map(normalizeStoredReference)
    ))
  }

  getPrivateReference(id: string): Promise<PrivateHairstyleReference | undefined> {
    return this.run(async () => {
      const reference = await this.db.privateReferences.get(id)
      return reference ? normalizeStoredReference(reference) : undefined
    })
  }

  async savePrivateReference(
    write: PrivateHairstyleReferenceWrite,
  ): Promise<PrivateHairstyleReference> {
    assertNoRepositoryFields(write)
    const details = normalizeReferenceDetails(write)
    const { fingerprint, ...image } = await materializePreparedImage(validateImageWrite(write))
    const timestamp = this.timestamp()
    const reference: PrivateHairstyleReference = {
      id: this.nextId(),
      fingerprint,
      ...details,
      focusAreas: details.focusAreas ?? [],
      ...image,
      createdAt: timestamp,
      updatedAt: timestamp,
    }

    return this.run(() => this.db.transaction(
      'rw',
      this.db.privateReferences,
      async () => {
        if (await this.db.privateReferences.where('fingerprint').equals(fingerprint).first()) {
          throw new Error('a private reference with these prepared bytes already exists')
        }
        await this.db.privateReferences.add(reference)
        return reference
      },
    ))
  }

  async updatePrivateReference(
    id: string,
    write: PrivateHairstyleReferenceDetailsWrite,
  ): Promise<PrivateHairstyleReference> {
    assertNoRepositoryFields(write)
    const details = normalizeReferenceDetails(write)
    const updatedAt = this.timestamp()
    return this.run(() => this.db.transaction(
      'rw',
      this.db.privateReferences,
      async () => {
        const current = await this.db.privateReferences.get(id)
        if (!current) {
          throw new Error(`private reference not found: ${id}`)
        }
        const updated = { ...current, ...details, updatedAt }
        await this.db.privateReferences.put(updated)
        return updated
      },
    ))
  }

  async updatePrivateReferenceWithImage(
    id: string,
    write: PrivateHairstyleReferenceWrite,
  ): Promise<PrivateHairstyleReference> {
    assertNoRepositoryFields(write)
    const details = normalizeReferenceDetails(write)
    const { fingerprint, ...image } = await materializePreparedImage(validateImageWrite(write))
    const updatedAt = this.timestamp()

    return this.run(() => this.db.transaction(
      'rw',
      this.db.privateReferences,
      async () => {
        const current = await this.db.privateReferences.get(id)
        if (!current) {
          throw new Error(`private reference not found: ${id}`)
        }
        const duplicate = await this.db.privateReferences
          .where('fingerprint')
          .equals(fingerprint)
          .first()
        if (duplicate && duplicate.id !== id) {
          throw new Error('a private reference with these prepared bytes already exists')
        }
        const updated = {
          ...current,
          ...details,
          ...image,
          fingerprint,
          updatedAt,
        }
        await this.db.privateReferences.put(updated)
        return updated
      },
    ))
  }

  async replaceReferenceImage(
    id: string,
    write: PrivateHairstyleReferenceImageWrite,
  ): Promise<PrivateHairstyleReference> {
    assertNoRepositoryFields(write)
    const { fingerprint, ...image } = await materializePreparedImage(validateImageWrite(write))
    const updatedAt = this.timestamp()

    return this.run(() => this.db.transaction(
      'rw',
      this.db.privateReferences,
      async () => {
        const current = await this.db.privateReferences.get(id)
        if (!current) {
          throw new Error(`private reference not found: ${id}`)
        }
        const duplicate = await this.db.privateReferences
          .where('fingerprint')
          .equals(fingerprint)
          .first()
        if (duplicate && duplicate.id !== id) {
          throw new Error('a private reference with these prepared bytes already exists')
        }
        const updated = {
          ...current,
          ...image,
          fingerprint,
          updatedAt,
        }
        await this.db.privateReferences.put(updated)
        return updated
      },
    ))
  }

  deletePrivateReference(id: string): Promise<void> {
    return this.run(() => this.db.transaction(
      'rw',
      [this.db.privateReferences, this.db.favorites],
      async () => {
        await this.db.favorites.where('itemKey').equals(`private_reference:${id}`).delete()
        await this.db.privateReferences.delete(id)
      },
    ))
  }

  listFavorites(): Promise<HairstyleFavorite[]> {
    return this.run(() => this.db.favorites.toArray())
  }

  async toggleFavorite(
    rawTarget: HairstyleFavoriteTarget,
    folderId: string | null = null,
  ): Promise<HairstyleFavorite | null> {
    const target = normalizeFavoriteTarget(rawTarget)
    const itemKey = favoriteKey(target)
    return this.run(() => this.db.transaction(
      'rw',
      [this.db.privateReferences, this.db.favoriteFolders, this.db.favorites],
      async () => {
        const existing = await this.db.favorites.where('itemKey').equals(itemKey).first()
        if (existing) {
          await this.db.favorites.delete(existing.id)
          return null
        }
        await this.assertPrivateReferenceExists(target)
        await this.assertFolderExists(folderId)
        const timestamp = this.timestamp()
        const favorite: HairstyleFavorite = {
          id: this.nextId(),
          ...target,
          itemKey,
          folderId,
          createdAt: timestamp,
          updatedAt: timestamp,
        }
        await this.db.favorites.add(favorite)
        return favorite
      },
    ))
  }

  async moveFavorite(
    rawTarget: HairstyleFavoriteTarget,
    folderId: string | null,
  ): Promise<HairstyleFavorite> {
    const target = normalizeFavoriteTarget(rawTarget)
    const itemKey = favoriteKey(target)
    return this.run(() => this.db.transaction(
      'rw',
      [this.db.favoriteFolders, this.db.favorites],
      async () => {
        await this.assertFolderExists(folderId)
        const favorite = await this.db.favorites.where('itemKey').equals(itemKey).first()
        if (!favorite) {
          throw new Error(`favorite not found: ${itemKey}`)
        }
        const updated = { ...favorite, folderId, updatedAt: this.timestamp() }
        await this.db.favorites.put(updated)
        return updated
      },
    ))
  }

  listFavoriteFolders(): Promise<FavoriteFolder[]> {
    return this.run(() => this.db.favoriteFolders.toArray())
  }

  getFavoriteFolder(id: string): Promise<FavoriteFolder | undefined> {
    return this.run(() => this.db.favoriteFolders.get(id))
  }

  async saveFavoriteFolder(write: FavoriteFolderWrite): Promise<FavoriteFolder> {
    assertNoRepositoryFields(write)
    const normalized = normalizeFolderWrite(write)
    const timestamp = this.timestamp()
    const folder: FavoriteFolder = {
      id: this.nextId(),
      ...normalized,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    return this.run(() => this.db.transaction(
      'rw',
      this.db.favoriteFolders,
      async () => {
        await this.assertUniqueFolderName(folder.name)
        await this.db.favoriteFolders.add(folder)
        return folder
      },
    ))
  }

  async renameFavoriteFolder(id: string, write: FavoriteFolderWrite): Promise<FavoriteFolder> {
    assertNoRepositoryFields(write)
    const normalized = normalizeFolderWrite(write)
    const updatedAt = this.timestamp()
    return this.run(() => this.db.transaction(
      'rw',
      this.db.favoriteFolders,
      async () => {
        const current = await this.db.favoriteFolders.get(id)
        if (!current) {
          throw new Error(`favorite folder not found: ${id}`)
        }
        await this.assertUniqueFolderName(normalized.name, id)
        const updated = { ...current, ...normalized, updatedAt }
        await this.db.favoriteFolders.put(updated)
        return updated
      },
    ))
  }

  deleteFavoriteFolder(id: string): Promise<void> {
    return this.run(() => this.db.transaction(
      'rw',
      [this.db.favoriteFolders, this.db.favorites],
      async () => {
        const updatedAt = this.timestamp()
        await this.db.favorites.where('folderId').equals(id).modify({ folderId: null, updatedAt })
        await this.db.favoriteFolders.delete(id)
      },
    ))
  }
}
