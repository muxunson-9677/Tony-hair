import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, test } from 'vitest'

import { ArchiveStorageError } from './ArchiveRepository'
import {
  createArchiveStore,
  type ArchiveRepositoryPort,
  type HairProfileDraft,
  type HaircutPlanDraft,
} from './archiveStore'
import type {
  AvoidRule,
  Candidate,
  HairProfile,
  HaircutPhoto,
  HaircutPlan,
  HaircutRecord,
  StandardStyle,
} from './types'

const localPhoto = new Blob(['local-photo'], { type: 'image/webp' })

const fullProfile = (overrides: Partial<HairProfile> = {}): HairProfile => ({
  id: 'profile-existing',
  name: '阿青',
  hairTexture: 'wavy',
  strandThickness: 'fine',
  density: 'medium',
  stylingMinutes: 8,
  washFrequency: 'every_other_day',
  preferenceNotes: '不要贴头皮',
  createdAt: '2026-08-09T00:00:00.000Z',
  updatedAt: '2026-08-09T00:00:00.000Z',
  ...overrides,
})

const fullPlan = (overrides: Partial<HaircutPlan> = {}): HaircutPlan => ({
  id: 'plan-existing',
  profileId: 'profile-existing',
  title: '周末理发计划',
  date: '2026-08-16',
  status: 'draft',
  createdAt: '2026-08-09T00:00:00.000Z',
  updatedAt: '2026-08-09T00:00:00.000Z',
  ...overrides,
})

const fullCandidate = (order: number, overrides: Partial<Candidate> = {}): Candidate => ({
  id: `candidate-existing-${order}`,
  planId: 'plan-existing',
  order,
  name: `方案 ${order}`,
  notes: `方案 ${order} 说明`,
  source: 'demo_ai',
  demoImagePath: `/demo/option-${order}.webp`,
  ...overrides,
})

const fullRecord = (overrides: Partial<HaircutRecord> = {}): HaircutRecord => ({
  id: 'record-existing',
  profileId: 'profile-existing',
  planId: 'plan-existing',
  date: '2026-08-18',
  status: 'completed',
  satisfaction: 5,
  outcome: 'repeat',
  styleName: '清爽短碎发',
  salonName: '巷口理发店',
  barberName: 'Tony',
  serviceName: '洗剪吹',
  priceCents: 12800,
  durationMinutes: 75,
  notes: '顶部保留自然纹理',
  createdAt: '2026-08-18T10:00:00.000Z',
  updatedAt: '2026-08-18T10:00:00.000Z',
  ...overrides,
} as HaircutRecord)

const fullPhoto = (overrides: Partial<HaircutPhoto> = {}): HaircutPhoto => ({
  id: 'photo-existing',
  recordId: 'record-existing',
  stage: 'styled',
  image: localPhoto,
  capturedAt: '2026-08-18T10:00:00.000Z',
  ...overrides,
})

class MemoryRepository implements ArchiveRepositoryPort {
  profiles: HairProfile[] = []
  plans: HaircutPlan[] = []
  candidates: Candidate[] = []
  records: HaircutRecord[] = []
  photos: HaircutPhoto[] = []
  avoidRules: AvoidRule[] = []
  standardStyles: StandardStyle[] = []
  nextFailure: unknown
  nextListProfilesFailure: unknown
  deferredProfiles: Promise<HairProfile[]> | null = null
  listProfilesCalls = 0
  savePlanCalls = 0
  saveRecordCalls = 0
  recordSaveGate: Promise<void> | null = null

  private failIfRequested() {
    if (this.nextFailure) {
      const failure = this.nextFailure
      this.nextFailure = undefined
      throw failure
    }
  }

  async createProfile(profile: HairProfile) {
    this.failIfRequested()
    this.profiles.push(profile)
    return profile.id
  }

  async listProfiles() {
    this.listProfilesCalls += 1
    if (this.nextListProfilesFailure) {
      const failure = this.nextListProfilesFailure
      this.nextListProfilesFailure = undefined
      throw failure
    }
    if (this.deferredProfiles) {
      return this.deferredProfiles
    }
    this.failIfRequested()
    return [...this.profiles]
  }

  async updateProfile(profile: HairProfile) {
    this.failIfRequested()
    this.profiles = this.profiles.map((item) => item.id === profile.id ? profile : item)
    return profile.id
  }

