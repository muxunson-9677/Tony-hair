import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, test } from 'vitest'

import {
  createHairstyleLibraryStore,
  type HairstyleLibraryRepositoryPort,
} from './libraryStore'
import type {
  FavoriteFolder,
  FavoriteFolderWrite,
  HairstyleFavorite,
  HairstyleFavoriteTarget,
  PrivateHairstyleReference,
  PrivateHairstyleReferenceDetailsWrite,
  PrivateHairstyleReferenceImageWrite,
  PrivateHairstyleReferenceWrite,
} from './types'

const preparedImage = new Blob(['prepared-reference'], { type: 'image/webp' })

const reference = (
  overrides: Partial<PrivateHairstyleReference> = {},
): PrivateHairstyleReference => ({
  id: 'reference-1',
  fingerprint: 'fingerprint-1',
  name: '齐颌参考',
  notes: '保留耳前重量',
  tags: ['短发'],
  image: preparedImage,
  width: 960,
  height: 1280,
  bytes: preparedImage.size,
  processedAt: '2026-08-10T00:00:00.000Z',
  createdAt: '2026-08-10T00:00:00.000Z',
  updatedAt: '2026-08-10T00:00:00.000Z',
  ...overrides,
})

const favorite = (
  overrides: Partial<HairstyleFavorite> = {},
): HairstyleFavorite => ({
  id: 'favorite-1',
  itemType: 'curated_style',
  itemId: 'lin-bob',
  itemKey: 'curated_style:lin-bob',
  folderId: null,
  createdAt: '2026-08-10T00:00:00.000Z',
  updatedAt: '2026-08-10T00:00:00.000Z',
  ...overrides,
})

const folder = (overrides: Partial<FavoriteFolder> = {}): FavoriteFolder => ({
  id: 'folder-1',
  name: '通勤候选',
  createdAt: '2026-08-10T00:00:00.000Z',
  updatedAt: '2026-08-10T00:00:00.000Z',
  ...overrides,
})

const referenceWrite = (): PrivateHairstyleReferenceWrite => ({
  name: '齐颌参考',
  notes: '保留耳前重量',
  tags: ['短发'],
  image: preparedImage,
  width: 960,
  height: 1280,
  bytes: preparedImage.size,
  processedAt: '2026-08-10T00:00:00.000Z',
})

