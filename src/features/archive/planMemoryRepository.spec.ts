/// <reference types="node" />

import { Blob as NodeBlob } from 'node:buffer'

import Dexie from 'dexie'
import { IDBKeyRange, indexedDB } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import { ArchiveRepository, ZajianfaDb } from './ArchiveRepository'
import { exportLocalBackup, importLocalBackup } from './localBackup'
import { curatedHairstyles } from '../hairstyle-library/curatedCatalog'
import type {
  Candidate,
  HairProfile,
  HaircutPlan,
  HaircutRecord,
  PlanMemoryItem,
} from './types'

const localPhotoImage = new NodeBlob(['local-photo'], { type: 'image/webp' }) as unknown as Blob

const catalogDemoPath = (order: number) => (
  curatedHairstyles[(order - 1) % curatedHairstyles.length]!.coverImage
)

const profile = (overrides: Partial<HairProfile> = {}): HairProfile => ({
  id: 'profile-1',
  name: '我的档案',
  hairTexture: 'straight',
  strandThickness: 'medium',
  density: 'medium',
  stylingMinutes: 10,
  washFrequency: 'every_other_day',
  preferenceNotes: '希望容易打理',
  createdAt: '2026-08-10T01:00:00.000Z',
  updatedAt: '2026-08-10T01:00:00.000Z',
  ...overrides,
})

const plan = (overrides: Partial<HaircutPlan> = {}): HaircutPlan => ({
  id: 'plan-1',
  profileId: 'profile-1',
  title: '下次短发计划',
  date: '2026-08-10T02:00:00.000Z',
  mode: 'exploration',
  status: 'draft',
  createdAt: '2026-08-10T02:00:00.000Z',
  updatedAt: '2026-08-10T02:00:00.000Z',
  ...overrides,
})

const candidate = (
  order: number,
  overrides: Partial<Candidate> = {},
): Candidate => ({
  id: `candidate-${order}`,
  planId: 'plan-1',
  order,
  name: `候选 ${order}`,
  notes: `候选 ${order} 的决策备注`,
  source: 'demo_ai',
  demoImagePath: catalogDemoPath(order),
  ...overrides,
})

const memoryItem = (
  order: number,
  overrides: Partial<PlanMemoryItem> = {},
): PlanMemoryItem => ({
  id: `memory-${order}`,
  profileId: 'profile-1',
  planId: 'plan-1',
  order,
  kind: 'avoid',
  text: `避雷条目 ${order}`,
  originalText: `避雷条目 ${order}`,
  source: 'avoid_rule',
  sourceRecordId: 'record-1',
  sourceRecordDate: '2026-08-01',
  sourceLabel: '翻车发型',
  createdAt: '2026-08-10T02:00:00.000Z',
  updatedAt: '2026-08-10T02:00:00.000Z',
  ...overrides,
})

const avoidRecord = (overrides: Partial<HaircutRecord> = {}): HaircutRecord => ({
  id: 'record-1',
  profileId: 'profile-1',
  date: '2026-08-01',
  status: 'completed',
  satisfaction: 2,
  outcome: 'avoid',
  styleName: '翻车发型',
  avoidRules: ['两侧不要推白'],
  createdAt: '2026-08-01T10:00:00.000Z',
  updatedAt: '2026-08-01T10:00:00.000Z',
  ...overrides,
} as HaircutRecord)

