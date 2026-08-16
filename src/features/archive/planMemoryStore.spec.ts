import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, test } from 'vitest'

import {
  createArchiveStore,
  type ArchiveRepositoryPort,
  type PlanMemoryDraft,
} from './archiveStore'
import type {
  AvoidRule,
  BarberBrief,
  Candidate,
  HairProfile,
  HaircutPhoto,
  HaircutPlan,
  HaircutRecord,
  PlanMemoryItem,
  StandardStyle,
} from './types'

const existingProfile: HairProfile = {
  id: 'profile-1',
  name: '阿青',
  hairTexture: 'wavy',
  strandThickness: 'fine',
  density: 'medium',
  stylingMinutes: 8,
  washFrequency: 'every_other_day',
  preferenceNotes: '',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
}

class StubRepository implements ArchiveRepositoryPort {
  profiles: HairProfile[] = [existingProfile]
  plans: HaircutPlan[] = []
  candidates: Candidate[] = []
  briefs: BarberBrief[] = []
  records: HaircutRecord[] = []
  photos: HaircutPhoto[] = []
  avoidRules: AvoidRule[] = []
  standardStyles: StandardStyle[] = []
  planMemoryItems: PlanMemoryItem[] = []

  async createProfile(profile: HairProfile) {
    this.profiles.push(profile)
    return profile.id
  }

  async listProfiles() {
    return [...this.profiles]
  }

  async updateProfile(profile: HairProfile) {
    return profile.id
  }

  async deleteProfile() {}

  async listPlans(profileId: string) {
    return this.plans.filter(({ profileId: id }) => id === profileId)
  }

  async listCandidates(planId: string) {
    return this.candidates.filter(({ planId: id }) => id === planId)
  }

  async listPlanMemoryItems(planId: string) {
    return this.planMemoryItems
      .filter(({ planId: id }) => id === planId)
      .sort((left, right) => left.order - right.order)
  }

  async savePlanWithCandidates(
    plan: HaircutPlan,
    candidates: readonly Candidate[],
    memoryItems: readonly PlanMemoryItem[] = [],
  ) {
    this.plans = [...this.plans.filter(({ id }) => id !== plan.id), plan]
    this.candidates = [
      ...this.candidates.filter(({ planId }) => planId !== plan.id),
      ...candidates,
    ]
    this.planMemoryItems = [
      ...this.planMemoryItems.filter(({ planId }) => planId !== plan.id),
      ...memoryItems,
    ]
    return { plan, candidates: [...candidates], memoryItems: [...memoryItems] }
  }

  async deletePlan(planId: string) {
    this.plans = this.plans.filter(({ id }) => id !== planId)
    this.planMemoryItems = this.planMemoryItems.filter(({ planId: id }) => id !== planId)
  }

  async listBriefs() {
    return [...this.briefs]
  }

  async getBrief(planId: string) {
    return this.briefs.find(({ planId: id }) => id === planId)
  }

  async saveBrief(brief: BarberBrief) {
    this.briefs = [...this.briefs.filter(({ planId }) => planId !== brief.planId), brief]
    return brief
  }

  async deleteBrief() {}

  async listRecords() {
    return [...this.records]
  }

  async listPhotos() {
    return [...this.photos]
  }

  async listAvoidRulesByProfile() {
    return [...this.avoidRules]
  }

  async listStandardStylesByProfile() {
    return [...this.standardStyles]
  }

  async saveRecordWithPhotos(record: HaircutRecord, photos: readonly HaircutPhoto[]) {
    return { record, photos: [...photos] }
  }

  async deleteRecord() {}
}

const demoCandidates = [
  { name: '方案一', notes: '', source: 'demo_ai' as const, demoImagePath: '/demo/persona-lin-bob.webp' },
  { name: '方案二', notes: '', source: 'demo_ai' as const, demoImagePath: '/demo/persona-lin-pixie.webp' },
]

const memoryDraft = (overrides: Partial<PlanMemoryDraft> = {}): PlanMemoryDraft => ({
  kind: 'avoid',
  text: '两侧不要推白',
  originalText: '两侧不要推白',
  source: 'avoid_rule',
  sourceRecordId: 'record-1',
  sourceRecordDate: '2026-08-01',
  sourceLabel: '翻车发型',
  ...overrides,
})

