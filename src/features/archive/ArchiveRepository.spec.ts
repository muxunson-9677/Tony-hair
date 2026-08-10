/// <reference types="node" />

import { Blob as NodeBlob } from 'node:buffer'
import { createHash } from 'node:crypto'

import Dexie from 'dexie'
import { IDBKeyRange, indexedDB } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { curatedHairstyles } from '../hairstyle-library/curatedCatalog'
import {
  ArchiveRepository,
  ArchiveStorageError,
  ZajianfaDb,
} from './index'
import type {
  BarberBrief,
  BarberBriefWrite,
  Candidate,
  HairProfile,
  HaircutPhoto,
  HaircutPlan,
  HaircutRecord,
} from './types'
import { isValidPlanCandidateCount } from './types'

const defaultPhotoImage = new NodeBlob(
  ['local-photo'],
  { type: 'image/webp' },
) as unknown as Blob

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

const brief = (overrides: Partial<BarberBrief> = {}): BarberBriefWrite => ({
  id: 'brief-1',
  profileId: 'profile-1',
  planId: 'plan-1',
  targetCandidateId: 'candidate-1',
  overall: '整体轻盈、利落',
  top: '保留支撑感',
  fringe: '自然露额',
  sides: '贴合但不推白',
  sideburns: '保留自然尖角',
  back: '后颈收干净',
  topPriorities: ['两侧不要炸'],
  absoluteAvoids: ['不要推白'],
  createdAt: '2026-08-10T02:30:00.000Z',
  updatedAt: '2026-08-10T02:30:00.000Z',
  ...overrides,
} as BarberBriefWrite)

const repeatRecord = (
  overrides: Partial<HaircutRecord> = {},
): HaircutRecord => ({
  id: 'record-1',
  profileId: 'profile-1',
  planId: 'plan-1',
  date: '2026-08-10T03:00:00.000Z',
  status: 'completed',
  satisfaction: 5,
  outcome: 'repeat',
  styleName: '清爽短碎发',
  createdAt: '2026-08-10T03:00:00.000Z',
  updatedAt: '2026-08-10T03:00:00.000Z',
  ...overrides,
} as HaircutRecord)

const avoidRecord = (
  overrides: Partial<HaircutRecord> = {},
): HaircutRecord => ({
  id: 'record-1',
  profileId: 'profile-1',
  planId: 'plan-1',
  date: '2026-08-10T03:00:00.000Z',
  status: 'completed',
  satisfaction: 2,
  outcome: 'avoid',
  styleName: '过短渐层',
  avoidRules: ['两侧不要推白'],
  createdAt: '2026-08-10T03:00:00.000Z',
  updatedAt: '2026-08-10T03:00:00.000Z',
  ...overrides,
} as HaircutRecord)

const photo = (
  overrides: Partial<HaircutPhoto> = {},
): HaircutPhoto => ({
  id: 'photo-1',
  recordId: 'record-1',
  stage: 'unstyled',
  image: defaultPhotoImage,
  capturedAt: '2026-08-10T03:00:00.000Z',
  ...overrides,
})

