import { Blob as NodeBlob } from 'node:buffer'

import 'fake-indexeddb/auto'
import { afterEach, describe, expect, test } from 'vitest'

import { ZajianfaDb } from './ArchiveRepository'
import { exportLocalBackup, importLocalBackup } from './localBackup'

const created: ZajianfaDb[] = []

const database = () => {
  const db = new ZajianfaDb(`backup-test-${crypto.randomUUID()}`)
  created.push(db)
  return db
}

afterEach(async () => {
  await Promise.all(created.splice(0).map(async (db) => {
    db.close()
    await db.delete()
  }))
})

describe('local backup', () => {
  test('round-trips structured rows and private image bytes in one local file', async () => {
    const source = database()
    const image = new NodeBlob(['private-hair-photo'], { type: 'image/webp' }) as unknown as Blob
    await source.profiles.add({
      id: 'profile-1',
      name: '小林',
      hairTexture: 'unsure',
      strandThickness: 'unsure',
      density: 'unsure',
      stylingMinutes: null,
      washFrequency: 'unsure',
      preferenceNotes: '',
      profilePhotos: [{
        id: 'profile-photo:front',
        angle: 'front',
        image,
        width: 800,
        height: 1000,
        bytes: image.size,
        processedAt: '2026-08-11T00:00:00.000Z',
      }],
      createdAt: '2026-08-11T00:00:00.000Z',
      updatedAt: '2026-08-11T00:00:00.000Z',
    })
    await source.favoriteFolders.add({
      id: 'folder-1',
      name: '下次想剪',
      createdAt: '2026-08-11T00:00:00.000Z',
      updatedAt: '2026-08-11T00:00:00.000Z',
    })

    const backup = await exportLocalBackup(source, new Date('2026-08-11T01:00:00.000Z'))
    const target = database()
    await importLocalBackup(
      target,
      backup,
      (parts, options) => new NodeBlob(
        parts as unknown as ArrayBuffer[],
        options,
      ) as unknown as Blob,
    )

    expect(await target.profiles.get('profile-1')).toMatchObject({ name: '小林' })
    const restoredPhoto = (await target.profiles.get('profile-1'))?.profilePhotos?.[0]
    expect(await restoredPhoto?.image.text()).toBe('private-hair-photo')
    expect(await target.favoriteFolders.get('folder-1')).toMatchObject({ name: '下次想剪' })
  })

  test('rejects an unrelated JSON file without changing existing data', async () => {
    const db = database()
    await db.favoriteFolders.add({
      id: 'keep',
      name: '保留',
      createdAt: '2026-08-11T00:00:00.000Z',
      updatedAt: '2026-08-11T00:00:00.000Z',
    })

    await expect(importLocalBackup(db, '{"format":"other"}')).rejects.toThrow(/备份文件/)
    expect(await db.favoriteFolders.get('keep')).toBeDefined()
  })
})