describe('archive store plan memories', () => {
  let repository: StubRepository
  let store: ReturnType<ReturnType<typeof createArchiveStore>>

  beforeEach(async () => {
    setActivePinia(createPinia())
    repository = new StubRepository()
    let counter = 0
    store = createArchiveStore(repository, {
      now: () => new Date('2026-08-13T00:00:00.000Z'),
      createId: () => `generated-${counter += 1}`,
    })()
    await store.load()
  })

  test('saves confirmed memories with the plan and exposes them by plan id', async () => {
    const saved = await store.savePlan({
      title: '新计划',
      date: '2026-08-20',
      mode: 'exploration',
      status: 'draft',
      candidates: demoCandidates,
      memories: [
        memoryDraft({ kind: 'adjustment', source: 'adjustment_note', text: '两侧留长一点' }),
        memoryDraft(),
      ],
    })

    expect(saved).not.toBeNull()
    const items = store.planMemoryByPlanId[saved!.plan.id]
    expect(items).toHaveLength(2)
    expect(items![0]).toMatchObject({
      planId: saved!.plan.id,
      profileId: 'profile-1',
      order: 1,
      kind: 'adjustment',
      text: '两侧留长一点',
      originalText: '两侧不要推白',
      createdAt: '2026-08-13T00:00:00.000Z',
    })
    expect(items![1]).toMatchObject({ order: 2, kind: 'avoid' })
  })

  test('rejects blank memory texts before saving anything', async () => {
    const saved = await store.savePlan({
      title: '新计划',
      date: '2026-08-20',
      mode: 'exploration',
      status: 'draft',
      candidates: demoCandidates,
      memories: [memoryDraft({ text: '   ' })],
    })
    expect(saved).toBeNull()
    expect(store.error).toContain('不能是空白')
    expect(repository.plans).toHaveLength(0)
  })

  test('rejects memory texts above 160 characters', async () => {
    const saved = await store.savePlan({
      title: '新计划',
      date: '2026-08-20',
      mode: 'exploration',
      status: 'draft',
      candidates: demoCandidates,
      memories: [memoryDraft({ text: '长'.repeat(161) })],
    })
    expect(saved).toBeNull()
    expect(store.error).toContain('160')
  })

  test('keeps createdAt and originalText while updating edited text', async () => {
    const first = await store.savePlan({
      title: '新计划',
      date: '2026-08-20',
      mode: 'exploration',
      status: 'draft',
      candidates: demoCandidates,
      memories: [memoryDraft()],
    })
    const planId = first!.plan.id
    const savedItem = store.planMemoryByPlanId[planId]![0]!

    const second = await store.savePlan({
      id: planId,
      title: '新计划',
      date: '2026-08-20',
      mode: 'exploration',
      status: 'draft',
      candidates: demoCandidates,
      memories: [{
        id: savedItem.id,
        kind: savedItem.kind,
        text: '两侧保留 6mm 以上',
        originalText: savedItem.originalText,
        source: savedItem.source,
        sourceRecordId: savedItem.sourceRecordId,
        sourceRecordDate: savedItem.sourceRecordDate,
        sourceLabel: savedItem.sourceLabel,
      }],
    })

    const updated = store.planMemoryByPlanId[second!.plan.id]![0]!
    expect(updated.id).toBe(savedItem.id)
    expect(updated.text).toBe('两侧保留 6mm 以上')
    expect(updated.originalText).toBe('两侧不要推白')
    expect(updated.createdAt).toBe(savedItem.createdAt)
  })

  test('preserves the existing snapshot when memories are not provided', async () => {
    const first = await store.savePlan({
      title: '新计划',
      date: '2026-08-20',
      mode: 'exploration',
      status: 'draft',
      candidates: demoCandidates,
      memories: [memoryDraft()],
    })
    const planId = first!.plan.id

    await store.savePlan({
      id: planId,
      title: '改名计划',
      date: '2026-08-21',
      mode: 'exploration',
      status: 'draft',
      candidates: demoCandidates,
    })

    expect(store.planMemoryByPlanId[planId]).toHaveLength(1)
    expect(repository.planMemoryItems).toHaveLength(1)
  })

  test('deleting a memory in the draft removes it from the saved snapshot', async () => {
    const first = await store.savePlan({
      title: '新计划',
      date: '2026-08-20',
      mode: 'exploration',
      status: 'draft',
      candidates: demoCandidates,
      memories: [memoryDraft(), memoryDraft({ text: '刘海不要剪太短' })],
    })
    const planId = first!.plan.id

    await store.savePlan({
      id: planId,
      title: '新计划',
      date: '2026-08-20',
      mode: 'exploration',
      status: 'draft',
      candidates: demoCandidates,
      memories: [],
    })

    expect(store.planMemoryByPlanId[planId]).toBeUndefined()
    expect(repository.planMemoryItems).toHaveLength(0)
  })

  test('deleting a plan removes its memories from the store map', async () => {
    const saved = await store.savePlan({
      title: '新计划',
      date: '2026-08-20',
      mode: 'exploration',
      status: 'draft',
      candidates: demoCandidates,
      memories: [memoryDraft()],
    })
    const planId = saved!.plan.id
    await store.deletePlan(planId)
    expect(store.planMemoryByPlanId[planId]).toBeUndefined()
  })
})
