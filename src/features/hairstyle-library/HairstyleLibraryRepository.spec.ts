/// <reference types="node" />

import { Blob as NodeBlob, File as NodeFile } from 'node:buffer'
import { createHash } from 'node:crypto'

import { IDBKeyRange, indexedDB } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { ArchiveRepository, ArchiveStorageError, ZajianfaDb } from '../archive'
import type { HairProfile } from '../archive/types'
import { HairstyleLibraryRepository } from './HairstyleLibraryRepository'

const NOW = '2026-08-10T08:00:00.000Z'
const PROCESSED_AT = '2026-08-10T07:00:00.000Z'

const preparedImage = (
  contents = 'prepared-reference',
  type: 'image/webp' | 'image/jpeg' = 'image/webp',
) => {
  const image = new NodeBlob([contents], { type }) as unknown as Blob
  return {
    image,
    width: 900,
    height: 1200,
    bytes: image.size,
    processedAt: PROCESSED_AT,
  }
}

const referenceWrite = (overrides: Record<string, unknown> = {}) => ({
  name: '齐颌短发参考',
  notes: '两侧保留重量，不要推白。',
  tags: ['低维护', '戴眼镜'],
  ...preparedImage(),
  ...overrides,
})

const deviceProfile: HairProfile = {
  id: 'profile-1',
  name: '我的档案',
  hairTexture: 'straight',
  strandThickness: 'medium',
  density: 'medium',
  stylingMinutes: 10,
  washFrequency: 'every_other_day',
  preferenceNotes: '',
  createdAt: NOW,
  updatedAt: NOW,
}