describe('ArchiveRepository', () => {
  let dbName: string
  let databases: ZajianfaDb[]
  let db: ZajianfaDb
  let repository: ArchiveRepository

  const openDatabase = () => {
    const next = new ZajianfaDb(dbName, { indexedDB, IDBKeyRange })
    databases.push(next)
    return next
  }

  const seedPlan = async () => {
    await repository.createProfile(profile())
    await repository.savePlanWithCandidates(plan(), [candidate(1), candidate(2)])
  }

  beforeEach(() => {
    dbName = `zajianfa-archive-${crypto.randomUUID()}`
    databases = []
    db = openDatabase()
    repository = new ArchiveRepository(db)
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    for (const database of databases) {
      database.close()
    }

    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(dbName)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
      request.onblocked = () => reject(new Error(`Database deletion blocked: ${dbName}`))
    })
  })

  test('keeps a profile, plan, candidates, and reference Blob after closing and reopening the database', async () => {
    const referenceImage = new NodeBlob(
      ['reference-image'],
      { type: 'image/webp' },
    ) as unknown as Blob
    await repository.createProfile(profile())
    await repository.savePlanWithCandidates(plan(), [
      candidate(1, {
        source: 'user_reference',
        demoImagePath: undefined,
        referenceId: 'local-reference-1',
        referenceImage,
        referenceImageWidth: 900,
        referenceImageHeight: 1200,
        referenceImageBytes: referenceImage.size,
        referenceImageProcessedAt: '2026-08-10T00:00:00.000Z',
      }),
      candidate(2, {
        source: 'past_record',
        demoImagePath: undefined,
        pastRecordId: 'record-1',
        referenceImage,
      }),
    ])
    await repository.saveRecordWithPhotos(repeatRecord(), [photo()])

    db.close()
    db = openDatabase()
    repository = new ArchiveRepository(db)

    expect(await repository.getProfile('profile-1')).toEqual(profile())
    expect(await repository.getPlan('plan-1')).toEqual(plan())
    expect(await repository.listCandidates('plan-1')).toHaveLength(2)

    const restored = await repository.getCandidate('candidate-1')
    expect(restored?.source).toBe('user_reference')
    expect(restored?.referenceImage?.type).toBe('image/webp')
    expect(await restored?.referenceImage?.text()).toBe('reference-image')
    const restoredPhoto = await repository.getPhoto('photo-1')
    expect(restoredPhoto?.image.type).toBe('image/webp')
    expect(restoredPhoto?.image.size).toBeGreaterThan(0)
    expect(await restoredPhoto?.image.text()).toBe('local-photo')
  })

  test('normalizes a legacy plan without mode on read without rewriting its row or candidate Blob', async () => {
    const legacyImage = new NodeBlob(
      ['legacy-mode-reference'],
      { type: 'image/webp' },
    ) as unknown as Blob
    const { mode: omittedMode, ...legacyPlan } = plan({ id: 'legacy-mode-plan' })
    expect(omittedMode).toBe('exploration')

    await repository.createProfile(profile())
    await db.plans.add(legacyPlan as HaircutPlan)
    await db.candidates.bulkAdd([
      candidate(1, {
        id: 'legacy-mode-candidate-1',
        planId: legacyPlan.id,
        source: 'user_reference',
        demoImagePath: undefined,
        referenceId: 'legacy-mode-reference',
        referenceImage: legacyImage,
        referenceImageWidth: 900,
        referenceImageHeight: 1200,
        referenceImageBytes: legacyImage.size,
        referenceImageProcessedAt: '2026-08-10T00:00:00.000Z',
      }),
      candidate(2, {
        id: 'legacy-mode-candidate-2',
        planId: legacyPlan.id,
      }),
    ])

    expect(await repository.getPlan(legacyPlan.id)).toEqual({
      ...legacyPlan,
      mode: 'exploration',
    })
    expect(await repository.listPlans(legacyPlan.profileId)).toEqual([{
      ...legacyPlan,
      mode: 'exploration',
    }])

    const rawPlan = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const request = db.backendDB()
        .transaction('plans', 'readonly')
        .objectStore('plans')
        .get(legacyPlan.id)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result as Record<string, unknown>)
    })
    expect(rawPlan).toEqual(legacyPlan)
    expect(rawPlan).not.toHaveProperty('mode')

    const [restoredCandidate] = await repository.listCandidates(legacyPlan.id)
    expect(await restoredCandidate?.referenceImage?.text()).toBe('legacy-mode-reference')
    expect(
      createHash('sha256')
        .update(new Uint8Array(
          await restoredCandidate?.referenceImage?.arrayBuffer() ?? new ArrayBuffer(0),
        ))
        .digest('hex'),
    ).toBe(
      createHash('sha256')
        .update(Buffer.from(await legacyImage.arrayBuffer()))
        .digest('hex'),
    )
  })

  test('supports profile create, list, read, update, and delete', async () => {
    await repository.createProfile(profile())
    expect(await repository.listProfiles()).toEqual([profile()])
    expect(await repository.getProfile('profile-1')).toEqual(profile())

    const updated = profile({ name: '更新后的档案' })
    await repository.updateProfile(updated)
    expect(await repository.getProfile('profile-1')).toEqual(updated)

    await repository.deleteProfile('profile-1')
    expect(await repository.getProfile('profile-1')).toBeUndefined()
  })

  test('accepts exactly two through four candidates', async () => {
    await repository.createProfile(profile())
    await repository.savePlanWithCandidates(plan(), [candidate(1), candidate(2)])
    await repository.savePlanWithCandidates(
      plan({ id: 'plan-4' }),
      [1, 2, 3, 4].map((order) => candidate(order, {
        id: `plan-4-candidate-${order}`,
        planId: 'plan-4',
      })),
    )

    expect(await repository.listCandidates('plan-1')).toHaveLength(2)
    expect(await repository.listCandidates('plan-4')).toHaveLength(4)

    for (const count of [1, 5]) {
      const invalidPlan = plan({ id: `invalid-plan-${count}` })
      const invalidCandidates = Array.from({ length: count }, (_, index) => candidate(index + 1, {
        id: `plan-${count}-candidate-${index + 1}`,
        planId: invalidPlan.id,
      }))

      await expect(
        repository.savePlanWithCandidates(invalidPlan, invalidCandidates),
      ).rejects.toThrow('between 2 and 4 candidates')
      expect(await repository.getPlan(invalidPlan.id)).toBeUndefined()
    }
  })

  test('rejects non-catalog demo paths and residual hybrid fields on save', async () => {
    await repository.createProfile(profile())
    const canonicalSecond = candidate(2, {
      demoImagePath: '/demo/persona-ran-crop.webp',
    })

    await expect(repository.savePlanWithCandidates(plan({ id: 'external-demo-plan' }), [
      candidate(1, {
        planId: 'external-demo-plan',
        demoImagePath: 'https://example.com/untrusted.webp',
      }),
      { ...canonicalSecond, id: 'external-demo-second', planId: 'external-demo-plan' },
    ])).rejects.toThrow(/catalog image path/i)

    await expect(repository.savePlanWithCandidates(plan({ id: 'hybrid-demo-plan' }), [
      candidate(1, {
        planId: 'hybrid-demo-plan',
        demoImagePath: '/demo/persona-lin-bob.webp',
        referenceId: '',
      }),
      { ...canonicalSecond, id: 'hybrid-demo-second', planId: 'hybrid-demo-plan' },
    ])).rejects.toThrow(/demo candidate cannot contain/i)

    expect(await repository.getPlan('external-demo-plan')).toBeUndefined()
    expect(await repository.getPlan('hybrid-demo-plan')).toBeUndefined()
  })

  test('uses exploration two-to-four and repeat one candidate counts', async () => {
    expect(isValidPlanCandidateCount('exploration', 1)).toBe(false)
    expect(isValidPlanCandidateCount('exploration', 2)).toBe(true)
    expect(isValidPlanCandidateCount('exploration', 4)).toBe(true)
    expect(isValidPlanCandidateCount('exploration', 5)).toBe(false)
    expect(isValidPlanCandidateCount('repeat', 0)).toBe(false)
    expect(isValidPlanCandidateCount('repeat', 1)).toBe(true)
    expect(isValidPlanCandidateCount('repeat', 2)).toBe(false)
  })

  test('accepts one active same-profile StandardStyle snapshot for repeat mode', async () => {
    await repository.createProfile(profile())
    await repository.saveRecordWithPhotos(
      repeatRecord({ planId: undefined }),
      [photo()],
    )

    const repeatPlan = plan({ mode: 'repeat' })
    const repeatCandidate = candidate(1, {
      source: 'past_record',
      demoImagePath: undefined,
      pastRecordId: 'record-1',
      referenceImage: defaultPhotoImage,
    })

    await repository.savePlanWithCandidates(repeatPlan, [repeatCandidate])

    expect(await repository.getPlan(repeatPlan.id)).toEqual(repeatPlan)
    expect(await repository.listCandidates(repeatPlan.id)).toEqual([repeatCandidate])
  })

  test('rejects non-standard, cross-profile, non-past-record, and multi-candidate repeat saves', async () => {
    await repository.createProfile(profile())
    await repository.createProfile(profile({ id: 'profile-2' }))
    await repository.saveRecordWithPhotos(
      repeatRecord({ id: 'record-other', profileId: 'profile-2', planId: undefined }),
      [photo({ id: 'photo-other', recordId: 'record-other' })],
    )

    const repeatPlan = plan({ mode: 'repeat' })
    const snapshot = candidate(1, {
      source: 'past_record',
      demoImagePath: undefined,
      pastRecordId: 'record-other',
      referenceImage: defaultPhotoImage,
    })

    await expect(repository.savePlanWithCandidates(repeatPlan, [snapshot]))
      .rejects.toThrow(/active standard style/i)
    await expect(repository.savePlanWithCandidates(repeatPlan, [candidate(1)]))
      .rejects.toThrow(/past-record snapshot/i)
    await expect(repository.savePlanWithCandidates(repeatPlan, [snapshot, {
      ...snapshot,
      id: 'candidate-2',
      order: 2,
    }])).rejects.toThrow(/exactly 1 candidate/i)
    expect(await repository.getPlan(repeatPlan.id)).toBeUndefined()
  })

  test('revalidates repeat mode switches and candidate replacement inside the save transaction', async () => {
    await repository.createProfile(profile())
    await repository.savePlanWithCandidates(plan(), [candidate(1), candidate(2)])

    await expect(repository.savePlanWithCandidates(
      plan({ mode: 'repeat' }),
      [candidate(1, {
        source: 'past_record',
        demoImagePath: undefined,
        pastRecordId: 'missing-record',
        referenceImage: defaultPhotoImage,
      })],
    )).rejects.toThrow(/active standard style/i)

    expect(await repository.getPlan('plan-1')).toEqual(plan())
    expect(await repository.listCandidates('plan-1')).toHaveLength(2)
  })

  test('keeps an unchanged repeat source snapshot editable after its record and style are deleted', async () => {
    await repository.createProfile(profile())
    await repository.saveRecordWithPhotos(
      repeatRecord({ planId: undefined }),
      [photo()],
    )
    const repeatPlan = plan({ mode: 'repeat' })
    const repeatCandidate = candidate(1, {
      source: 'past_record',
      demoImagePath: undefined,
      pastRecordId: 'record-1',
      referenceImage: defaultPhotoImage,
    })
    await repository.savePlanWithCandidates(repeatPlan, [repeatCandidate])
    await repository.saveBrief(brief())
    await repository.deleteRecord('record-1')

    const editedPlan = { ...repeatPlan, title: '仍按这张快照复刻' }
    const editedCandidate = { ...repeatCandidate, name: '保留的标准发型快照' }
    await repository.savePlanWithCandidates(editedPlan, [editedCandidate])

    expect(await repository.getPlan(repeatPlan.id)).toEqual(editedPlan)
    expect(await repository.listCandidates(repeatPlan.id)).toEqual([editedCandidate])
    expect(await repository.getBrief(repeatPlan.id)).toEqual(brief())

    const changedSnapshot = new NodeBlob(['changed-repeat-snapshot'], {
      type: 'image/webp',
    }) as unknown as Blob
    await expect(repository.savePlanWithCandidates(editedPlan, [{
      ...editedCandidate,
      referenceImage: changedSnapshot,
    }])).rejects.toThrow(/active standard style/i)
    await expect(repository.savePlanWithCandidates(editedPlan, [{
      ...editedCandidate,
      referenceImageBytes: editedCandidate.referenceImage?.size,
    }])).rejects.toThrow(/active standard style/i)
    await expect(repository.savePlanWithCandidates(editedPlan, [{
      ...editedCandidate,
      id: 'replacement-candidate',
    }])).rejects.toThrow(/active standard style/i)
    expect(await repository.getPlan(repeatPlan.id)).toEqual(editedPlan)
    expect(await repository.listCandidates(repeatPlan.id)).toEqual([editedCandidate])
    expect(await repository.getBrief(repeatPlan.id)).toEqual(brief())
  })

  test('rejects an invalid runtime mode', async () => {
    await repository.createProfile(profile())

    const invalidPlan = {
      ...plan({ id: 'plan-invalid-mode' }),
      mode: 'invalid',
    } as unknown as HaircutPlan
    await expect(repository.savePlanWithCandidates(
      invalidPlan,
      [1, 2].map((order) => candidate(order, {
        id: `${invalidPlan.id}-candidate-${order}`,
        planId: invalidPlan.id,
      })),
    )).rejects.toThrow('plan mode is invalid')
    expect(await repository.getPlan(invalidPlan.id)).toBeUndefined()

    const invalidStoredPlan = {
      ...plan({ id: 'stored-invalid-mode' }),
      mode: 'invalid',
    } as unknown as HaircutPlan
    await db.plans.add(invalidStoredPlan)
    await expect(repository.getPlan(invalidStoredPlan.id))
      .rejects.toThrow('plan mode is invalid')
  })

  test('rejects duplicate candidate order without writing the plan or candidates', async () => {
    await repository.createProfile(profile())
    const duplicates = [candidate(1), candidate(1, { id: 'candidate-2' })]

    await expect(
      repository.savePlanWithCandidates(plan(), duplicates),
    ).rejects.toThrow('candidate order must be unique')

    expect(await repository.getPlan('plan-1')).toBeUndefined()
    expect(await repository.listCandidates('plan-1')).toEqual([])
  })

  test('rejects two candidates that point to the same past record', async () => {
    await repository.createProfile(profile())
    const duplicates = [1, 2].map((order) => candidate(order, {
      source: 'past_record',
      demoImagePath: undefined,
      pastRecordId: 'record-shared',
      referenceImage: defaultPhotoImage,
    }))

    await expect(
      repository.savePlanWithCandidates(plan(), duplicates),
    ).rejects.toThrow('past-record candidates must be unique')
    expect(await repository.getPlan('plan-1')).toBeUndefined()
  })

  test('rejects incomplete or duplicate current source pointers at the repository boundary', async () => {
    await repository.createProfile(profile())
    const referenceImage = new NodeBlob(['prepared-reference'], {
      type: 'image/webp',
    }) as unknown as Blob
    const validUser = candidate(1, {
      source: 'user_reference',
      demoImagePath: undefined,
      referenceId: 'local-reference-1',
      referenceImage,
      referenceImageWidth: 900,
      referenceImageHeight: 1200,
      referenceImageBytes: referenceImage.size,
      referenceImageProcessedAt: '2026-08-10T00:00:00.000Z',
    })

    for (const invalidUser of [
      { ...validUser, referenceId: undefined },
      { ...validUser, referenceImage: undefined },
      { ...validUser, referenceImageWidth: undefined },
      { ...validUser, referenceImageHeight: undefined },
      { ...validUser, referenceImageBytes: undefined },
      { ...validUser, referenceImageProcessedAt: undefined },
    ]) {
      await expect(repository.savePlanWithCandidates(plan(), [
        invalidUser,
        candidate(2),
      ])).rejects.toThrow(/user-reference candidate/i)
    }

    await expect(repository.savePlanWithCandidates(plan(), [
      validUser,
      { ...validUser, id: 'candidate-2', order: 2 },
    ])).rejects.toThrow(/source pointer must be unique/i)
    await expect(repository.savePlanWithCandidates(plan(), [
      candidate(1, { demoImagePath: undefined }),
      candidate(2),
    ])).rejects.toThrow(/demo candidate requires/i)
    await expect(repository.savePlanWithCandidates(plan(), [
      candidate(1, {
        referenceImage,
        referenceImageWidth: 900,
        referenceImageHeight: 1200,
        referenceImageBytes: referenceImage.size,
        referenceImageProcessedAt: '2026-08-10T00:00:00.000Z',
      }),
      candidate(2),
    ])).rejects.toThrow(/demo candidate cannot contain a reference image/i)
    await expect(repository.savePlanWithCandidates(plan(), [
      candidate(1, {
        source: 'past_record',
        demoImagePath: undefined,
        referenceImage,
      }),
      candidate(2),
    ])).rejects.toThrow(/past-record candidate requires/i)
    await expect(repository.savePlanWithCandidates(plan(), [
      candidate(1, {
        source: 'past_record',
        demoImagePath: undefined,
        pastRecordId: 'record-1',
      }),
      candidate(2),
    ])).rejects.toThrow(/past-record candidate requires/i)

    expect(await repository.getPlan('plan-1')).toBeUndefined()
    expect(await repository.listCandidates('plan-1')).toEqual([])
  })

  test('enforces the prepared-image contract for new user references', async () => {
    await repository.createProfile(profile())
    const validBlob = new NodeBlob(['prepared-reference'], {
      type: 'image/webp',
    }) as unknown as Blob
    const validUser = candidate(1, {
      source: 'user_reference',
      demoImagePath: undefined,
      referenceId: 'local-reference-1',
      referenceImage: validBlob,
      referenceImageWidth: 900,
      referenceImageHeight: 1200,
      referenceImageBytes: validBlob.size,
      referenceImageProcessedAt: '2026-08-10T00:00:00.000Z',
    })
    const png = new NodeBlob(['png'], { type: 'image/png' }) as unknown as Blob
    const empty = new NodeBlob([], { type: 'image/webp' }) as unknown as Blob
    const oversized = new NodeBlob(
      [new Uint8Array(1_500_001)],
      { type: 'image/jpeg' },
    ) as unknown as Blob

    for (const invalidUser of [
      { ...validUser, referenceImage: png, referenceImageBytes: png.size },
      { ...validUser, referenceImage: empty, referenceImageBytes: empty.size },
      { ...validUser, referenceImage: oversized, referenceImageBytes: oversized.size },
      { ...validUser, referenceImageWidth: 1921 },
      { ...validUser, referenceImageBytes: validBlob.size + 1 },
    ]) {
      await expect(repository.savePlanWithCandidates(plan(), [
        invalidUser,
        candidate(2),
      ])).rejects.toThrow(/prepared WebP or JPEG/i)
    }

    await expect(repository.savePlanWithCandidates(plan(), [
      candidate(1, {
        source: 'past_record',
        demoImagePath: undefined,
        pastRecordId: 'record-1',
        referenceImage: empty,
      }),
      candidate(2),
    ])).rejects.toThrow(/non-empty reference image/i)
  })

  test('rolls back a plan when a candidate write fails inside the transaction', async () => {
    await repository.createProfile(profile())
    await db.candidates.add(candidate(9, {
      id: 'occupied-candidate',
      planId: 'other-plan',
    }))

    await expect(repository.savePlanWithCandidates(plan(), [
      candidate(1, { id: 'new-candidate' }),
      candidate(2, { id: 'occupied-candidate' }),
    ])).rejects.toThrow()

    expect(await repository.getPlan('plan-1')).toBeUndefined()
    expect(await repository.getCandidate('new-candidate')).toBeUndefined()
    expect(await repository.getCandidate('occupied-candidate')).toMatchObject({
      planId: 'other-plan',
    })
  })

  test('supports plan list, read, update, and delete through the atomic candidate save', async () => {
    await seedPlan()
    expect(await repository.listPlans('profile-1')).toEqual([plan()])
    expect(await repository.getPlan('plan-1')).toEqual(plan())

    const updatedPlan = plan({ status: 'ready' })
    await repository.savePlanWithCandidates(updatedPlan, [
      candidate(1, { id: 'replacement-1' }),
      candidate(2, { id: 'replacement-2' }),
    ])
    expect(await repository.getPlan('plan-1')).toEqual(updatedPlan)
    expect((await repository.listCandidates('plan-1')).map(({ id }) => id)).toEqual([
      'replacement-1',
      'replacement-2',
    ])

    await repository.deletePlan('plan-1')
    expect(await repository.getPlan('plan-1')).toBeUndefined()
    expect(await repository.listCandidates('plan-1')).toEqual([])
  })

  test('supports brief create, list, read, update, delete, and 1..3 item limits', async () => {
    await seedPlan()
    await repository.saveBrief(brief())
    expect(await repository.listBriefs('profile-1')).toEqual([brief()])
    expect(await repository.getBrief('plan-1')).toEqual(brief())

    const updated = brief({ overall: '更新后的整体要求' })
    await repository.saveBrief(updated)
    expect(await repository.getBrief('plan-1')).toEqual(updated)

    const upperBoundary = brief({
      topPriorities: ['最在意 1', '最在意 2', '最在意 3'],
      absoluteAvoids: ['绝对不要 1', '绝对不要 2', '绝对不要 3'],
    })
    await repository.saveBrief(upperBoundary)
    expect(await repository.getBrief('plan-1')).toEqual(upperBoundary)

    for (const invalid of [
      brief({ id: 'brief-empty-priorities', topPriorities: [] }),
      brief({ id: 'brief-many-priorities', topPriorities: ['1', '2', '3', '4'] }),
      brief({ id: 'brief-empty-avoids', absoluteAvoids: [] }),
      brief({ id: 'brief-many-avoids', absoluteAvoids: ['1', '2', '3', '4'] }),
    ]) {
      await expect(repository.saveBrief(invalid)).rejects.toThrow('between 1 and 3')
    }
    await expect(repository.saveBrief(brief({ updatedAt: 'not-a-date' })))
      .rejects.toThrow('brief timestamps must be valid dates')

    await repository.deleteBrief('plan-1')
    expect(await repository.getBrief('plan-1')).toBeUndefined()
  })

  test('requires the target candidate to belong to the brief plan without replacing the saved brief', async () => {
    await seedPlan()
    const saved = brief()
    await repository.saveBrief(saved)

    await expect(repository.saveBrief(brief({
      targetCandidateId: undefined,
      overall: '缺少目标时不应写入',
    }))).rejects.toThrow('Target candidate is required')
    await expect(repository.saveBrief(brief({
      targetCandidateId: 'missing-candidate',
      overall: '不应写入',
    }))).rejects.toThrow('Target candidate must belong to the brief plan')

    expect(await repository.getBrief('plan-1')).toEqual(saved)
  })

  test('rejects a plan edit that would orphan the saved brief target', async () => {
    await seedPlan()
    const savedPlan = plan()
    const savedCandidates = [candidate(1), candidate(2)]
    const savedBrief = brief()
    await repository.saveBrief(savedBrief)

    await expect(repository.savePlanWithCandidates(
      plan({ title: '不应写入的计划标题', updatedAt: '2026-08-10T04:00:00.000Z' }),
      [
        candidate(1, {
          id: 'candidate-2',
          name: '保留的候选',
          demoImagePath: catalogDemoPath(2),
        }),
        candidate(2, {
          id: 'candidate-3',
          name: '新候选',
          demoImagePath: catalogDemoPath(3),
        }),
      ],
    )).rejects.toThrow('Plan candidates must retain the brief target')

    expect(await repository.getPlan('plan-1')).toEqual(savedPlan)
    expect(await repository.listCandidates('plan-1')).toEqual(savedCandidates)
    expect(await repository.getBrief('plan-1')).toEqual(savedBrief)
  })

  test('reads a legacy brief with timestamp and target defaults without dropping its content', async () => {
    await seedPlan()
    const legacyBrief = {
      id: 'legacy-brief',
      profileId: 'profile-1',
      planId: 'plan-1',
      overall: '旧版整体要求',
      top: '旧版顶部要求',
      fringe: '旧版刘海要求',
      sides: '旧版两侧要求',
      sideburns: '旧版鬓角要求',
      back: '旧版后脑要求',
      topPriorities: ['旧版最在意'],
      absoluteAvoids: ['旧版绝对不要'],
    }
    await db.briefs.add(legacyBrief as unknown as BarberBrief)

    expect(await repository.getBrief('plan-1')).toEqual({
      ...legacyBrief,
      targetCandidateId: undefined,
      createdAt: '1970-01-01T00:00:00.000Z',
      updatedAt: '1970-01-01T00:00:00.000Z',
    })
  })

  test('rejects reusing a brief id across plans without changing either brief', async () => {
    await seedPlan()
    await repository.savePlanWithCandidates(
      plan({ id: 'plan-2' }),
      [
        candidate(1, { id: 'plan-2-candidate-1', planId: 'plan-2' }),
        candidate(2, { id: 'plan-2-candidate-2', planId: 'plan-2' }),
      ],
    )
    const firstBrief = brief()
    const secondBrief = brief({
      id: 'brief-2',
      planId: 'plan-2',
      targetCandidateId: 'plan-2-candidate-1',
    })
    await repository.saveBrief(firstBrief)
    await repository.saveBrief(secondBrief)

    await expect(repository.saveBrief(brief({
      id: 'brief-1',
      planId: 'plan-2',
      targetCandidateId: 'plan-2-candidate-1',
      overall: '不应覆盖任何计划',
    }))).rejects.toThrow('Brief id already belongs to another plan')

    expect(await repository.getBrief('plan-1')).toEqual(firstBrief)
    expect(await repository.getBrief('plan-2')).toEqual(secondBrief)
  })

  test('returns the minimum record and its one photo', async () => {
    await seedPlan()
    const record = repeatRecord({ satisfaction: 1 })
    const recordPhoto = photo()

    const saved = await repository.saveRecordWithPhotos(record, [recordPhoto])

    expect(saved.record).toEqual(record)
    expect(saved.photos).toHaveLength(1)
    expect(await repository.getRecord('record-1')).toEqual(record)
    expect(await repository.listRecords('profile-1')).toEqual([record])
    expect(await repository.getPhoto('photo-1')).toMatchObject({
      recordId: 'record-1',
      stage: 'unstyled',
    })
    expect(await repository.listPhotos('record-1')).toHaveLength(1)
  })

  test('keeps photos in the six-stage workflow order after a reload', async () => {
    await seedPlan()
    const stages: HaircutPhoto['stage'][] = [
      'styled',
      'before',
      'day_7',
      'after_wash',
      'unstyled',
      'during',
    ]
    await repository.saveRecordWithPhotos(repeatRecord(), stages.map((stage, index) => photo({
      id: `photo-${index + 1}`,
      stage,
    })))

    expect((await repository.listPhotos('record-1')).map(({ stage }) => stage)).toEqual([
      'before',
      'during',
      'unstyled',
      'styled',
      'after_wash',
      'day_7',
    ])
  })

  test('saves a direct record without a plan and returns its complete bundle', async () => {
    await repository.createProfile(profile())
    const record = repeatRecord({
      planId: undefined,
      salonName: '巷口理发店',
      barberName: 'Tony',
      serviceName: '洗剪吹',
      priceCents: 12800,
      durationMinutes: 75,
      notes: '顶部保留了自然纹理',
    } as Partial<HaircutRecord>)
    const recordPhoto = photo({ stage: 'styled' })

    const saved = await repository.saveRecordWithPhotos(record, [recordPhoto])
    const loaded = await repository.getRecordBundle(record.id)

    expect(saved.record).toEqual(record)
    expect(loaded).toMatchObject({
      record,
      photos: [{ id: recordPhoto.id, stage: 'styled' }],
      avoidRules: [],
      standardStyles: [{
        recordId: record.id,
        name: '清爽短碎发',
        active: true,
        createdAt: record.updatedAt,
      }],
    })
  })

  test('lists record bundles and profile-derived guidance newest first', async () => {
    await repository.createProfile(profile())
    await repository.createProfile(profile({ id: 'profile-2', name: '另一份档案' }))
    await repository.saveRecordWithPhotos(repeatRecord({
      id: 'record-old',
      planId: undefined,
      date: '2026-08-01',
      styleName: '旧标准发型',
      createdAt: '2026-08-01T10:00:00.000Z',
      updatedAt: '2026-08-01T10:00:00.000Z',
    } as Partial<HaircutRecord>), [photo({
      id: 'photo-old',
      recordId: 'record-old',
      capturedAt: '2026-08-01T10:00:00.000Z',
    })])
    await repository.saveRecordWithPhotos(avoidRecord({
      id: 'record-new',
      planId: undefined,
      date: '2026-08-09',
      avoidRules: ['两侧不要推白'],
      createdAt: '2026-08-09T10:00:00.000Z',
      updatedAt: '2026-08-09T10:00:00.000Z',
    } as Partial<HaircutRecord>), [photo({
      id: 'photo-new',
      recordId: 'record-new',
      capturedAt: '2026-08-09T10:00:00.000Z',
    })])
    await repository.saveRecordWithPhotos(repeatRecord({
      id: 'other-record',
      profileId: 'profile-2',
      planId: undefined,
      date: '2026-08-10',
      createdAt: '2026-08-10T10:00:00.000Z',
      updatedAt: '2026-08-10T10:00:00.000Z',
    } as Partial<HaircutRecord>), [photo({
      id: 'other-photo',
      recordId: 'other-record',
      capturedAt: '2026-08-10T10:00:00.000Z',
    })])

    expect((await repository.listRecords('profile-1')).map(({ id }) => id)).toEqual([
      'record-new',
      'record-old',
    ])
    expect((await repository.listRecordBundles('profile-1')).map(({ record }) => record.id)).toEqual([
      'record-new',
      'record-old',
    ])
    expect(await repository.listAvoidRulesByProfile('profile-1')).toMatchObject([
      { recordId: 'record-new', text: '两侧不要推白', active: true },
    ])
    expect(await repository.listStandardStylesByProfile('profile-1')).toMatchObject([
      { recordId: 'record-old', name: '旧标准发型', active: true },
    ])
  })

  test('creates one standard style for a repeat outcome', async () => {
    await seedPlan()
    await repository.saveRecordWithPhotos(repeatRecord(), [photo()])

    expect(await repository.listStandardStyles('record-1')).toEqual([{
      id: 'standard-style:record-1',
      profileId: 'profile-1',
      recordId: 'record-1',
      name: '清爽短碎发',
      active: true,
      createdAt: '2026-08-10T03:00:00.000Z',
    }])
    expect(await repository.listAvoidRules('record-1')).toEqual([])
  })

  test('creates one to three avoid rules for an avoid outcome', async () => {
    await seedPlan()
    const record = avoidRecord({
      avoidRules: ['两侧不要推白', '顶部不要打得太薄', '后颈不要留长尾'],
    })
    await repository.saveRecordWithPhotos(record, [photo()])

    expect(await repository.listAvoidRules('record-1')).toEqual([
      {
        id: 'avoid-rule:record-1:1',
        profileId: 'profile-1',
        recordId: 'record-1',
        text: '两侧不要推白',
        active: true,
        createdAt: '2026-08-10T03:00:00.000Z',
      },
      {
        id: 'avoid-rule:record-1:2',
        profileId: 'profile-1',
        recordId: 'record-1',
        text: '顶部不要打得太薄',
        active: true,
        createdAt: '2026-08-10T03:00:00.000Z',
      },
      {
        id: 'avoid-rule:record-1:3',
        profileId: 'profile-1',
        recordId: 'record-1',
        text: '后颈不要留长尾',
        active: true,
        createdAt: '2026-08-10T03:00:00.000Z',
      },
    ])
    expect(await repository.listStandardStyles('record-1')).toEqual([])
  })

  test('rejects invalid satisfaction and an empty photo set without partial writes', async () => {
    await seedPlan()

    for (const satisfaction of [0, 6, 1.5, Number.NaN]) {
      const invalid = repeatRecord({
        id: `record-${String(satisfaction)}`,
        satisfaction,
      } as Partial<HaircutRecord>)
      await expect(
        repository.saveRecordWithPhotos(invalid, [photo({
          id: `photo-${String(satisfaction)}`,
          recordId: invalid.id,
        })]),
      ).rejects.toThrow('satisfaction must be an integer from 1 to 5')
      expect(await repository.getRecord(invalid.id)).toBeUndefined()
    }

    await expect(
      repository.saveRecordWithPhotos(repeatRecord(), []),
    ).rejects.toThrow('at least one photo')
    expect(await repository.getRecord('record-1')).toBeUndefined()
  })

  test('atomically updates record photos and outcome-derived data', async () => {
    await seedPlan()
    await repository.saveRecordWithPhotos(repeatRecord(), [photo()])
    const updated = avoidRecord({ avoidRules: ['不要推白', '不要打薄'] })

    await repository.saveRecordWithPhotos(updated, [photo({
      id: 'photo-updated',
      stage: 'after_wash',
    })])

    expect(await repository.getRecord('record-1')).toEqual(updated)
    expect(await repository.getPhoto('photo-1')).toBeUndefined()
    expect(await repository.listPhotos('record-1')).toHaveLength(1)
    expect(await repository.listStandardStyles('record-1')).toEqual([])
    expect(await repository.listAvoidRules('record-1')).toHaveLength(2)
  })

  test('atomically keeps an unreplaced photo when the record outcome changes', async () => {
    await seedPlan()
    await repository.saveRecordWithPhotos(repeatRecord(), [photo()])
    const existingPhoto = (await repository.listPhotos('record-1'))[0]

    await repository.saveRecordWithPhotos(
      avoidRecord({ avoidRules: ['不要推白'] }),
      existingPhoto ? [existingPhoto] : [],
    )

    expect(await repository.getRecord('record-1')).toMatchObject({ outcome: 'avoid' })
    expect(await repository.listPhotos('record-1')).toMatchObject([{
      id: 'photo-1',
      stage: 'unstyled',
    }])
    expect(await (await repository.listPhotos('record-1'))[0]?.image.text()).toBe('local-photo')
    expect(await repository.listStandardStyles('record-1')).toEqual([])
    expect(await repository.listAvoidRules('record-1')).toHaveLength(1)
  })

  test('rolls back the old record, photos, and derived data when an update write fails', async () => {
    await seedPlan()
    const original = repeatRecord()
    await repository.saveRecordWithPhotos(original, [photo()])
    await db.photos.add(photo({
      id: 'occupied-photo',
      recordId: 'other-record',
    }))

    const updated = avoidRecord({ avoidRules: ['不要推白'] })
    await expect(repository.saveRecordWithPhotos(updated, [
      photo({ id: 'new-photo' }),
      photo({ id: 'occupied-photo' }),
    ])).rejects.toThrow()

    expect(await repository.getRecord('record-1')).toEqual(original)
    expect(await repository.getPhoto('photo-1')).toMatchObject({ recordId: 'record-1' })
    expect(await repository.getPhoto('new-photo')).toBeUndefined()
    expect(await repository.getPhoto('occupied-photo')).toMatchObject({
      recordId: 'other-record',
    })
    expect(await repository.listStandardStyles('record-1')).toHaveLength(1)
    expect(await repository.listAvoidRules('record-1')).toEqual([])
  })

  test('deleting a record removes its photos and derived data', async () => {
    await seedPlan()
    await repository.saveRecordWithPhotos(repeatRecord(), [photo()])
    await repository.saveRecordWithPhotos(
      avoidRecord({ id: 'record-2', avoidRules: ['不要推白'] }),
      [photo({ id: 'photo-2', recordId: 'record-2' })],
    )

    await repository.deleteRecord('record-1')

    expect(await repository.getRecord('record-1')).toBeUndefined()
    expect(await repository.listPhotos('record-1')).toEqual([])
    expect(await repository.listStandardStyles('record-1')).toEqual([])
    expect(await repository.listAvoidRules('record-1')).toEqual([])
    expect(await repository.getRecord('record-2')).toBeDefined()
    expect(await repository.getPhoto('photo-2')).toBeDefined()
    expect(await repository.listAvoidRules('record-2')).toHaveLength(1)

    await repository.deleteRecord('record-2')
    expect(await repository.getRecord('record-2')).toBeUndefined()
    expect(await repository.getPhoto('photo-2')).toBeUndefined()
    expect(await repository.listAvoidRules('record-2')).toEqual([])
  })

  test('deleting a plan removes candidates and brief but preserves its historical record', async () => {
    await seedPlan()
    await repository.saveBrief(brief())
    await repository.savePlanWithCandidates(
      plan({ id: 'plan-2' }),
      [
        candidate(1, { id: 'plan-2-candidate-1', planId: 'plan-2' }),
        candidate(2, { id: 'plan-2-candidate-2', planId: 'plan-2' }),
      ],
    )
    const siblingBrief = brief({
      id: 'brief-2',
      planId: 'plan-2',
      targetCandidateId: 'plan-2-candidate-1',
    })
    await repository.saveBrief(siblingBrief)
    await repository.saveRecordWithPhotos(repeatRecord(), [photo()])

    await repository.deletePlan('plan-1')

    expect(await repository.getPlan('plan-1')).toBeUndefined()
    expect(await repository.listCandidates('plan-1')).toEqual([])
    expect(await repository.getBrief('plan-1')).toBeUndefined()
    expect(await repository.getRecord('record-1')).toEqual(repeatRecord())
    expect(await repository.listPhotos('record-1')).toHaveLength(1)
    expect(await repository.listStandardStyles('record-1')).toHaveLength(1)
    expect(await repository.getPlan('plan-2')).toBeDefined()
    expect(await repository.listCandidates('plan-2')).toHaveLength(2)
    expect(await repository.getBrief('plan-2')).toEqual(siblingBrief)
  })

  test('deleting a profile cascades through all archive-owned data', async () => {
    await seedPlan()
    await repository.saveBrief(brief())
    await repository.saveRecordWithPhotos(repeatRecord(), [photo()])
    await repository.saveRecordWithPhotos(
      avoidRecord({ id: 'record-avoid', avoidRules: ['不要推白'] }),
      [photo({ id: 'photo-avoid', recordId: 'record-avoid' })],
    )

    await repository.createProfile(profile({ id: 'profile-2', name: '保留的档案' }))
    await repository.savePlanWithCandidates(
      plan({ id: 'plan-2', profileId: 'profile-2' }),
      [
        candidate(1, { id: 'plan-2-candidate-1', planId: 'plan-2' }),
        candidate(2, { id: 'plan-2-candidate-2', planId: 'plan-2' }),
      ],
    )
    const siblingBrief = brief({
      id: 'brief-2',
      profileId: 'profile-2',
      planId: 'plan-2',
      targetCandidateId: 'plan-2-candidate-1',
    })
    await repository.saveBrief(siblingBrief)
    await repository.saveRecordWithPhotos(
      repeatRecord({
        id: 'record-2',
        profileId: 'profile-2',
        planId: 'plan-2',
      }),
      [photo({ id: 'photo-2', recordId: 'record-2' })],
    )
    await repository.saveRecordWithPhotos(
      avoidRecord({
        id: 'record-2-avoid',
        profileId: 'profile-2',
        planId: 'plan-2',
        avoidRules: ['保留的规则'],
      }),
      [photo({ id: 'photo-2-avoid', recordId: 'record-2-avoid' })],
    )

    await repository.deleteProfile('profile-1')

    expect(await repository.getProfile('profile-1')).toBeUndefined()
    expect(await repository.getPlan('plan-1')).toBeUndefined()
    expect(await repository.listCandidates('plan-1')).toEqual([])
    expect(await repository.getBrief('plan-1')).toBeUndefined()
    expect(await repository.listRecords('profile-1')).toEqual([])
    expect(await repository.getPhoto('photo-1')).toBeUndefined()
    expect(await repository.getPhoto('photo-avoid')).toBeUndefined()
    expect(await repository.listStandardStyles('record-1')).toEqual([])
    expect(await repository.listAvoidRules('record-avoid')).toEqual([])

    expect(await repository.getProfile('profile-2')).toEqual(
      profile({ id: 'profile-2', name: '保留的档案' }),
    )
    expect(await repository.getPlan('plan-2')).toBeDefined()
    expect(await repository.listCandidates('plan-2')).toHaveLength(2)
    expect(await repository.getBrief('plan-2')).toEqual(siblingBrief)
    expect(await repository.listRecords('profile-2')).toHaveLength(2)
    expect(await repository.getPhoto('photo-2')).toBeDefined()
    expect(await repository.getPhoto('photo-2-avoid')).toBeDefined()
    expect(await repository.listStandardStyles('record-2')).toHaveLength(1)
    expect(await repository.listAvoidRules('record-2-avoid')).toHaveLength(1)
  })

  test('defines v3 archive and device-level hairstyle-library indexes', () => {
    expect(db.verno).toBe(3)
    expect(db.profiles.schema.indexes.map(({ name }) => name)).toContain('updatedAt')
    expect(db.plans.schema.indexes.map(({ name }) => name)).toEqual(
      expect.arrayContaining(['profileId', 'date', 'status', 'updatedAt']),
    )
    expect(db.candidates.schema.indexes.map(({ name }) => name)).toContain('planId')
    expect(db.briefs.schema.indexes.map(({ name }) => name)).toEqual(
      expect.arrayContaining(['profileId', 'planId']),
    )
    expect(db.records.schema.indexes.map(({ name }) => name)).toEqual(
      expect.arrayContaining(['profileId', 'planId', 'date', 'status']),
    )
    expect(db.photos.schema.indexes.map(({ name }) => name)).toContain('recordId')
    expect(db.avoidRules.schema.indexes.map(({ name }) => name)).toEqual(
      expect.arrayContaining(['profileId', 'recordId']),
    )
    expect(db.standardStyles.schema.indexes.map(({ name }) => name)).toEqual(
      expect.arrayContaining(['profileId', 'recordId']),
    )
    expect(db.privateReferences.schema.indexes.map(({ name, unique }) => ({ name, unique })))
      .toEqual(expect.arrayContaining([
        { name: 'fingerprint', unique: true },
        { name: 'updatedAt', unique: false },
      ]))
    expect(db.favoriteFolders.schema.indexes.map(({ name, unique }) => ({ name, unique })))
      .toEqual(expect.arrayContaining([
        { name: 'name', unique: true },
        { name: 'updatedAt', unique: false },
      ]))
    expect(db.favorites.schema.indexes.map(({ name, unique }) => ({ name, unique })))
      .toEqual(expect.arrayContaining([
        { name: 'folderId', unique: false },
        { name: 'itemKey', unique: true },
        { name: 'updatedAt', unique: false },
      ]))
  })

  test('upgrades version 1 profile, plan, candidate Blob, and record data without replacing it', async () => {
    db.close()
    const legacy = new Dexie(dbName, { indexedDB, IDBKeyRange })
    legacy.version(1).stores({
      profiles: 'id',
      plans: 'id, profileId, date, status',
      candidates: 'id, planId, &[planId+order]',
      briefs: 'id, &planId, profileId',
      records: 'id, profileId, planId, date, status',
      photos: 'id, recordId, stage',
      avoidRules: 'id, profileId, recordId',
      standardStyles: 'id, profileId, recordId',
    })
    const legacyImage = new NodeBlob(['legacy-reference'], { type: 'image/webp' }) as unknown as Blob
    const legacyCandidateOne = {
      id: 'legacy-candidate-1',
      planId: 'legacy-plan',
      order: 1,
      name: '旧候选一',
      notes: '完整保留候选备注',
      source: 'user_reference',
      referenceId: 'legacy-reference-1',
      referenceImage: legacyImage,
      referenceImageWidth: 900,
      referenceImageHeight: 1200,
      referenceImageBytes: legacyImage.size,
      referenceImageProcessedAt: '2025-02-02T08:00:00.000Z',
      legacyExtension: { keep: 'candidate-one' },
    }
    const legacyCandidateTwo = {
      id: 'legacy-candidate-2',
      planId: 'legacy-plan',
      order: 2,
      name: '旧候选二',
      notes: '完整保留演示候选',
      source: 'demo_ai',
      demoImagePath: '/demo/legacy-option.webp',
      legacyExtension: { keep: 'candidate-two' },
    }
    const legacyBriefRow = {
      id: 'legacy-v1-brief',
      profileId: 'legacy-profile',
      planId: 'legacy-plan',
      targetCandidateId: 'legacy-candidate-1',
      overall: 'v1 整体要求',
      top: 'v1 顶部要求',
      fringe: 'v1 刘海要求',
      sides: 'v1 两侧要求',
      sideburns: 'v1 鬓角要求',
      back: 'v1 后脑要求',
      topPriorities: ['v1 最在意'],
      absoluteAvoids: ['v1 绝对不要'],
      createdAt: '2025-02-02T09:00:00.000Z',
      updatedAt: '2025-02-02T10:00:00.000Z',
      legacyExtension: { keep: 'brief' },
    }

    await legacy.table('profiles').add({ id: 'legacy-profile', name: '旧档案' })
    await legacy.table('plans').add({
      id: 'legacy-plan',
      profileId: 'legacy-profile',
      date: '2025-02-03',
      status: 'completed',
    })
    await legacy.table('candidates').bulkAdd([legacyCandidateOne, legacyCandidateTwo])
    await legacy.table('briefs').add(legacyBriefRow)
    await legacy.table('records').add({
      id: 'legacy-record',
      profileId: 'legacy-profile',
      planId: 'legacy-plan',
      date: '2025-02-04',
      status: 'completed',
      satisfaction: 5,
      outcome: 'repeat',
      styleName: '旧发型',
    })
    await legacy.table('standardStyles').add({
      id: 'legacy-standard',
      profileId: 'legacy-profile',
      recordId: 'legacy-record',
      name: '旧发型',
    })
    legacy.close()

    const upgraded = openDatabase()
    const upgradedRepository = new ArchiveRepository(upgraded)
    const migratedProfile = await upgradedRepository.getProfile('legacy-profile')
    const migratedPlan = await upgradedRepository.getPlan('legacy-plan')
    const migratedCandidates = await upgradedRepository.listCandidates('legacy-plan')
    const migratedBrief = await upgradedRepository.getBrief('legacy-plan')

    expect(upgraded.verno).toBe(3)
    expect(await upgraded.privateReferences.count()).toBe(0)
    expect(await upgraded.favoriteFolders.count()).toBe(0)
    expect(await upgraded.favorites.count()).toBe(0)
    expect(migratedProfile).toMatchObject({
      id: 'legacy-profile',
      name: '旧档案',
      hairTexture: 'unsure',
      strandThickness: 'unsure',
      density: 'unsure',
      stylingMinutes: null,
      washFrequency: 'unsure',
      preferenceNotes: '',
    })
    expect(migratedProfile?.createdAt).toBe(migratedProfile?.updatedAt)
    expect(migratedPlan).toMatchObject({
      id: 'legacy-plan',
      title: '未命名计划',
      date: '2025-02-03',
      status: 'completed',
    })
    expect(migratedPlan?.createdAt).toBe(migratedPlan?.updatedAt)
    expect(migratedCandidates.map((candidate) => ({
      ...candidate,
      referenceImage: undefined,
    }))).toEqual([
      { ...legacyCandidateOne, referenceImage: undefined },
      { ...legacyCandidateTwo, referenceImage: undefined },
    ])
    expect(await migratedCandidates[0]?.referenceImage?.text()).toBe('legacy-reference')
    expect(
      createHash('sha256')
        .update(new Uint8Array(
          await migratedCandidates[0]?.referenceImage?.arrayBuffer() ?? new ArrayBuffer(0),
        ))
        .digest('hex'),
    ).toBe(
      createHash('sha256')
        .update(Buffer.from(await legacyImage.arrayBuffer()))
        .digest('hex'),
    )
    expect(migratedBrief).toEqual(legacyBriefRow)
    expect(await upgradedRepository.getRecord('legacy-record')).toMatchObject({
      outcome: 'repeat',
      styleName: '旧发型',
    })
    expect(await upgradedRepository.listStandardStyles('legacy-record')).toMatchObject([{
      id: 'legacy-standard',
      active: true,
      createdAt: '1970-01-01T00:00:00.000Z',
    }])
    expect(
      await upgraded.profiles.where('updatedAt').equals(migratedProfile?.updatedAt ?? '').first(),
    ).toMatchObject({ id: 'legacy-profile' })

    const firstMigrationTime = migratedProfile?.updatedAt
    upgraded.close()
    const reopened = openDatabase()
    const reopenedProfile = await new ArchiveRepository(reopened).getProfile('legacy-profile')
    expect(reopenedProfile?.updatedAt).toBe(firstMigrationTime)
  })

  test('reads legacy version 2 record defaults without rewriting its photo Blob', async () => {
    db.close()
    const legacy = new Dexie(dbName, { indexedDB, IDBKeyRange })
    legacy.version(2).stores({
      profiles: 'id, updatedAt',
      plans: 'id, profileId, date, status, updatedAt',
      candidates: 'id, planId, &[planId+order]',
      briefs: 'id, &planId, profileId',
      records: 'id, profileId, planId, date, status',
      photos: 'id, recordId, stage',
      avoidRules: 'id, profileId, recordId',
      standardStyles: 'id, profileId, recordId',
    })
    const legacyPhoto = new NodeBlob(['legacy-photo'], { type: 'image/webp' }) as unknown as Blob
    const legacyCandidateImage = new NodeBlob(
      ['legacy-candidate-image'],
      { type: 'image/webp' },
    ) as unknown as Blob
    const legacyCandidate = {
      id: 'legacy-v2-candidate',
      planId: 'legacy-plan',
      order: 1,
      name: '旧候选',
      notes: '保留这个旧备注',
      source: 'user_reference',
      referenceId: 'legacy-reference',
      referenceImage: legacyCandidateImage,
      referenceImageWidth: 900,
      referenceImageHeight: 1200,
      referenceImageBytes: legacyCandidateImage.size,
      referenceImageProcessedAt: '2025-03-03T10:00:00.000Z',
      legacyExtension: { keep: true },
    }
    const legacyBriefRow = {
      id: 'legacy-v2-brief',
      profileId: 'legacy-profile',
      planId: 'legacy-plan',
      targetCandidateId: 'legacy-v2-candidate',
      overall: 'v2 整体要求',
      top: 'v2 顶部要求',
      fringe: 'v2 刘海要求',
      sides: 'v2 两侧要求',
      sideburns: 'v2 鬓角要求',
      back: 'v2 后脑要求',
      topPriorities: ['v2 最在意'],
      absoluteAvoids: ['v2 绝对不要'],
      createdAt: '2025-03-03T11:00:00.000Z',
      updatedAt: '2025-03-03T12:00:00.000Z',
      legacyExtension: { keep: 'brief' },
    }
    await legacy.table('candidates').add(legacyCandidate)
    await legacy.table('records').add({
      id: 'legacy-v2-record',
      profileId: 'legacy-profile',
      date: '2025-03-04',
      status: 'completed',
      satisfaction: 4,
      outcome: 'avoid',
      styleName: '旧版短发',
      avoidRules: ['不要推白'],
    })
    await legacy.table('photos').add({
      id: 'legacy-v2-photo',
      recordId: 'legacy-v2-record',
      stage: 'styled',
      image: legacyPhoto,
    })
    await legacy.table('avoidRules').add({
      id: 'legacy-v2-rule',
      profileId: 'legacy-profile',
      recordId: 'legacy-v2-record',
      text: '不要推白',
    })
    await legacy.table('briefs').add(legacyBriefRow)
    legacy.close()

    const upgraded = openDatabase()
    const upgradedRepository = new ArchiveRepository(upgraded)
    const record = await upgradedRepository.getRecord('legacy-v2-record')
    const photos = await upgradedRepository.listPhotos('legacy-v2-record')
    const rules = await upgradedRepository.listAvoidRules('legacy-v2-record')
    const legacyBrief = await upgradedRepository.getBrief('legacy-plan')
    const [migratedCandidate] = await upgradedRepository.listCandidates('legacy-plan')

    expect(upgraded.verno).toBe(3)
    expect(await upgraded.privateReferences.count()).toBe(0)
    expect(await upgraded.favoriteFolders.count()).toBe(0)
    expect(await upgraded.favorites.count()).toBe(0)
    expect(record).toMatchObject({
      id: 'legacy-v2-record',
      planId: undefined,
      salonName: undefined,
      barberName: undefined,
      serviceName: undefined,
      priceCents: undefined,
      durationMinutes: undefined,
      notes: undefined,
      createdAt: '2025-03-04T00:00:00.000Z',
      updatedAt: '2025-03-04T00:00:00.000Z',
    })
    expect(photos[0]).toMatchObject({
      id: 'legacy-v2-photo',
      capturedAt: '1970-01-01T00:00:00.000Z',
    })
    expect(photos[0]).not.toHaveProperty('width')
    expect(photos[0]).not.toHaveProperty('height')
    expect(photos[0]).not.toHaveProperty('bytes')
    expect(photos[0]).not.toHaveProperty('processedAt')
    expect(await photos[0]?.image.text()).toBe('legacy-photo')
    expect({ ...migratedCandidate, referenceImage: undefined }).toEqual({
      ...legacyCandidate,
      referenceImage: undefined,
    })
    expect(await migratedCandidate?.referenceImage?.text()).toBe('legacy-candidate-image')
    expect(
      createHash('sha256')
        .update(new Uint8Array(
          await migratedCandidate?.referenceImage?.arrayBuffer() ?? new ArrayBuffer(0),
        ))
        .digest('hex'),
    ).toBe(
      createHash('sha256')
        .update(Buffer.from(await legacyCandidateImage.arrayBuffer()))
        .digest('hex'),
    )
    expect(rules).toMatchObject([{
      id: 'legacy-v2-rule',
      active: true,
      createdAt: '1970-01-01T00:00:00.000Z',
    }])
    expect(legacyBrief).toEqual(legacyBriefRow)
  })

  test('uses the legacy timestamp when an old record date is unreadable', async () => {
    await db.records.add({
      id: 'legacy-invalid-date',
      profileId: 'legacy-profile',
      date: 'not-a-date',
      status: 'completed',
      satisfaction: 3,
      outcome: 'repeat',
      styleName: '旧记录',
    } as unknown as HaircutRecord)

    expect(await repository.getRecord('legacy-invalid-date')).toMatchObject({
      createdAt: '1970-01-01T00:00:00.000Z',
      updatedAt: '1970-01-01T00:00:00.000Z',
    })
  })

  test('maps quota failures to a recognizable storage error', async () => {
    const quotaError = new DOMException('Storage is full', 'QuotaExceededError')
    const wrappedQuotaError = new Dexie.BulkError('Profile write failed', {
      0: quotaError,
    })
    vi.spyOn(db.profiles, 'add').mockRejectedValueOnce(wrappedQuotaError)

    const error = await repository.createProfile(profile()).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ArchiveStorageError)
    expect(error).toMatchObject({
      code: 'quota_exceeded',
      cause: wrappedQuotaError,
    })
  })

  test('maps unavailable IndexedDB failures and rethrows unrelated failures', async () => {
    const unavailable = new DOMException('IndexedDB is unavailable', 'InvalidStateError')
    const wrappedUnavailable = new Dexie.DatabaseClosedError(
      'Profile write failed',
      unavailable,
    )
    vi.spyOn(db.profiles, 'add').mockRejectedValueOnce(wrappedUnavailable)
    await expect(repository.createProfile(profile())).rejects.toMatchObject({
      code: 'unavailable',
      cause: wrappedUnavailable,
    })

    const unrelated = new Error('unexpected write failure')
    vi.spyOn(db.profiles, 'add').mockRejectedValueOnce(unrelated)
    await expect(repository.createProfile(profile())).rejects.toBe(unrelated)
  })
})