  async deleteProfile(profileId: string) {
    this.failIfRequested()
    const planIds = new Set(this.plans.filter(({ profileId: id }) => id === profileId).map(({ id }) => id))
    this.profiles = this.profiles.filter(({ id }) => id !== profileId)
    this.plans = this.plans.filter(({ profileId: id }) => id !== profileId)
    this.candidates = this.candidates.filter(({ planId }) => !planIds.has(planId))
    const recordIds = new Set(this.records.filter(({ profileId: id }) => id === profileId).map(({ id }) => id))
    this.records = this.records.filter(({ profileId: id }) => id !== profileId)
    this.photos = this.photos.filter(({ recordId }) => !recordIds.has(recordId))
    this.avoidRules = this.avoidRules.filter(({ profileId: id }) => id !== profileId)
    this.standardStyles = this.standardStyles.filter(({ profileId: id }) => id !== profileId)
  }

  async listPlans(profileId: string) {
    this.failIfRequested()
    return this.plans.filter(({ profileId: id }) => id === profileId)
  }

  async listCandidates(planId: string) {
    this.failIfRequested()
    return this.candidates.filter(({ planId: id }) => id === planId).sort((a, b) => a.order - b.order)
  }

  async savePlanWithCandidates(plan: HaircutPlan, candidates: readonly Candidate[]) {
    this.failIfRequested()
    this.savePlanCalls += 1
    this.plans = [...this.plans.filter(({ id }) => id !== plan.id), plan]
    this.candidates = [
      ...this.candidates.filter(({ planId }) => planId !== plan.id),
      ...candidates,
    ]
    return { plan, candidates: [...candidates] }
  }

  async deletePlan(planId: string) {
    this.failIfRequested()
    this.plans = this.plans.filter(({ id }) => id !== planId)
    this.candidates = this.candidates.filter(({ planId: id }) => id !== planId)
  }

  async listRecords(profileId: string) {
    this.failIfRequested()
    return this.records
      .filter(({ profileId: id }) => id === profileId)
      .sort((left, right) => right.date.localeCompare(left.date))
  }

  async listPhotos(recordId: string) {
    this.failIfRequested()
    return this.photos.filter(({ recordId: id }) => id === recordId)
  }

  async listAvoidRulesByProfile(profileId: string) {
    this.failIfRequested()
    return this.avoidRules.filter(({ profileId: id }) => id === profileId)
  }

  async listStandardStylesByProfile(profileId: string) {
    this.failIfRequested()
    return this.standardStyles.filter(({ profileId: id }) => id === profileId)
  }

  async saveRecordWithPhotos(record: HaircutRecord, photos: readonly HaircutPhoto[]) {
    this.saveRecordCalls += 1
    if (this.recordSaveGate) {
      await this.recordSaveGate
    }
    this.failIfRequested()
    this.records = [...this.records.filter(({ id }) => id !== record.id), record]
    this.photos = [
      ...this.photos.filter(({ recordId }) => recordId !== record.id),
      ...photos,
    ]
    this.avoidRules = this.avoidRules.filter(({ recordId }) => recordId !== record.id)
    this.standardStyles = this.standardStyles.filter(({ recordId }) => recordId !== record.id)
    if (record.outcome === 'repeat') {
      this.standardStyles.push({
        id: `standard-style:${record.id}`,
        profileId: record.profileId,
        recordId: record.id,
        name: record.styleName,
        createdAt: record.updatedAt,
        active: true,
      })
    } else {
      this.avoidRules.push(...record.avoidRules.map((text, index) => ({
        id: `avoid-rule:${record.id}:${index + 1}`,
        profileId: record.profileId,
        recordId: record.id,
        text,
        createdAt: record.updatedAt,
        active: true,
      })))
    }
    return { record, photos: [...photos] }
  }

  async deleteRecord(recordId: string) {
    this.failIfRequested()
    this.records = this.records.filter(({ id }) => id !== recordId)
    this.photos = this.photos.filter(({ recordId: id }) => id !== recordId)
    this.avoidRules = this.avoidRules.filter(({ recordId: id }) => id !== recordId)
    this.standardStyles = this.standardStyles.filter(({ recordId: id }) => id !== recordId)
  }
}