describe('HairstyleLibraryRepository', () => {
  let dbName: string
  let db: ZajianfaDb
  let repository: HairstyleLibraryRepository
  let createdIds: string[]

  const openDb = () => new ZajianfaDb(dbName, { indexedDB, IDBKeyRange })

  const openRepository = (database = db) => new HairstyleLibraryRepository(database, {
    now: () => new Date(NOW),
    createId: () => createdIds.shift() ?? crypto.randomUUID(),
  })

  beforeEach(() => {
    dbName = `zajianfa-library-${crypto.randomUUID()}`
    db = openDb()
    createdIds = ['reference-1', 'reference-2', 'folder-1', 'folder-2', 'favorite-1', 'favorite-2']
    repository = openRepository()
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    db.close()
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(dbName)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
      request.onblocked = () => reject(new Error(`Database deletion blocked: ${dbName}`))
    })
  })

  test('persists a prepared reference with a real SHA-256 and reopens its Blob bytes', async () => {
    const write = referenceWrite()
    const expectedFingerprint = createHash('sha256')
      .update(Buffer.from(await write.image.arrayBuffer()))
      .digest('hex')

    const saved = await repository.savePrivateReference(write)

    expect(saved).toMatchObject({
      id: 'reference-1',
      fingerprint: expectedFingerprint,
      name: '齐颌短发参考',
      notes: '两侧保留重量,不要推白。',
      tags: ['低维护', '戴眼镜'],
      width: 900,
      height: 1200,
      bytes: write.image.size,
      processedAt: PROCESSED_AT,
      createdAt: NOW,
      updatedAt: NOW,
    })
    expect(saved.fingerprint).toMatch(/^[a-f0-9]{64}$/u)

    db.close()
    db = openDb()
    repository = openRepository()

    const reopened = await repository.getPrivateReference('reference-1')
    expect(reopened?.image.type).toBe('image/webp')
    expect(await reopened?.image.text()).toBe('prepared-reference')
    expect(reopened?.fingerprint).toBe(expectedFingerprint)
  })

  test('rebuilds input bytes as a plain Blob so a forged File name is never persisted', async () => {
    const source = new NodeFile(
      ['private-file-bytes'],
      'original-private-filename.jpg',
      { type: 'image/jpeg' },
    ) as unknown as File

    const saved = await repository.savePrivateReference(referenceWrite({
      image: source,
      bytes: source.size,
    }))

    expect(saved.image).not.toBe(source)
    expect(saved.image).not.toHaveProperty('name')
    expect(saved.image.type).toBe('image/jpeg')
    expect(await saved.image.text()).toBe('private-file-bytes')

    db.close()
    db = openDb()
    repository = openRepository()
    const reopened = await repository.getPrivateReference(saved.id)
    expect(reopened?.image).not.toHaveProperty('name')
    expect(await reopened?.image.text()).toBe('private-file-bytes')
  })

  test('rejects forged repository-owned fields and duplicate prepared bytes', async () => {
    await repository.savePrivateReference(referenceWrite())

    await expect(repository.savePrivateReference(referenceWrite({
      fingerprint: 'forged-fingerprint',
    }) as never)).rejects.toThrow(/fingerprint/u)
    await expect(repository.savePrivateReference(referenceWrite({
      id: 'forged-id',
    }) as never)).rejects.toThrow(/id/u)
    await expect(repository.savePrivateReference(referenceWrite({
      createdAt: '2000-01-01T00:00:00.000Z',
    }) as never)).rejects.toThrow(/createdAt/u)
    await expect(repository.savePrivateReference(referenceWrite()))
      .rejects.toThrow(/already exists/u)

    expect(await repository.listPrivateReferences()).toHaveLength(1)
  })

  test.each([
    ['unsupported MIME', { ...preparedImage('png'), image: new NodeBlob(['png'], { type: 'image/png' }) as unknown as Blob }],
    ['empty image', preparedImage('')],
    ['mismatched byte count', { ...preparedImage(), bytes: 999 }],
    ['non-integer width', { ...preparedImage(), width: 900.5 }],
    ['zero height', { ...preparedImage(), height: 0 }],
    ['long edge over 1920px', { ...preparedImage(), height: 1921 }],
    ['oversized bytes', (() => {
      const image = new NodeBlob([new Uint8Array(1_500_001)], { type: 'image/webp' }) as unknown as Blob
      return { ...preparedImage(), image, bytes: image.size }
    })()],
    ['invalid processed time', { ...preparedImage(), processedAt: 'not-a-date' }],
  ])('rejects an invalid prepared image: %s', async (_label, image) => {
    await expect(repository.savePrivateReference(referenceWrite(image)))
      .rejects.toBeInstanceOf(RangeError)
    expect(await repository.listPrivateReferences()).toEqual([])
  })

  test.each([
    ['empty name', { name: '   ' }],
    ['name over 40 characters', { name: '发'.repeat(41) }],
    ['notes over 300 characters', { notes: '记'.repeat(301) }],
    ['more than eight tags', { tags: Array.from({ length: 9 }, (_, index) => `标签${index}`) }],
    ['empty tag', { tags: ['有效', '   '] }],
    ['tag over 12 characters', { tags: ['标'.repeat(13)] }],
  ])('rejects invalid reference text: %s', async (_label, fields) => {
    await expect(repository.savePrivateReference(referenceWrite(fields)))
      .rejects.toBeInstanceOf(RangeError)
  })

  test('normalizes NFKC text and removes normalized duplicate tags', async () => {
    const saved = await repository.savePrivateReference(referenceWrite({
      name: '  ＡＢ短发  ',
      notes: 'ｎｏｔｅｓ',
      tags: ['  Ａ  ', 'A', 'ｂ', 'B'],
    }))

    expect(saved.name).toBe('AB短发')
    expect(saved.notes).toBe('notes')
    expect(saved.tags).toEqual(['A', 'b'])
  })

  test('updates reference text without changing any image field or byte', async () => {
    const saved = await repository.savePrivateReference(referenceWrite())
    const updated = await repository.updatePrivateReference(saved.id, {
      name: '  新名称 ',
      notes: '新备注',
      tags: [' 通勤 ', '通勤'],
    })

    expect(updated).toMatchObject({
      id: saved.id,
      fingerprint: saved.fingerprint,
      name: '新名称',
      notes: '新备注',
      tags: ['通勤'],
      width: saved.width,
      height: saved.height,
      bytes: saved.bytes,
      processedAt: saved.processedAt,
      createdAt: saved.createdAt,
      updatedAt: NOW,
    })
    expect(await updated.image.text()).toBe('prepared-reference')
  })

  test('replaces an image with a newly computed fingerprint and all prepared metadata', async () => {
    const saved = await repository.savePrivateReference(referenceWrite())
    const replacement = {
      ...preparedImage('replacement', 'image/jpeg'),
      width: 720,
      height: 960,
      processedAt: '2026-08-10T07:30:00.000Z',
    }

    const updated = await repository.replaceReferenceImage(saved.id, replacement)
    const expectedFingerprint = createHash('sha256')
      .update(Buffer.from(await replacement.image.arrayBuffer()))
      .digest('hex')

    expect(updated).toMatchObject({
      id: saved.id,
      fingerprint: expectedFingerprint,
      width: 720,
      height: 960,
      bytes: replacement.image.size,
      processedAt: replacement.processedAt,
      name: saved.name,
      notes: saved.notes,
      tags: saved.tags,
      createdAt: saved.createdAt,
      updatedAt: NOW,
    })
    expect(updated.image.type).toBe('image/jpeg')
    expect(await updated.image.text()).toBe('replacement')
  })

  test('keeps every old image field and byte on replace conflicts, invalid input, or hash failure', async () => {
    const first = await repository.savePrivateReference(referenceWrite())
    const secondImage = preparedImage('second-reference')
    await repository.savePrivateReference(referenceWrite({
      name: '第二张参考',
      ...secondImage,
    }))
    const snapshot = await repository.getPrivateReference(first.id)

    await expect(repository.replaceReferenceImage(first.id, secondImage))
      .rejects.toThrow(/already exists/u)
    await expect(repository.replaceReferenceImage(first.id, {
      ...preparedImage('invalid-replacement'),
      bytes: 1,
    })).rejects.toBeInstanceOf(RangeError)
    vi.spyOn(crypto.subtle, 'digest').mockRejectedValueOnce(new Error('hash failed'))
    await expect(repository.replaceReferenceImage(first.id, preparedImage('hash-failure')))
      .rejects.toThrow('hash failed')

    const restored = await repository.getPrivateReference(first.id)
    expect(restored).toMatchObject({
      id: snapshot?.id,
      fingerprint: snapshot?.fingerprint,
      width: snapshot?.width,
      height: snapshot?.height,
      bytes: snapshot?.bytes,
      processedAt: snapshot?.processedAt,
      name: snapshot?.name,
      notes: snapshot?.notes,
      tags: snapshot?.tags,
      createdAt: snapshot?.createdAt,
      updatedAt: snapshot?.updatedAt,
    })
    expect(await restored?.image.text()).toBe('prepared-reference')
  })

  test('toggles one favorite per derived item key and moves it to a real folder', async () => {
    createdIds = ['favorite-1', 'folder-1']
    const target = { itemType: 'curated_style' as const, itemId: 'lin-bob' }
    const favorite = await repository.toggleFavorite(target)

    expect(favorite).toEqual({
      id: 'favorite-1',
      itemType: 'curated_style',
      itemId: 'lin-bob',
      itemKey: 'curated_style:lin-bob',
      folderId: null,
      createdAt: NOW,
      updatedAt: NOW,
    })
    expect(await repository.listFavorites()).toEqual([favorite])

    const folder = await repository.saveFavoriteFolder({ name: '  想剪  ' })
    const moved = await repository.moveFavorite(target, folder.id)
    expect(moved.folderId).toBe(folder.id)
    expect((await repository.listFavorites())[0]?.itemKey).toBe('curated_style:lin-bob')

    expect(await repository.toggleFavorite(target)).toBeNull()
    expect(await repository.listFavorites()).toEqual([])
  })

  test('requires an existing private reference and folder for favorite writes', async () => {
    await expect(repository.toggleFavorite({
      itemType: 'private_reference',
      itemId: 'missing-reference',
    })).rejects.toThrow(/reference not found/u)
    await expect(repository.toggleFavorite({
      itemType: 'curated_style',
      itemId: 'lin-bob',
    }, 'missing-folder')).rejects.toThrow(/folder not found/u)
  })

  test('normalizes folder names, enforces 1–24 characters and normalized uniqueness', async () => {
    createdIds = ['folder-1', 'folder-2']
    const folder = await repository.saveFavoriteFolder({ name: '  Ｍy发型  ' })
    expect(folder).toMatchObject({ id: 'folder-1', name: 'My发型' })

    await expect(repository.saveFavoriteFolder({ name: 'My发型' }))
      .rejects.toThrow(/already exists/u)
    await expect(repository.saveFavoriteFolder({ name: '   ' }))
      .rejects.toBeInstanceOf(RangeError)
    await expect(repository.saveFavoriteFolder({ name: '夹'.repeat(25) }))
      .rejects.toBeInstanceOf(RangeError)

    const renamed = await repository.renameFavoriteFolder(folder.id, { name: ' 通勤 ' })
    expect(renamed).toMatchObject({ id: folder.id, name: '通勤', createdAt: NOW, updatedAt: NOW })
  })

  test('deleting a folder atomically moves its favorites to ungrouped', async () => {
    createdIds = ['folder-1', 'favorite-1']
    const folder = await repository.saveFavoriteFolder({ name: '想剪' })
    const target = { itemType: 'curated_style' as const, itemId: 'lin-bob' }
    await repository.toggleFavorite(target, folder.id)

    await repository.deleteFavoriteFolder(folder.id)

    expect(await repository.listFavoriteFolders()).toEqual([])
    expect(await repository.listFavorites()).toMatchObject([{
      itemKey: 'curated_style:lin-bob',
      folderId: null,
    }])
  })

  test('rolls back favorite moves when folder deletion fails after the move', async () => {
    createdIds = ['folder-1', 'favorite-1']
    const folder = await repository.saveFavoriteFolder({ name: '想剪' })
    const target = { itemType: 'curated_style' as const, itemId: 'lin-bob' }
    await repository.toggleFavorite(target, folder.id)
    db.favoriteFolders.hook('deleting', () => {
      throw new Error('folder delete failed')
    })

    await expect(repository.deleteFavoriteFolder(folder.id)).rejects.toThrow('folder delete failed')
    expect(await repository.getFavoriteFolder(folder.id)).toBeDefined()
    expect((await repository.listFavorites())[0]?.folderId).toBe(folder.id)
  })

  test('deleting a private reference removes only its own favorite and leaves plan snapshots alone', async () => {
    createdIds = ['reference-1', 'favorite-private', 'favorite-curated']
    const reference = await repository.savePrivateReference(referenceWrite())
    await repository.toggleFavorite({
      itemType: 'private_reference',
      itemId: reference.id,
    })
    await repository.toggleFavorite({
      itemType: 'curated_style',
      itemId: reference.id,
    })

    await repository.deletePrivateReference(reference.id)

    expect(await repository.getPrivateReference(reference.id)).toBeUndefined()
    expect(await repository.listFavorites()).toMatchObject([{
      itemType: 'curated_style',
      itemId: reference.id,
    }])
  })

  test('rolls back reference deletion when its favorite cannot be deleted', async () => {
    createdIds = ['reference-1', 'favorite-private']
    const reference = await repository.savePrivateReference(referenceWrite())
    await repository.toggleFavorite({
      itemType: 'private_reference',
      itemId: reference.id,
    })
    db.privateReferences.hook('deleting', () => {
      throw new Error('reference delete failed')
    })

    await expect(repository.deletePrivateReference(reference.id)).rejects.toThrow('reference delete failed')
    expect(await repository.getPrivateReference(reference.id)).toBeDefined()
    expect(await repository.listFavorites()).toHaveLength(1)
  })

  test('keeps the device-level library when an archive profile is deleted', async () => {
    const reference = await repository.savePrivateReference(referenceWrite())
    const archive = new ArchiveRepository(db)
    await archive.createProfile(deviceProfile)

    await archive.deleteProfile(deviceProfile.id)

    expect(await repository.getPrivateReference(reference.id)).toMatchObject({ id: reference.id })
  })

  test('maps quota and unavailable failures through ArchiveStorageError and rethrows unrelated errors', async () => {
    vi.spyOn(db.privateReferences, 'add').mockRejectedValueOnce(
      new DOMException('Storage is full', 'QuotaExceededError'),
    )
    await expect(repository.savePrivateReference(referenceWrite())).rejects.toMatchObject({
      name: 'ArchiveStorageError',
      code: 'quota_exceeded',
    })

    vi.spyOn(db.privateReferences, 'toArray').mockRejectedValueOnce(
      new DOMException('IndexedDB unavailable', 'InvalidStateError'),
    )
    await expect(repository.listPrivateReferences()).rejects.toMatchObject({
      name: 'ArchiveStorageError',
      code: 'unavailable',
    })

    const unrelated = new Error('programmer failure')
    vi.spyOn(db.favoriteFolders, 'toArray').mockRejectedValueOnce(unrelated)
    await expect(repository.listFavoriteFolders()).rejects.toBe(unrelated)
    expect(new ArchiveStorageError('unavailable', unrelated).cause).toBe(unrelated)
  })
})