const deferred = <Value,>() => {
  let resolve!: (value: Value) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

class MemoryLibraryRepository implements HairstyleLibraryRepositoryPort {
  references: PrivateHairstyleReference[] = []
  favorites: HairstyleFavorite[] = []
  folders: FavoriteFolder[] = []
  deferredReferences: Promise<PrivateHairstyleReference[]> | null = null
  nextLoadFailure: unknown
  listReferenceCalls = 0
  private nextReferenceId = 1
  private nextFavoriteId = 1
  private nextFolderId = 1

  async listPrivateReferences() {
    this.listReferenceCalls += 1
    if (this.nextLoadFailure) {
      const failure = this.nextLoadFailure
      this.nextLoadFailure = undefined
      throw failure
    }
    return this.deferredReferences ?? [...this.references]
  }

  async getPrivateReference(id: string) {
    return this.references.find((item) => item.id === id)
  }

  async savePrivateReference(write: PrivateHairstyleReferenceWrite) {
    const saved = reference({
      ...write,
      id: `reference-${this.nextReferenceId++}`,
      fingerprint: `fingerprint-${this.nextReferenceId}`,
    })
    this.references.push(saved)
    return saved
  }

  async updatePrivateReference(
    id: string,
    write: PrivateHairstyleReferenceDetailsWrite,
  ) {
    const current = await this.getPrivateReference(id)
    if (!current) {
      throw new Error('reference missing')
    }
    const updated = { ...current, ...write, updatedAt: '2026-08-11T00:00:00.000Z' }
    this.references = this.references.map((item) => item.id === id ? updated : item)
    return updated
  }

  async updatePrivateReferenceWithImage(
    id: string,
    write: PrivateHairstyleReferenceWrite,
  ) {
    const current = await this.getPrivateReference(id)
    if (!current) {
      throw new Error('reference missing')
    }
    const updated = {
      ...current,
      ...write,
      fingerprint: 'combined-update-fingerprint',
      updatedAt: '2026-08-12T00:00:00.000Z',
    }
    this.references = this.references.map((item) => item.id === id ? updated : item)
    return updated
  }

  async replaceReferenceImage(
    id: string,
    write: PrivateHairstyleReferenceImageWrite,
  ) {
    const current = await this.getPrivateReference(id)
    if (!current) {
      throw new Error('reference missing')
    }
    const updated = {
      ...current,
      ...write,
      fingerprint: 'replacement-fingerprint',
      updatedAt: '2026-08-12T00:00:00.000Z',
    }
    this.references = this.references.map((item) => item.id === id ? updated : item)
    return updated
  }

  async deletePrivateReference(id: string) {
    this.references = this.references.filter((item) => item.id !== id)
    this.favorites = this.favorites.filter(({ itemKey }) => itemKey !== `private_reference:${id}`)
  }

  async listFavorites() {
    return [...this.favorites]
  }

  async toggleFavorite(target: HairstyleFavoriteTarget, folderId: string | null = null) {
    const itemKey = `${target.itemType}:${target.itemId}`
    const existing = this.favorites.find((item) => item.itemKey === itemKey)
    if (existing) {
      this.favorites = this.favorites.filter(({ id }) => id !== existing.id)
      return null
    }
    const saved = favorite({
      id: `favorite-${this.nextFavoriteId++}`,
      ...target,
      itemKey,
      folderId,
    })
    this.favorites.push(saved)
    return saved
  }

  async moveFavorite(target: HairstyleFavoriteTarget, folderId: string | null) {
    const itemKey = `${target.itemType}:${target.itemId}`
    const current = this.favorites.find((item) => item.itemKey === itemKey)
    if (!current) {
      throw new Error('favorite missing')
    }
    const updated = { ...current, folderId, updatedAt: '2026-08-11T00:00:00.000Z' }
    this.favorites = this.favorites.map((item) => item.itemKey === itemKey ? updated : item)
    return updated
  }

  async listFavoriteFolders() {
    return [...this.folders]
  }

  async saveFavoriteFolder(write: FavoriteFolderWrite) {
    const saved = folder({ id: `folder-${this.nextFolderId++}`, ...write })
    this.folders.push(saved)
    return saved
  }

  async renameFavoriteFolder(id: string, write: FavoriteFolderWrite) {
    const current = this.folders.find((item) => item.id === id)
    if (!current) {
      throw new Error('folder missing')
    }
    const updated = { ...current, ...write, updatedAt: '2026-08-11T00:00:00.000Z' }
    this.folders = this.folders.map((item) => item.id === id ? updated : item)
    return updated
  }

  async deleteFavoriteFolder(id: string) {
    this.folders = this.folders.filter((item) => item.id !== id)
    this.favorites = this.favorites.map((item) => (
      item.folderId === id ? { ...item, folderId: null } : item
    ))
  }
}

describe('hairstyle library store', () => {
  let repository: MemoryLibraryRepository

  beforeEach(() => {
    setActivePinia(createPinia())
    repository = new MemoryLibraryRepository()
  })

  test('loads once for concurrent callers and works without a hair profile', async () => {
    const gate = deferred<PrivateHairstyleReference[]>()
    repository.deferredReferences = gate.promise
    repository.favorites = [favorite()]
    repository.folders = [folder()]
    const store = createHairstyleLibraryStore(repository)()

    const firstLoad = store.load()
    const secondLoad = store.load()

    expect(repository.listReferenceCalls).toBe(1)
    gate.resolve([reference()])
    await Promise.all([firstLoad, secondLoad])

    expect(store.references).toEqual([reference()])
    expect(store.favorites).toEqual([favorite()])
    expect(store.folders).toEqual([folder()])
    expect(store.loading).toBe(false)
    expect(store.error).toBeNull()
  })

  test('does not let an older load overwrite a newer reference mutation', async () => {
    const oldSnapshot = deferred<PrivateHairstyleReference[]>()
    repository.deferredReferences = oldSnapshot.promise
    const store = createHairstyleLibraryStore(repository)()
    const loading = store.load()

    const saved = await store.saveReference(referenceWrite())
    expect(saved?.id).toBe('reference-1')
    expect(store.getReference('reference-1')).toEqual(saved)

    oldSnapshot.resolve([])
    await loading

    expect(store.references).toEqual([saved])
    expect(store.loading).toBe(false)
  })

  test('starts a fresh generation load while an invalidated request is still pending', async () => {
    const oldSnapshot = deferred<PrivateHairstyleReference[]>()
    repository.deferredReferences = oldSnapshot.promise
    const store = createHairstyleLibraryStore(repository)()
    const oldLoad = store.load()

    const saved = await store.saveReference(referenceWrite())
    repository.deferredReferences = null
    repository.favorites = [favorite()]
    const latestLoad = store.load()

    expect(repository.listReferenceCalls).toBe(2)
    await latestLoad
    expect(store.references).toEqual([saved])
    expect(store.favorites).toEqual([favorite()])

    oldSnapshot.resolve([])
    await oldLoad
    expect(store.references).toEqual([saved])
    expect(store.favorites).toEqual([favorite()])
    expect(store.loading).toBe(false)
  })

  test('keeps the previous snapshot when a reload fails', async () => {
    repository.references = [reference()]
    repository.favorites = [favorite()]
    const store = createHairstyleLibraryStore(repository)()
    await store.load()
    const priorReferences = store.references
    const priorFavorites = store.favorites

    repository.nextLoadFailure = new Error('IndexedDB unavailable')
    await store.load()

    expect(store.references).toEqual(priorReferences)
    expect(store.favorites).toEqual(priorFavorites)
    expect(store.error).toMatch(/本机|读取|存储/)
    expect(store.loading).toBe(false)
  })

  test('blocks mutations after an initial load failure until a retry hydrates authoritative state', async () => {
    repository.favorites = [favorite()]
    repository.nextLoadFailure = new Error('IndexedDB unavailable')
    const store = createHairstyleLibraryStore(repository)()
    const target = { itemType: 'curated_style', itemId: 'lin-bob' } as const

    await store.load()

    expect(store.initialized).toBe(false)
    expect(store.isFavorite('curated_style:lin-bob')).toBe(false)
    expect(await store.toggleFavorite(target)).toBeNull()
    expect(repository.favorites).toEqual([favorite()])

    await store.load()

    expect(store.initialized).toBe(true)
    expect(store.isFavorite('curated_style:lin-bob')).toBe(true)
  })

  test('creates, edits, replaces, and deletes private references in local state', async () => {
    const store = createHairstyleLibraryStore(repository)()
    await store.load()

    const saved = await store.saveReference(referenceWrite())
    expect(saved).not.toBeNull()
    const updated = await store.updateReference(saved!.id, {
      name: '更新的参考',
      notes: '保留新备注',
      tags: ['通勤'],
    })
    expect(store.getReference(saved!.id)?.name).toBe('更新的参考')

    const replacement = new Blob(['replacement'], { type: 'image/jpeg' })
    const replaced = await store.replaceReferenceImage(saved!.id, {
      image: replacement,
      width: 800,
      height: 1000,
      bytes: replacement.size,
      processedAt: '2026-08-12T00:00:00.000Z',
    })
    expect(replaced?.image).toBe(replacement)
    expect(updated?.image).toBe(preparedImage)

    const combinedImage = new Blob(['combined'], { type: 'image/webp' })
    const combined = await store.updateReferenceWithImage(saved!.id, {
      name: '图片文字一起更新',
      notes: '同一次本地写入',
      tags: ['原子更新'],
      image: combinedImage,
      width: 720,
      height: 960,
      bytes: combinedImage.size,
      processedAt: '2026-08-12T01:00:00.000Z',
    })
    expect(combined).toMatchObject({
      name: '图片文字一起更新',
      notes: '同一次本地写入',
      tags: ['原子更新'],
      image: combinedImage,
    })
    expect(store.getReference(saved!.id)?.name).toBe('图片文字一起更新')

    repository.favorites = [favorite({
      itemType: 'private_reference',
      itemId: saved!.id,
      itemKey: `private_reference:${saved!.id}`,
    })]
    await store.load()
    expect(await store.deleteReference(saved!.id)).toBe(true)
    expect(store.getReference(saved!.id)).toBeUndefined()
    expect(store.isFavorite(`private_reference:${saved!.id}`)).toBe(false)
  })

  test('keeps favorites unique while toggling and supports folder lifecycle actions', async () => {
    const store = createHairstyleLibraryStore(repository)()
    await store.load()
    const target = { itemType: 'curated_style', itemId: 'lin-bob' } as const

    expect(store.isFavorite('curated_style:lin-bob')).toBe(false)
    await store.toggleFavorite(target)
    expect(store.isFavorite('curated_style:lin-bob')).toBe(true)
    expect(store.favorites).toHaveLength(1)

    const createdFolder = await store.saveFolder({ name: '低打理' })
    expect(createdFolder).not.toBeNull()
    await store.moveFavorite(target, createdFolder!.id)
    expect(store.favorites[0]?.folderId).toBe(createdFolder!.id)

    await store.renameFolder(createdFolder!.id, { name: '通勤备选' })
    expect(store.folders[0]?.name).toBe('通勤备选')
    expect(await store.deleteFolder(createdFolder!.id)).toBe(true)
    expect(store.folders).toEqual([])
    expect(store.favorites[0]?.folderId).toBeNull()

    await store.toggleFavorite(target)
    expect(store.isFavorite('curated_style:lin-bob')).toBe(false)
    expect(store.favorites).toEqual([])
  })
})
