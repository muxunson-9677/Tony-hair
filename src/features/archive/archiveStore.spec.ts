import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, test } from 'vitest'

import { ArchiveStorageError } from './ArchiveRepository'
import {
  createArchiveStore,
  type ArchiveRepositoryPort,
  type BarberBriefDraft,
  type HairProfileDraft,
  type HaircutPhotoDraft,
  type HaircutPlanDraft,
} from './archiveStore'
import type {
  AvoidRule,
  BarberBrief,
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
  mode: 'exploration',
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

const fullBrief = (overrides: Partial<BarberBrief> = {}): BarberBrief => ({
  id: 'brief-existing',
  profileId: 'profile-existing',
  planId: 'plan-existing',
  targetCandidateId: 'candidate-existing-1',
  overall: '整体保留轻盈轮廓',
  top: '顶部保留支撑',
  fringe: '刘海自然露额',
  sides: '两侧贴合但不推白',
  sideburns: '鬓角保留自然尖角',
  back: '后脑连接自然',
  topPriorities: ['两侧不要炸'],
  absoluteAvoids: ['不要推白'],
  createdAt: '2026-08-09T01:00:00.000Z',
  updatedAt: '2026-08-09T01:00:00.000Z',
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
  briefs: BarberBrief[] = []
  records: HaircutRecord[] = []
  photos: HaircutPhoto[] = []
  avoidRules: AvoidRule[] = []
  standardStyles: StandardStyle[] = []
  nextFailure: unknown
  nextListProfilesFailure: unknown
  deferredProfiles: Promise<HairProfile[]> | null = null
  listProfilesCalls = 0
  savePlanCalls = 0
  saveBriefCalls = 0
  saveRecordCalls = 0
  briefSaveGate: Promise<void> | null = null
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
    this.briefs = this.briefs.filter(({ profileId: id }) => id !== profileId)
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
    this.briefs = this.briefs.filter(({ planId: id }) => id !== planId)
  }

  async listBriefs(profileId: string) {
    this.failIfRequested()
    return this.briefs.filter(({ profileId: id }) => id === profileId)
  }

  async getBrief(planId: string) {
    this.failIfRequested()
    return this.briefs.find(({ planId: id }) => id === planId)
  }

  async saveBrief(brief: BarberBrief) {
    this.saveBriefCalls += 1
    if (this.briefSaveGate) {
      await this.briefSaveGate
    }
    this.failIfRequested()
    this.briefs = [...this.briefs.filter(({ planId }) => planId !== brief.planId), brief]
    return brief
  }

  async deleteBrief(planId: string) {
    this.failIfRequested()
    this.briefs = this.briefs.filter(({ planId: id }) => id !== planId)
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
  mode: 'exploration',
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

const briefDraft = (overrides: Partial<BarberBriefDraft> = {}): BarberBriefDraft => ({
  targetCandidateId: 'candidate-existing-1',
  overall: ' 整体保留轻盈轮廓 ',
  top: '顶部保留支撑',
  fringe: '刘海自然露额',
  sides: '两侧贴合但不推白',
  sideburns: '鬓角保留自然尖角',
  back: '后脑连接自然',
  topPriorities: [' 两侧不要炸 '],
  absoluteAvoids: [' 不要推白 '],
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

  test('uses two-to-four exploration candidates and one repeat snapshot', async () => {
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
    expect(created?.plan).toMatchObject({
      id: 'plan-new',
      title: '下次想剪的方向',
      mode: 'exploration',
    })
    expect(created?.candidates).toHaveLength(2)
    expect(new Set(created?.candidates.map(({ demoImagePath }) => demoImagePath))).toHaveProperty('size', 2)

    expect(await store.savePlan(planDraft({
      id: created?.plan.id,
      mode: 'repeat',
    }))).toBeNull()
    expect(store.error).toMatch(/1/)

    const edited = await store.savePlan(planDraft({
      id: created?.plan.id,
      title: '更新后的方向',
      mode: 'repeat',
      candidates: [{
        name: '清爽短碎发',
        notes: '按保存的剪后快照复刻。',
        source: 'past_record',
        pastRecordId: 'record-existing',
        referenceImage: localPhoto,
      }],
    }))
    expect(edited?.plan.title).toBe('更新后的方向')
    expect(edited?.plan.mode).toBe('repeat')
    expect(edited?.plan.createdAt).toBe(created?.plan.createdAt)

    setActivePinia(createPinia())
    const refreshed = createArchiveStore(repository)()
    await refreshed.load()
    expect(refreshed.plans[0]?.title).toBe('更新后的方向')
    expect(refreshed.plans[0]?.mode).toBe('repeat')
    expect(refreshed.candidatesByPlanId[created?.plan.id ?? '']).toHaveLength(1)

    await refreshed.deletePlan(created?.plan.id ?? '')
    expect(refreshed.plans).toEqual([])
    expect(refreshed.profile?.id).toBe('profile-existing')
  })

  test('saves mixed local sources, keeps stable ids, and rejects duplicate source pointers', async () => {
    repository.profiles = [fullProfile()]
    ids = ['plan-new', 'candidate-user', 'candidate-record']
    const store = useTestStore()
    await store.load()
    const prepared = new Blob(['prepared'], { type: 'image/webp' })
    const mixed = [
      {
        name: '我的参考图',
        notes: '本地处理',
        source: 'user_reference' as const,
        referenceId: 'reference-1',
        referenceImage: prepared,
        referenceImageWidth: 960,
        referenceImageHeight: 1280,
        referenceImageBytes: prepared.size,
        referenceImageProcessedAt: '2026-08-10T10:00:00.000Z',
      },
      {
        name: '清爽短碎发',
        notes: '来自真实剪后记录',
        source: 'past_record' as const,
        pastRecordId: 'record-existing',
        referenceImage: localPhoto,
        referenceImageWidth: 900,
        referenceImageHeight: 1200,
        referenceImageBytes: localPhoto.size,
        referenceImageProcessedAt: '2026-08-18T10:00:00.000Z',
      },
    ]

    const duplicate = await store.savePlan(planDraft({ candidates: [mixed[0]!, mixed[0]!] }))
    expect(duplicate).toBeNull()
    expect(store.error).toMatch(/不重复/)

    const created = await store.savePlan(planDraft({ candidates: mixed }))
    expect(created?.candidates.map(({ id }) => id)).toEqual(['candidate-user', 'candidate-record'])
    expect(await created?.candidates[0]?.referenceImage?.text()).toBe('prepared')
    expect(created?.candidates[0]).toMatchObject({
      referenceId: 'reference-1',
      referenceImageWidth: 960,
      referenceImageHeight: 1280,
      referenceImageBytes: prepared.size,
    })

    const edited = await store.savePlan(planDraft({
      id: created?.plan.id,
      title: '保留来源的修改',
      candidates: created?.candidates ?? [],
    }))
    expect(edited?.candidates.map(({ id }) => id)).toEqual(['candidate-user', 'candidate-record'])
    expect(await edited?.candidates[1]?.referenceImage?.text()).toBe('local-photo')
  })

  test('loads, creates, edits, reloads, and deletes a brief mapped by plan id', async () => {
    repository.profiles = [fullProfile()]
    repository.plans = [fullPlan()]
    repository.candidates = [fullCandidate(1), fullCandidate(2)]
    repository.briefs = [fullBrief()]
    ids = ['brief-new']
    const store = useTestStore()

    await store.load()
    expect(store.briefsByPlanId['plan-existing']).toEqual(fullBrief())

    const edited = await store.saveBrief('plan-existing', briefDraft({
      overall: ' 更新后的整体要求 ',
      topPriorities: [' 第一条 ', ' 第二条 '],
    }))
    expect(edited).toMatchObject({
      id: 'brief-existing',
      overall: '更新后的整体要求',
      topPriorities: ['第一条', '第二条'],
      createdAt: fullBrief().createdAt,
      updatedAt: '2026-08-10T10:00:00.000Z',
    })

    setActivePinia(createPinia())
    const refreshed = createArchiveStore(repository)()
    await refreshed.load()
    expect(refreshed.briefsByPlanId['plan-existing']?.overall).toBe('更新后的整体要求')
    expect(await refreshed.deleteBrief('plan-existing')).toBe(true)
    expect(refreshed.briefsByPlanId['plan-existing']).toBeUndefined()
    expect(refreshed.plans[0]?.id).toBe('plan-existing')
  })

  test('validates brief target ownership and both 1..3 non-empty lists before writing', async () => {
    repository.profiles = [fullProfile()]
    repository.plans = [fullPlan()]
    repository.candidates = [fullCandidate(1), fullCandidate(2)]
    ids = ['brief-new']
    const store = useTestStore()
    await store.load()

    for (const invalid of [
      briefDraft({ targetCandidateId: 'not-in-plan' }),
      briefDraft({ top: '   ' }),
      briefDraft({ topPriorities: [] }),
      briefDraft({ topPriorities: ['1', '2', '3', '4'] }),
      briefDraft({ absoluteAvoids: ['   '] }),
      briefDraft({ absoluteAvoids: ['1', '2', '3', '4'] }),
    ]) {
      expect(await store.saveBrief('plan-existing', invalid)).toBeNull()
    }

    expect(repository.saveBriefCalls).toBe(0)
    expect(store.error).toMatch(/1 到 3 条|目标候选/)
  })

  test('prevents concurrent brief saves and keeps failed save or delete state visible', async () => {
    repository.profiles = [fullProfile()]
    repository.plans = [fullPlan()]
    repository.candidates = [fullCandidate(1), fullCandidate(2)]
    repository.briefs = [fullBrief()]
    let releaseSave!: () => void
    repository.briefSaveGate = new Promise((resolve) => {
      releaseSave = resolve
    })
    const store = useTestStore()
    await store.load()

    const first = store.saveBrief('plan-existing', briefDraft({ overall: '第一次更新' }))
    expect(await store.saveBrief('plan-existing', briefDraft({ overall: '不应并发写入' }))).toBeNull()
    expect(repository.saveBriefCalls).toBe(1)
    releaseSave()
    await first
    repository.briefSaveGate = null

    repository.nextFailure = new ArchiveStorageError('unavailable', new Error('technical'))
    expect(await store.saveBrief('plan-existing', briefDraft({ overall: '失败更新' }))).toBeNull()
    expect(store.briefsByPlanId['plan-existing']?.overall).toBe('第一次更新')
    expect(store.error).toMatch(/不可用|无痕/)
    expect(store.saving).toBe(false)

    repository.nextFailure = new ArchiveStorageError('unavailable', new Error('technical'))
    expect(await store.deleteBrief('plan-existing')).toBe(false)
    expect(store.briefsByPlanId['plan-existing']).toBeDefined()
    expect(store.saving).toBe(false)
  })

  test('synchronizes brief state after plan and profile cascades', async () => {
    repository.profiles = [fullProfile()]
    repository.plans = [fullPlan()]
    repository.candidates = [fullCandidate(1), fullCandidate(2)]
    repository.briefs = [fullBrief()]
    const store = useTestStore()
    await store.load()

    expect(await store.deletePlan('plan-existing')).toBe(true)
    expect(store.briefsByPlanId).toEqual({})

    repository.plans = [fullPlan()]
    repository.candidates = [fullCandidate(1), fullCandidate(2)]
    repository.briefs = [fullBrief()]
    await store.load()
    expect(await store.deleteProfile('profile-existing')).toBe(true)
    expect(store.briefsByPlanId).toEqual({})
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
      photos: [{
        stage: 'styled',
        image: localPhoto,
        width: 1280,
        height: 1920,
        bytes: localPhoto.size,
        processedAt: '2026-08-20T09:30:00.000Z',
      } satisfies HaircutPhotoDraft],
    })
    expect(created?.record).toMatchObject({
      id: 'record-new',
      priceCents: 12800,
      outcome: 'repeat',
    })
    expect(created?.photos[0]).toMatchObject({
      width: 1280,
      height: 1920,
      bytes: localPhoto.size,
      processedAt: '2026-08-20T09:30:00.000Z',
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

  test('does not reuse distinct local reference identities for new candidates', async () => {
    repository.profiles = [fullProfile()]
    ids = ['plan-new', 'candidate-new-1', 'candidate-new-2']
    const store = useTestStore()
    await store.load()

    const saved = await store.savePlan(planDraft({
      candidates: [1, 2].map((index) => ({
        name: `本地参考 ${index}`,
        notes: '',
        source: 'user_reference' as const,
        referenceId: `reference-${index}`,
        referenceImage: localPhoto,
        referenceImageWidth: 800,
        referenceImageHeight: 1000,
        referenceImageBytes: localPhoto.size,
        referenceImageProcessedAt: '2026-08-10T10:00:00.000Z',
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
