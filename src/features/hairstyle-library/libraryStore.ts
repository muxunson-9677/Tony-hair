import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { ArchiveStorageError } from '../archive/ArchiveRepository'
import { defaultArchiveDb } from '../archive/archiveStore'
import { HairstyleLibraryRepository } from './HairstyleLibraryRepository'
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

export interface HairstyleLibraryRepositoryPort {
  listPrivateReferences(): Promise<PrivateHairstyleReference[]>
  getPrivateReference(id: string): Promise<PrivateHairstyleReference | undefined>
  savePrivateReference(
    write: PrivateHairstyleReferenceWrite,
  ): Promise<PrivateHairstyleReference>
  updatePrivateReference(
    id: string,
    write: PrivateHairstyleReferenceDetailsWrite,
  ): Promise<PrivateHairstyleReference>
  replaceReferenceImage(
    id: string,
    write: PrivateHairstyleReferenceImageWrite,
  ): Promise<PrivateHairstyleReference>
  deletePrivateReference(id: string): Promise<void>
  listFavorites(): Promise<HairstyleFavorite[]>
  toggleFavorite(
    target: HairstyleFavoriteTarget,
    folderId?: string | null,
  ): Promise<HairstyleFavorite | null>
  moveFavorite(
    target: HairstyleFavoriteTarget,
    folderId: string | null,
  ): Promise<HairstyleFavorite>
  listFavoriteFolders(): Promise<FavoriteFolder[]>
  saveFavoriteFolder(write: FavoriteFolderWrite): Promise<FavoriteFolder>
  renameFavoriteFolder(id: string, write: FavoriteFolderWrite): Promise<FavoriteFolder>
  deleteFavoriteFolder(id: string): Promise<void>
}

const sortByUpdatedAt = <Item extends { readonly id: string, readonly updatedAt: string }>(
  items: readonly Item[],
) => [...items].sort((left, right) => (
  right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id)
))

export const hairstyleLibraryErrorMessage = (
  error: unknown,
  action: 'load' | 'save' = 'save',
) => {
  if (error instanceof ArchiveStorageError) {
    if (error.code === 'quota_exceeded') {
      return '本机存储空间不足，请清理不需要的本地内容后重试。'
    }
    return '当前浏览器的本机存储不可用，请改用普通窗口后重试。'
  }

  return action === 'load'
    ? '本机发型库暂时无法读取，请稍后重试。'
    : '保存失败，本机发型库未更改，请重试。'
}

type LibrarySnapshot = {
  readonly references: PrivateHairstyleReference[]
  readonly favorites: HairstyleFavorite[]
  readonly folders: FavoriteFolder[]
}

type MutationResult<Value> =
  | { readonly ok: true, readonly value: Value }
  | { readonly ok: false }

interface LoadRequest {
  readonly generation: number
  promise: Promise<void>
}