const profileDraft: HairProfileDraft = {
  name: '小林',
  hairTexture: 'straight',
  strandThickness: 'medium',
  density: 'high',
  stylingMinutes: 12,
  washFrequency: 'daily',
  preferenceNotes: '希望露耳但不要推白',
}

const planDraft = (overrides: Partial<HaircutPlanDraft> = {}): HaircutPlanDraft => ({
  title: '下次想剪的方向',
  date: '2026-08-20',
  status: 'ready',
  candidates: [
    {
      name: '齐颌短鲍伯',
      notes: '保留耳前重量，避免过度打薄。',
      source: 'demo_ai',
      demoImagePath: '/demo/persona-lin-bob.webp',
    },
    {
      name: '纹理短碎发',
      notes: '顺着自然卷向剪出参差边缘。',
      source: 'demo_ai',
      demoImagePath: '/demo/persona-ran-crop.webp',
    },
  ],
  ...overrides,
})

describe('archive store', () => {
  let repository: MemoryRepository
  let ids: string[]
  let useTestStore: ReturnType<typeof createArchiveStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    repository = new MemoryRepository()
    ids = ['profile-new', 'plan-new', 'candidate-new-1', 'candidate-new-2', 'candidate-new-3']
    useTestStore = createArchiveStore(repository, {
      createId: () => ids.shift() ?? crypto.randomUUID(),
      now: () => new Date('2026-08-10T10:00:00.000Z'),
    })
  })

  test('loads the newest device profile with plans and candidates without flashing an empty state', async () => {
    repository.profiles = [
      fullProfile({ id: 'older', updatedAt: '2026-08-01T00:00:00.000Z' }),
      fullProfile(),
    ]
    repository.plans = [
      fullPlan({ id: 'plan-old', date: '2026-08-12' }),
      fullPlan({ id: 'plan-newer', date: '2026-08-20' }),
    ]
    repository.candidates = [
      fullCandidate(1, { planId: 'plan-old' }),
      fullCandidate(2, { planId: 'plan-old' }),
      fullCandidate(1, { id: 'newer-1', planId: 'plan-newer' }),
      fullCandidate(2, { id: 'newer-2', planId: 'plan-newer' }),
    ]

    const store = useTestStore()
    expect(store.loading).toBe(true)
    await store.load()

    expect(store.loading).toBe(false)
    expect(store.profile?.id).toBe('profile-existing')
    expect(store.plans.map(({ id }) => id)).toEqual(['plan-newer', 'plan-old'])
    expect(store.candidatesByPlanId['plan-newer']).toHaveLength(2)
    expect(store.error).toBeNull()
  })

  test('creates, updates, reloads, and deletes the one device profile', async () => {
    const store = useTestStore()
    await store.load()

    const created = await store.saveProfile(profileDraft)
    expect(created).toMatchObject({ id: 'profile-new', name: '小林' })
    expect(created?.createdAt).toBe('2026-08-10T10:00:00.000Z')

    const updated = await store.saveProfile({ ...profileDraft, name: '林同学' })
    expect(updated).toMatchObject({ id: 'profile-new', name: '林同学' })
    expect(updated?.createdAt).toBe(created?.createdAt)

    setActivePinia(createPinia())
    const refreshed = createArchiveStore(repository)()
    await refreshed.load()
    expect(refreshed.profile?.name).toBe('林同学')

    await refreshed.deleteProfile('profile-new')
    expect(refreshed.profile).toBeNull()
    expect(repository.profiles).toEqual([])
  })

  test('keeps a successful deletion when the follow-up snapshot cannot be read', async () => {
    repository.profiles = [fullProfile()]
    const store = useTestStore()
    await store.load()
    repository.nextListProfilesFailure = new ArchiveStorageError('unavailable', new Error('technical'))

    expect(await store.deleteProfile('profile-existing')).toBe(true)
    expect(store.profile).toBeNull()
    expect(repository.profiles).toEqual([])
    expect(store.error).toMatch(/不可用/)
  })

  test('shares concurrent loads and prevents an older snapshot from replacing a saved profile', async () => {
    let releaseProfiles!: (profiles: HairProfile[]) => void
    repository.deferredProfiles = new Promise((resolve) => {
      releaseProfiles = resolve
    })
    const store = useTestStore()
    const firstLoad = store.load()
    const secondLoad = store.load()

    expect(repository.listProfilesCalls).toBe(1)
    const saved = await store.saveProfile(profileDraft)
    releaseProfiles([])
    await Promise.all([firstLoad, secondLoad])

    expect(saved?.id).toBe('profile-new')
    expect(store.profile?.id).toBe('profile-new')
    expect(store.loading).toBe(false)
  })

  test('creates, edits, reloads, and deletes a plan with two to four unique demo candidates', async () => {
    repository.profiles = [fullProfile()]
    ids = ['plan-new', 'candidate-new-1', 'candidate-new-2', 'candidate-new-3']
    const store = useTestStore()
    await store.load()

    expect(await store.savePlan(planDraft({ candidates: planDraft().candidates.slice(0, 1) }))).toBeNull()
    expect(store.error).toMatch(/2.*4/)
    expect(repository.savePlanCalls).toBe(0)

    const duplicate = planDraft().candidates[0]
    expect(await store.savePlan(planDraft({ candidates: [duplicate, duplicate] }))).toBeNull()
    expect(store.error).toMatch(/不重复/)
    expect(repository.savePlanCalls).toBe(0)

    const created = await store.savePlan(planDraft())
    expect(created?.plan).toMatchObject({ id: 'plan-new', title: '下次想剪的方向' })
    expect(created?.candidates).toHaveLength(2)
    expect(new Set(created?.candidates.map(({ demoImagePath }) => demoImagePath))).toHaveProperty('size', 2)

    const edited = await store.savePlan(planDraft({
      id: created?.plan.id,
      title: '更新后的方向',
      candidates: [
        planDraft().candidates[0],
        {
          name: '清爽渐层',
          notes: '低渐层并保留顶部长度。',
          source: 'demo_ai',
          demoImagePath: '/demo/persona-qiao-taper.webp',
        },
      ],
    }))
    expect(edited?.plan.title).toBe('更新后的方向')
    expect(edited?.plan.createdAt).toBe(created?.plan.createdAt)

    setActivePinia(createPinia())
    const refreshed = createArchiveStore(repository)()
    await refreshed.load()
    expect(refreshed.plans[0]?.title).toBe('更新后的方向')
    expect(refreshed.candidatesByPlanId[created?.plan.id ?? '']).toHaveLength(2)

    await refreshed.deletePlan(created?.plan.id ?? '')
    expect(refreshed.plans).toEqual([])
    expect(refreshed.profile?.id).toBe('profile-existing')
  })

  test('loads real records, photos, avoid rules, and standard styles for the active profile', async () => {
    repository.profiles = [fullProfile()]
    repository.records = [
      fullRecord({ id: 'record-old', date: '2026-08-01' }),
      fullRecord(),
    ]
    repository.photos = [
      fullPhoto({ id: 'photo-old', recordId: 'record-old' }),
      fullPhoto(),
    ]
    repository.avoidRules = [{
      id: 'avoid-rule:record-old:1',
      profileId: 'profile-existing',
      recordId: 'record-old',
      text: '不要推白',
      createdAt: '2026-08-01T10:00:00.000Z',
      active: true,
    }]
    repository.standardStyles = [{
      id: 'standard-style:record-existing',
      profileId: 'profile-existing',
      recordId: 'record-existing',
      name: '清爽短碎发',
      createdAt: '2026-08-18T10:00:00.000Z',
      active: true,
    }]

    const store = useTestStore()
    await store.load()

    expect(store.records.map(({ id }) => id)).toEqual(['record-existing', 'record-old'])
    expect(store.photosByRecordId['record-existing']).toEqual([fullPhoto()])
    expect(store.avoidRules).toHaveLength(1)
    expect(store.standardStyles).toHaveLength(1)
  })

  test('creates, edits, reloads, and deletes a record while preserving its existing photo', async () => {
    repository.profiles = [fullProfile()]
    repository.plans = [fullPlan()]
    ids = ['record-new', 'photo-new']
    const store = useTestStore()
    await store.load()

    const created = await store.saveRecord({
      planId: 'plan-existing',
      date: '2026-08-20',
      styleName: '纹理短碎发',
      salonName: '巷口理发店',
      barberName: 'Tony',
      serviceName: '洗剪吹',
      priceCents: 12800,
      durationMinutes: 75,
      notes: '顶部保留自然纹理',
      satisfaction: 5,
      outcome: 'repeat',
      avoidRules: [],
      photos: [{ stage: 'styled', image: localPhoto }],
    })
    expect(created?.record).toMatchObject({
      id: 'record-new',
      priceCents: 12800,
      outcome: 'repeat',
    })
    expect(store.standardStyles).toMatchObject([{ recordId: 'record-new', active: true }])

    const existingPhoto = created?.photos[0]
    const edited = await store.saveRecord({
      id: 'record-new',
      date: '2026-08-20',
      styleName: '纹理短碎发',
      satisfaction: 2,
      outcome: 'avoid',
      avoidRules: ['两侧不要推白'],
      photos: existingPhoto ? [existingPhoto] : [],
    })
    expect(edited?.record).toMatchObject({ id: 'record-new', outcome: 'avoid' })
    expect(edited?.photos[0]?.id).toBe('photo-new')
    expect(store.standardStyles).toEqual([])
    expect(store.avoidRules).toMatchObject([{ recordId: 'record-new', text: '两侧不要推白' }])

    setActivePinia(createPinia())
    const refreshed = createArchiveStore(repository)()
    await refreshed.load()
    expect(refreshed.records[0]).toMatchObject({ id: 'record-new', outcome: 'avoid' })
    expect(refreshed.photosByRecordId['record-new']?.[0]?.image).toBe(localPhoto)

    expect(await refreshed.deleteRecord('record-new')).toBe(true)
    expect(refreshed.records).toEqual([])
    expect(refreshed.profile?.id).toBe('profile-existing')
    expect(refreshed.plans[0]?.id).toBe('plan-existing')
  })

  test('rejects a second record mutation while the first save is pending and keeps failures visible', async () => {
    repository.profiles = [fullProfile()]
    let releaseSave!: () => void
    repository.recordSaveGate = new Promise((resolve) => {
      releaseSave = resolve
    })
    ids = ['record-new', 'photo-new']
    const store = useTestStore()
    await store.load()
    const draft = {
      date: '2026-08-20',
      styleName: '纹理短碎发',
      satisfaction: 5 as const,
      outcome: 'repeat' as const,
      avoidRules: [],
      photos: [{ stage: 'styled' as const, image: localPhoto }],
    }

    const first = store.saveRecord(draft)
    expect(await store.saveRecord(draft)).toBeNull()
    expect(repository.saveRecordCalls).toBe(1)
    releaseSave()
    await first

    repository.nextFailure = new ArchiveStorageError('unavailable', new Error('technical'))
    expect(await store.saveRecord({ ...draft, id: 'record-new', satisfaction: 2 })).toBeNull()
    expect(store.records[0]?.satisfaction).toBe(5)
    expect(store.error).toMatch(/不可用|无痕/)
    expect(store.saving).toBe(false)

    repository.nextFailure = new ArchiveStorageError('unavailable', new Error('technical'))
    expect(await store.deleteRecord('record-new')).toBe(false)
    expect(store.records).toHaveLength(1)
    expect(store.error).toMatch(/不可用|无痕/)
    expect(store.saving).toBe(false)
  })

  test('does not reuse an undefined source identity for new candidates', async () => {
    repository.profiles = [fullProfile()]
    ids = ['plan-new', 'candidate-new-1', 'candidate-new-2']
    const store = useTestStore()
    await store.load()

    const saved = await store.savePlan(planDraft({
      candidates: [1, 2].map((index) => ({
        name: `本地参考 ${index}`,
        notes: '',
        source: 'user_reference' as const,
      })),
    }))

    expect(saved?.candidates.map(({ id }) => id)).toEqual([
      'candidate-new-1',
      'candidate-new-2',
    ])
  })

  test('shows human storage messages and always resets loading and saving', async () => {
    const store = useTestStore()
    repository.nextFailure = new ArchiveStorageError('quota_exceeded', new Error('technical'))

    await store.load()
    expect(store.loading).toBe(false)
    expect(store.error).toMatch(/空间不足/)
    expect(store.error).not.toMatch(/technical|quota/i)

    repository.nextFailure = new ArchiveStorageError('unavailable', new Error('technical'))
    expect(await store.saveProfile(profileDraft)).toBeNull()
    expect(store.saving).toBe(false)
    expect(store.error).toMatch(/无痕或隐私模式|不可用/)
    expect(store.error).not.toMatch(/technical|unavailable/i)
  })
})