describe('plan memory persistence', () => {
  let dbName: string
  let databases: ZajianfaDb[]
  let db: ZajianfaDb
  let repository: ArchiveRepository

  const openDatabase = () => {
    const next = new ZajianfaDb(dbName, { indexedDB, IDBKeyRange })
    databases.push(next)
    return next
  }

  beforeEach(() => {
    dbName = `zajianfa-memory-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    databases = []
    db = openDatabase()
    repository = new ArchiveRepository(db)
  })

  afterEach(async () => {
    for (const database of databases) {
      database.close()
    }
    await Dexie.delete(dbName, { indexedDB })
  })

  const seedProfile = () => repository.createProfile(profile())

  test('upgrades a v3 database to v4 without touching existing rows', async () => {
    db.close()
    databases = []
    const legacy = new Dexie(dbName, { indexedDB, IDBKeyRange })
    legacy.version(3).stores({
      profiles: 'id, updatedAt',
      plans: 'id, profileId, date, status, updatedAt',
      candidates: 'id, planId, &[planId+order]',
      briefs: 'id, &planId, profileId',
      records: 'id, profileId, planId, date, status',
      photos: 'id, recordId, stage',
      avoidRules: 'id, profileId, recordId',
      standardStyles: 'id, profileId, recordId',
      privateReferences: 'id, &fingerprint, updatedAt',
      favoriteFolders: 'id, &name, updatedAt',
      favorites: 'id, folderId, &itemKey, updatedAt',
    })
    await legacy.open()
    await legacy.table('profiles').add(profile())
    await legacy.table('plans').add(plan())
    await legacy.table('candidates').bulkAdd([candidate(1), candidate(2)])
    await legacy.table('photos').add({
      id: 'photo-1',
      recordId: 'record-1',
      stage: 'after',
      image: localPhotoImage,
      capturedAt: '2026-08-01T10:00:00.000Z',
    })
    legacy.close()

    const upgraded = openDatabase()
    await upgraded.open()
    expect(upgraded.verno).toBe(4)
    expect(await upgraded.plans.get('plan-1')).toMatchObject({ title: '下次短发计划' })
    expect(await upgraded.candidates.count()).toBe(2)
    const photo = await upgraded.photos.get('photo-1')
    expect(photo?.image.size).toBe(localPhotoImage.size)
    expect(await upgraded.planMemoryItems.count()).toBe(0)
  })

  test('saves plan, candidates, and memory items in one transaction', async () => {
    await seedProfile()
    const items = [memoryItem(1), memoryItem(2, { kind: 'adjustment', source: 'adjustment_note' })]
    await repository.savePlanWithCandidates(plan(), [candidate(1), candidate(2)], items)

    const saved = await repository.listPlanMemoryItems('plan-1')
    expect(saved.map(({ id }) => id)).toEqual(['memory-1', 'memory-2'])
  })

  test('rolls back the plan when memory items fail inside the transaction', async () => {
    await seedProfile()
    await repository.savePlanWithCandidates(
      plan(),
      [candidate(1), candidate(2)],
      [memoryItem(1)],
    )

    const conflicting = plan({ id: 'plan-2' })
    await expect(repository.savePlanWithCandidates(
      conflicting,
      [
        candidate(1, { id: 'candidate-3', planId: 'plan-2' }),
        candidate(2, { id: 'candidate-4', planId: 'plan-2', demoImagePath: catalogDemoPath(3) }),
      ],
      [memoryItem(1, { planId: 'plan-2' })],
    )).rejects.toThrow()

    expect(await repository.getPlan('plan-2')).toBeUndefined()
    expect(await repository.listCandidates('plan-2')).toEqual([])
    expect(await repository.listPlanMemoryItems('plan-2')).toEqual([])
  })

  test('replaces only the edited plan memory set', async () => {
    await seedProfile()
    await repository.savePlanWithCandidates(plan(), [candidate(1), candidate(2)], [memoryItem(1)])
    await repository.savePlanWithCandidates(
      plan({ id: 'plan-2' }),
      [
        candidate(1, { id: 'candidate-3', planId: 'plan-2' }),
        candidate(2, { id: 'candidate-4', planId: 'plan-2', demoImagePath: catalogDemoPath(3) }),
      ],
      [memoryItem(9, { id: 'memory-other', planId: 'plan-2' })],
    )

    await repository.savePlanWithCandidates(
      plan(),
      [candidate(1), candidate(2)],
      [memoryItem(1, { text: '改过的避雷' }), memoryItem(2)],
    )

    expect((await repository.listPlanMemoryItems('plan-1')).map(({ text }) => text))
      .toEqual(['改过的避雷', '避雷条目 2'])
    expect((await repository.listPlanMemoryItems('plan-2')).map(({ id }) => id))
      .toEqual(['memory-other'])
  })

  test('saving a plan without memories clears its previous snapshot', async () => {
    await seedProfile()
    await repository.savePlanWithCandidates(plan(), [candidate(1), candidate(2)], [memoryItem(1)])
    await repository.savePlanWithCandidates(plan(), [candidate(1), candidate(2)], [])
    expect(await repository.listPlanMemoryItems('plan-1')).toEqual([])
  })

  test('deleting a plan cascades to its memory items', async () => {
    await seedProfile()
    await repository.savePlanWithCandidates(plan(), [candidate(1), candidate(2)], [memoryItem(1)])
    await repository.deletePlan('plan-1')
    expect(await repository.listPlanMemoryItems('plan-1')).toEqual([])
  })

  test('deleting a profile cascades to its plan memory items', async () => {
    await seedProfile()
    await repository.savePlanWithCandidates(plan(), [candidate(1), candidate(2)], [memoryItem(1)])
    await repository.deleteProfile('profile-1')
    expect(await db.planMemoryItems.count()).toBe(0)
  })

  test('deleting a source record keeps the plan memory snapshot', async () => {
    await seedProfile()
    await repository.saveRecordWithPhotos(avoidRecord(), [{
      id: 'photo-1',
      recordId: 'record-1',
      stage: 'after',
      image: localPhotoImage,
      capturedAt: '2026-08-01T10:00:00.000Z',
    }])
    await repository.savePlanWithCandidates(plan(), [candidate(1), candidate(2)], [memoryItem(1)])
    await repository.deleteRecord('record-1')
    expect((await repository.listPlanMemoryItems('plan-1')).map(({ id }) => id))
      .toEqual(['memory-1'])
  })

  test('rejects invalid memory items before writing anything', async () => {
    await seedProfile()
    const base = [candidate(1), candidate(2)]

    await expect(repository.savePlanWithCandidates(plan(), base, [
      memoryItem(1, { profileId: 'someone-else' }),
    ])).rejects.toThrow(/memory/i)
    await expect(repository.savePlanWithCandidates(plan(), base, [
      memoryItem(1, { planId: 'other-plan' }),
    ])).rejects.toThrow(/memory/i)
    await expect(repository.savePlanWithCandidates(plan(), base, [
      memoryItem(1, { text: '   ' }),
    ])).rejects.toThrow(/memory/i)
    await expect(repository.savePlanWithCandidates(plan(), base, [
      memoryItem(1, { text: '长'.repeat(161) }),
    ])).rejects.toThrow(/memory/i)
    await expect(repository.savePlanWithCandidates(plan(), base, [
      memoryItem(1),
      memoryItem(2, { id: 'memory-1' }),
    ])).rejects.toThrow(/memory/i)
    await expect(repository.savePlanWithCandidates(plan(), base, [
      memoryItem(1),
      memoryItem(1, { id: 'memory-2' }),
    ])).rejects.toThrow(/memory/i)
    await expect(repository.savePlanWithCandidates(plan(), base, [
      memoryItem(1, { kind: 'magic' as PlanMemoryItem['kind'] }),
    ])).rejects.toThrow(/memory/i)
    await expect(repository.savePlanWithCandidates(plan(), base, [
      memoryItem(1, { source: 'guess' as PlanMemoryItem['source'] }),
    ])).rejects.toThrow(/memory/i)

    expect(await repository.getPlan('plan-1')).toBeUndefined()
    expect(await repository.listPlanMemoryItems('plan-1')).toEqual([])
  })

  test('enforces the per-group limit of three items', async () => {
    await seedProfile()
    await expect(repository.savePlanWithCandidates(plan(), [candidate(1), candidate(2)], [
      memoryItem(1),
      memoryItem(2),
      memoryItem(3),
      memoryItem(4),
    ])).rejects.toThrow(/memory/i)
  })

  test('exports and reimports plan memory items in local backups', async () => {
    await seedProfile()
    await repository.savePlanWithCandidates(plan(), [candidate(1), candidate(2)], [memoryItem(1)])

    const backup = await exportLocalBackup(db)
    expect(JSON.parse(backup).tables.planMemoryItems).toHaveLength(1)

    await db.planMemoryItems.clear()
    await importLocalBackup(db, backup, (parts, options) => (
      new NodeBlob(parts as ConstructorParameters<typeof NodeBlob>[0], options) as unknown as Blob
    ))
    expect((await repository.listPlanMemoryItems('plan-1')).map(({ id }) => id))
      .toEqual(['memory-1'])
  })

  test('imports a legacy backup without plan memories as an empty table', async () => {
    await seedProfile()
    await repository.savePlanWithCandidates(plan(), [candidate(1), candidate(2)], [memoryItem(1)])

    const backup = JSON.parse(await exportLocalBackup(db)) as {
      tables: Record<string, unknown[]>
    }
    delete backup.tables.planMemoryItems

    await importLocalBackup(db, JSON.stringify(backup), (parts, options) => (
      new NodeBlob(parts as ConstructorParameters<typeof NodeBlob>[0], options) as unknown as Blob
    ))
    expect(await db.planMemoryItems.count()).toBe(0)
    expect(await db.profiles.count()).toBe(1)
  })
})