export const createHairstyleLibraryStore = (
  repository: HairstyleLibraryRepositoryPort,
) => defineStore('hairstyle-library', () => {
  const references = ref<PrivateHairstyleReference[]>([])
  const favorites = ref<HairstyleFavorite[]>([])
  const folders = ref<FavoriteFolder[]>([])
  const loading = ref(false)
  const saving = ref(false)
  const initialized = ref(false)
  const error = ref<string | null>(null)
  let loadRequest: LoadRequest | null = null
  let snapshotGeneration = 0

  const favoriteKeys = computed(() => new Set(
    favorites.value.map(({ itemKey }) => itemKey),
  ))

  const fetchSnapshot = async (): Promise<LibrarySnapshot> => {
    const [loadedReferences, loadedFavorites, loadedFolders] = await Promise.all([
      repository.listPrivateReferences(),
      repository.listFavorites(),
      repository.listFavoriteFolders(),
    ])
    return {
      references: sortByUpdatedAt(loadedReferences),
      favorites: sortByUpdatedAt(loadedFavorites),
      folders: sortByUpdatedAt(loadedFolders),
    }
  }

  const applySnapshot = (snapshot: LibrarySnapshot) => {
    references.value = snapshot.references
    favorites.value = snapshot.favorites
    folders.value = snapshot.folders
  }

  const load = () => {
    if (loadRequest?.generation === snapshotGeneration) {
      return loadRequest.promise
    }

    const requestGeneration = snapshotGeneration
    const request: LoadRequest = {
      generation: requestGeneration,
      promise: Promise.resolve(),
    }
    loading.value = true
    error.value = null
    request.promise = (async () => {
      try {
        const snapshot = await fetchSnapshot()
        if (requestGeneration === snapshotGeneration) {
          applySnapshot(snapshot)
          initialized.value = true
        }
      } catch (caught) {
        if (requestGeneration === snapshotGeneration) {
          error.value = hairstyleLibraryErrorMessage(caught, 'load')
        }
      } finally {
        if (requestGeneration === snapshotGeneration) {
          loading.value = false
        }
        if (loadRequest === request) {
          loadRequest = null
        }
      }
    })()
    loadRequest = request
    return request.promise
  }

  const mutate = async <Value>(
    operation: () => Promise<Value>,
    apply: (value: Value) => void,
    requiresInitializedSnapshot = false,
  ): Promise<MutationResult<Value>> => {
    if (saving.value || (requiresInitializedSnapshot && !initialized.value)) {
      return { ok: false }
    }

    snapshotGeneration += 1
    loading.value = false
    saving.value = true
    error.value = null
    try {
      const value = await operation()
      apply(value)
      return { ok: true, value }
    } catch (caught) {
      error.value = hairstyleLibraryErrorMessage(caught)
      return { ok: false }
    } finally {
      saving.value = false
    }
  }

  const getReference = (id: string) => references.value.find((item) => item.id === id)
  const isFavorite = (itemKey: string) => favoriteKeys.value.has(itemKey)

  const saveReference = async (write: PrivateHairstyleReferenceWrite) => {
    const result = await mutate(
      () => repository.savePrivateReference(write),
      (saved) => {
        references.value = sortByUpdatedAt([
          ...references.value.filter(({ id }) => id !== saved.id),
          saved,
        ])
      },
    )
    return result.ok ? result.value : null
  }

  const updateReference = async (
    id: string,
    write: PrivateHairstyleReferenceDetailsWrite,
  ) => {
    const result = await mutate(
      () => repository.updatePrivateReference(id, write),
      (updated) => {
        references.value = sortByUpdatedAt([
          ...references.value.filter((item) => item.id !== updated.id),
          updated,
        ])
      },
    )
    return result.ok ? result.value : null
  }

  const replaceReferenceImage = async (
    id: string,
    write: PrivateHairstyleReferenceImageWrite,
  ) => {
    const result = await mutate(
      () => repository.replaceReferenceImage(id, write),
      (updated) => {
        references.value = sortByUpdatedAt([
          ...references.value.filter((item) => item.id !== updated.id),
          updated,
        ])
      },
    )
    return result.ok ? result.value : null
  }

  const deleteReference = async (id: string) => {
    const result = await mutate(
      () => repository.deletePrivateReference(id),
      () => {
        references.value = references.value.filter((item) => item.id !== id)
        favorites.value = favorites.value.filter(
          ({ itemKey }) => itemKey !== `private_reference:${id}`,
        )
      },
    )
    return result.ok
  }

  const toggleFavorite = async (
    target: HairstyleFavoriteTarget,
    folderId: string | null = null,
  ) => {
    const itemKey = `${target.itemType}:${target.itemId}`
    const result = await mutate(
      () => repository.toggleFavorite(target, folderId),
      (saved) => {
        favorites.value = saved
          ? sortByUpdatedAt([
              ...favorites.value.filter((item) => item.itemKey !== saved.itemKey),
              saved,
            ])
          : favorites.value.filter((item) => item.itemKey !== itemKey)
      },
      true,
    )
    return result.ok ? result.value : null
  }

  const moveFavorite = async (
    target: HairstyleFavoriteTarget,
    folderId: string | null,
  ) => {
    const result = await mutate(
      () => repository.moveFavorite(target, folderId),
      (updated) => {
        favorites.value = sortByUpdatedAt([
          ...favorites.value.filter((item) => item.itemKey !== updated.itemKey),
          updated,
        ])
      },
      true,
    )
    return result.ok ? result.value : null
  }

  const saveFolder = async (write: FavoriteFolderWrite) => {
    const result = await mutate(
      () => repository.saveFavoriteFolder(write),
      (saved) => {
        folders.value = sortByUpdatedAt([
          ...folders.value.filter(({ id }) => id !== saved.id),
          saved,
        ])
      },
      true,
    )
    return result.ok ? result.value : null
  }

  const renameFolder = async (id: string, write: FavoriteFolderWrite) => {
    const result = await mutate(
      () => repository.renameFavoriteFolder(id, write),
      (updated) => {
        folders.value = sortByUpdatedAt([
          ...folders.value.filter((item) => item.id !== updated.id),
          updated,
        ])
      },
      true,
    )
    return result.ok ? result.value : null
  }

  const deleteFolder = async (id: string) => {
    const result = await mutate(
      () => repository.deleteFavoriteFolder(id),
      () => {
        folders.value = folders.value.filter((item) => item.id !== id)
        favorites.value = favorites.value.map((item) => (
          item.folderId === id ? { ...item, folderId: null } : item
        ))
      },
      true,
    )
    return result.ok
  }

  return {
    references,
    favorites,
    folders,
    loading,
    saving,
    initialized,
    error,
    load,
    getReference,
    isFavorite,
    saveReference,
    updateReference,
    replaceReferenceImage,
    deleteReference,
    toggleFavorite,
    moveFavorite,
    saveFolder,
    renameFolder,
    deleteFolder,
  }
})

export const defaultHairstyleLibraryRepository = new HairstyleLibraryRepository(defaultArchiveDb)
export const useHairstyleLibraryStore = createHairstyleLibraryStore(
  defaultHairstyleLibraryRepository,
)
