import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import {
  ArchiveRepository,
  ArchiveStorageError,
  ZajianfaDb,
} from './ArchiveRepository'
import type {
  AvoidRule,
  BarberBrief,
  BarberBriefWrite,
  Candidate,
  HairProfile,
  HaircutPhoto,
  HaircutPlan,
  HaircutRecord,
  StandardStyle,
} from './types'

export interface ArchiveRepositoryPort {
  createProfile(profile: HairProfile): Promise<string>
  listProfiles(): Promise<HairProfile[]>
  updateProfile(profile: HairProfile): Promise<string>
  deleteProfile(profileId: string): Promise<void>
  listPlans(profileId: string): Promise<HaircutPlan[]>
  listCandidates(planId: string): Promise<Candidate[]>
  savePlanWithCandidates(
    plan: HaircutPlan,
    candidates: readonly Candidate[],
  ): Promise<{ plan: HaircutPlan, candidates: Candidate[] }>
  deletePlan(planId: string): Promise<void>
  listBriefs(profileId: string): Promise<BarberBrief[]>
  getBrief(planId: string): Promise<BarberBrief | undefined>
  saveBrief(brief: BarberBriefWrite): Promise<BarberBrief>
  deleteBrief(planId: string): Promise<void>
  listRecords(profileId: string): Promise<HaircutRecord[]>
  listPhotos(recordId: string): Promise<HaircutPhoto[]>
  listAvoidRulesByProfile(profileId: string): Promise<AvoidRule[]>
  listStandardStylesByProfile(profileId: string): Promise<StandardStyle[]>
  saveRecordWithPhotos(
    record: HaircutRecord,
    photos: readonly HaircutPhoto[],
  ): Promise<{ record: HaircutRecord, photos: HaircutPhoto[] }>
  deleteRecord(recordId: string): Promise<void>
}

export type HairProfileDraft = {
  -readonly [Key in Exclude<keyof HairProfile, 'id' | 'createdAt' | 'updatedAt'>]: HairProfile[Key]
}
export type CandidateDraft = Omit<Candidate, 'id' | 'planId' | 'order'> & {
  readonly id?: string
}

export interface HaircutPlanDraft {
  readonly id?: string
  readonly title: string
  readonly date: string
  readonly status: 'draft' | 'ready'
  readonly candidates: readonly CandidateDraft[]
}

export type BarberBriefDraft = Omit<
  BarberBrief,
  'id' | 'profileId' | 'planId' | 'targetCandidateId' | 'createdAt' | 'updatedAt'
> & {
  readonly targetCandidateId: string
}

export type HaircutPhotoDraft = Pick<HaircutPhoto, 'stage' | 'image'> & Partial<Pick<
  HaircutPhoto,
  'id' | 'capturedAt' | 'width' | 'height' | 'bytes' | 'processedAt'
>>

export interface HaircutRecordDraft {
  readonly id?: string
  readonly planId?: string
  readonly date: string
  readonly styleName: string
  readonly salonName?: string
  readonly barberName?: string
  readonly serviceName?: string
  readonly priceCents?: number
  readonly durationMinutes?: number
  readonly notes?: string
  readonly satisfaction: number
  readonly outcome: 'repeat' | 'avoid'
  readonly avoidRules: readonly string[]
  readonly photos: readonly HaircutPhotoDraft[]
}

interface ArchiveStoreOptions {
  readonly now?: () => Date
  readonly createId?: () => string
}

const E2E_DATABASE_SESSION_KEY = '__zajianfa_e2e_archive_db__'

const resolveArchiveDatabaseName = () => {
  if (
    import.meta.env.VITE_ALLOW_ARCHIVE_DB_OVERRIDE === 'true'
    && typeof window !== 'undefined'
  ) {
    const overriddenName = window.sessionStorage.getItem(E2E_DATABASE_SESSION_KEY)?.trim()
    if (overriddenName) {
      return overriddenName
    }
  }

  return import.meta.env.VITE_ARCHIVE_DB_NAME?.trim() || 'zajianfa-archive'
}

export const defaultArchiveDb = new ZajianfaDb(resolveArchiveDatabaseName())
export const defaultArchiveRepository = new ArchiveRepository(defaultArchiveDb)

export const archiveErrorMessage = (error: unknown, action: 'load' | 'save' = 'save') => {
  if (error instanceof ArchiveStorageError) {
    if (error.code === 'quota_exceeded') {
      return '本设备空间不足，未能保存。请清理不需要的本地内容后重试。'
    }
    return '当前浏览器的本地档案存储不可用。无痕或隐私模式可能导致此问题，请改用普通窗口。'
  }

  return action === 'load'
    ? '档案暂时无法读取，请稍后重试。'
    : '保存失败，数据未写入，请重试。'
}

const sortProfiles = (profiles: readonly HairProfile[]) => (
  [...profiles].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
)

const sortPlans = (plans: readonly HaircutPlan[]) => (
  [...plans].sort((left, right) => (
    right.date.localeCompare(left.date) || right.updatedAt.localeCompare(left.updatedAt)
  ))
)

const sortRecords = (records: readonly HaircutRecord[]) => (
  [...records].sort((left, right) => (
    right.date.localeCompare(left.date) || right.updatedAt.localeCompare(left.updatedAt)
  ))
)

const sortCreated = <Item extends { readonly id: string, readonly createdAt: string }>(
  items: readonly Item[],
) => [...items].sort((left, right) => (
  right.createdAt.localeCompare(left.createdAt) || left.id.localeCompare(right.id)
))

export const createArchiveStore = (
  repository: ArchiveRepositoryPort,
  options: ArchiveStoreOptions = {},
) => defineStore('archive', () => {
  const now = options.now ?? (() => new Date())
  const createId = options.createId ?? (() => crypto.randomUUID())

  const profiles = ref<HairProfile[]>([])
  const plans = ref<HaircutPlan[]>([])
  const candidatesByPlanId = ref<Record<string, Candidate[]>>({})
  const briefsByPlanId = ref<Record<string, BarberBrief>>({})
  const records = ref<HaircutRecord[]>([])
  const photosByRecordId = ref<Record<string, HaircutPhoto[]>>({})
  const avoidRules = ref<AvoidRule[]>([])
  const standardStyles = ref<StandardStyle[]>([])
  const loading = ref(true)
  const saving = ref(false)
  const error = ref<string | null>(null)
  let loadPromise: Promise<void> | null = null
  let snapshotVersion = 0

  const profile = computed(() => profiles.value[0] ?? null)

  const fetchSnapshot = async () => {
    const loadedProfiles = sortProfiles(await repository.listProfiles())
    const primaryProfile = loadedProfiles[0]
    if (!primaryProfile) {
      return {
        profiles: loadedProfiles,
        plans: [] as HaircutPlan[],
        candidatesByPlanId: {} as Record<string, Candidate[]>,
        briefsByPlanId: {} as Record<string, BarberBrief>,
        records: [] as HaircutRecord[],
        photosByRecordId: {} as Record<string, HaircutPhoto[]>,
        avoidRules: [] as AvoidRule[],
        standardStyles: [] as StandardStyle[],
      }
    }

    const [
      loadedPlans,
      loadedBriefs,
      loadedRecords,
      loadedAvoidRules,
      loadedStandardStyles,
    ] = await Promise.all([
      repository.listPlans(primaryProfile.id).then(sortPlans),
      repository.listBriefs(primaryProfile.id),
      repository.listRecords(primaryProfile.id).then(sortRecords),
      repository.listAvoidRulesByProfile(primaryProfile.id).then(sortCreated),
      repository.listStandardStylesByProfile(primaryProfile.id).then(sortCreated),
    ])
    const candidateEntries = await Promise.all(loadedPlans.map(async ({ id }) => (
      [id, await repository.listCandidates(id)] as const
    )))
    const photoEntries = await Promise.all(loadedRecords.map(async ({ id }) => (
      [id, await repository.listPhotos(id)] as const
    )))

    return {
      profiles: loadedProfiles,
      plans: loadedPlans,
      candidatesByPlanId: Object.fromEntries(candidateEntries),
      briefsByPlanId: Object.fromEntries(loadedBriefs.map((brief) => [brief.planId, brief])),
      records: loadedRecords,
      photosByRecordId: Object.fromEntries(photoEntries),
      avoidRules: loadedAvoidRules,
      standardStyles: loadedStandardStyles,
    }
  }

  const applySnapshot = (snapshot: Awaited<ReturnType<typeof fetchSnapshot>>) => {
    profiles.value = snapshot.profiles
    plans.value = snapshot.plans
    candidatesByPlanId.value = snapshot.candidatesByPlanId
    briefsByPlanId.value = snapshot.briefsByPlanId
    records.value = snapshot.records
    photosByRecordId.value = snapshot.photosByRecordId
    avoidRules.value = snapshot.avoidRules
    standardStyles.value = snapshot.standardStyles
  }

  const load = () => {
    if (saving.value) {
      return Promise.resolve()
    }
    if (loadPromise) {
      return loadPromise
    }

    const requestVersion = snapshotVersion
    loading.value = true
    error.value = null
    loadPromise = (async () => {
      try {
        const snapshot = await fetchSnapshot()
        if (requestVersion === snapshotVersion) {
          applySnapshot(snapshot)
        }
      } catch (caught) {
        if (requestVersion === snapshotVersion) {
          error.value = archiveErrorMessage(caught, 'load')
        }
      } finally {
        if (requestVersion === snapshotVersion) {
          loading.value = false
        }
        loadPromise = null
      }
    })()
    return loadPromise
  }

  const beginMutation = () => {
    snapshotVersion += 1
    loading.value = false
    saving.value = true
    error.value = null
  }

  const saveProfile = async (draft: HairProfileDraft): Promise<HairProfile | null> => {
    if (saving.value) {
      return null
    }

    beginMutation()
    try {
      const current = profile.value
      const timestamp = now().toISOString()
      const saved: HairProfile = {
        ...draft,
        name: draft.name.trim(),
        preferenceNotes: draft.preferenceNotes.trim(),
        id: current?.id ?? createId(),
        createdAt: current?.createdAt ?? timestamp,
        updatedAt: timestamp,
      }

      if (current) {
        await repository.updateProfile(saved)
      } else {
        await repository.createProfile(saved)
      }
      profiles.value = sortProfiles([
        ...profiles.value.filter(({ id }) => id !== saved.id),
        saved,
      ])
      return saved
    } catch (caught) {
      error.value = archiveErrorMessage(caught)
      return null
    } finally {
      saving.value = false
    }
  }

  const deleteProfile = async (profileId: string): Promise<boolean> => {
    if (saving.value) {
      return false
    }

    beginMutation()
    try {
      await repository.deleteProfile(profileId)
      profiles.value = profiles.value.filter(({ id }) => id !== profileId)
      plans.value = []
      candidatesByPlanId.value = {}
      briefsByPlanId.value = {}
      records.value = []
      photosByRecordId.value = {}
      avoidRules.value = []
      standardStyles.value = []
      try {
        applySnapshot(await fetchSnapshot())
      } catch (caught) {
        error.value = archiveErrorMessage(caught, 'load')
      }
      return true
    } catch (caught) {
      error.value = archiveErrorMessage(caught)
      return false
    } finally {
      saving.value = false
    }
  }

  const savePlan = async (
    draft: HaircutPlanDraft,
  ): Promise<{ plan: HaircutPlan, candidates: Candidate[] } | null> => {
    const currentProfile = profile.value
    if (!currentProfile) {
      error.value = '请先建立本设备档案，再创建发型计划。'
      return null
    }
    if (draft.candidates.length < 2 || draft.candidates.length > 4) {
      error.value = '请选择 2 到 4 个不重复的示例候选。'
      return null
    }
    const demoPaths = draft.candidates.map(({ demoImagePath }) => demoImagePath).filter(Boolean)
    if (new Set(demoPaths).size !== demoPaths.length) {
      error.value = '请选择 2 到 4 个不重复的示例候选。'
      return null
    }
    if (saving.value) {
      return null
    }

    beginMutation()
    try {
      const existingPlan = plans.value.find(({ id }) => id === draft.id)
      const timestamp = now().toISOString()
      const planId = existingPlan?.id ?? createId()
      const existingCandidates = candidatesByPlanId.value[planId] ?? []
      const plan: HaircutPlan = {
        id: planId,
        profileId: currentProfile.id,
        title: draft.title.trim(),
        date: draft.date,
        status: draft.status,
        createdAt: existingPlan?.createdAt ?? timestamp,
        updatedAt: timestamp,
      }
      const usedExistingIds = new Set<string>()
      const candidates = draft.candidates.map((candidate, index): Candidate => {
        const existing = existingCandidates.find((item) => (
          !usedExistingIds.has(item.id)
          && (
            candidate.id === item.id
            || (
              !candidate.id
              && candidate.demoImagePath !== undefined
              && item.demoImagePath === candidate.demoImagePath
            )
            || (
              !candidate.id
              && candidate.pastRecordId !== undefined
              && item.pastRecordId === candidate.pastRecordId
            )
          )
        ))
        if (existing) {
          usedExistingIds.add(existing.id)
        }
        return {
          ...candidate,
          id: existing?.id ?? createId(),
          planId,
          order: index + 1,
          name: candidate.name.trim(),
          notes: candidate.notes.trim(),
        }
      })

      const saved = await repository.savePlanWithCandidates(plan, candidates)
      plans.value = sortPlans([
        ...plans.value.filter(({ id }) => id !== saved.plan.id),
        saved.plan,
      ])
      candidatesByPlanId.value = {
        ...candidatesByPlanId.value,
        [saved.plan.id]: saved.candidates,
      }
      return saved
    } catch (caught) {
      error.value = archiveErrorMessage(caught)
      return null
    } finally {
      saving.value = false
    }
  }

  const deletePlan = async (planId: string): Promise<boolean> => {
    if (saving.value) {
      return false
    }

    beginMutation()
    try {
      await repository.deletePlan(planId)
      plans.value = plans.value.filter(({ id }) => id !== planId)
      const nextCandidates = { ...candidatesByPlanId.value }
      delete nextCandidates[planId]
      candidatesByPlanId.value = nextCandidates
      const nextBriefs = { ...briefsByPlanId.value }
      delete nextBriefs[planId]
      briefsByPlanId.value = nextBriefs
      return true
    } catch (caught) {
      error.value = archiveErrorMessage(caught)
      return false
    } finally {
      saving.value = false
    }
  }

  const saveBrief = async (
    planId: string,
    draft: BarberBriefDraft,
  ): Promise<BarberBrief | null> => {
    const currentProfile = profile.value
    const plan = plans.value.find(({ id }) => id === planId)
    if (!currentProfile || !plan || plan.profileId !== currentProfile.id) {
      error.value = '没有找到要保存沟通卡的计划。'
      return null
    }
    const candidates = candidatesByPlanId.value[planId] ?? []
    if (!candidates.some(({ id }) => id === draft.targetCandidateId)) {
      error.value = '请选择属于当前计划的目标候选。'
      return null
    }
    const sections = [
      draft.overall,
      draft.top,
      draft.fringe,
      draft.sides,
      draft.sideburns,
      draft.back,
    ]
    if (sections.some((section) => section.trim().length === 0)) {
      error.value = '请填写整体、顶部、刘海、两侧、鬓角和后脑要求。'
      return null
    }
    const topPriorities = draft.topPriorities.map((item) => item.trim())
    const absoluteAvoids = draft.absoluteAvoids.map((item) => item.trim())
    if (
      topPriorities.length < 1
      || topPriorities.length > 3
      || topPriorities.some((item) => item.length === 0)
      || absoluteAvoids.length < 1
      || absoluteAvoids.length > 3
      || absoluteAvoids.some((item) => item.length === 0)
    ) {
      error.value = '“最在意”和“绝对不要”都需要 1 到 3 条非空内容。'
      return null
    }
    if (saving.value) {
      return null
    }

    beginMutation()
    try {
      const existing = briefsByPlanId.value[planId]
      const timestamp = now().toISOString()
      const brief: BarberBriefWrite = {
        id: existing?.id ?? createId(),
        profileId: currentProfile.id,
        planId,
        targetCandidateId: draft.targetCandidateId,
        overall: draft.overall.trim(),
        top: draft.top.trim(),
        fringe: draft.fringe.trim(),
        sides: draft.sides.trim(),
        sideburns: draft.sideburns.trim(),
        back: draft.back.trim(),
        topPriorities,
        absoluteAvoids,
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
      }
      const saved = await repository.saveBrief(brief)
      briefsByPlanId.value = {
        ...briefsByPlanId.value,
        [planId]: saved,
      }
      return saved
    } catch (caught) {
      error.value = archiveErrorMessage(caught)
      return null
    } finally {
      saving.value = false
    }
  }

  const deleteBrief = async (planId: string): Promise<boolean> => {
    if (saving.value) {
      return false
    }

    beginMutation()
    try {
      await repository.deleteBrief(planId)
      const nextBriefs = { ...briefsByPlanId.value }
      delete nextBriefs[planId]
      briefsByPlanId.value = nextBriefs
      return true
    } catch (caught) {
      error.value = archiveErrorMessage(caught)
      return false
    } finally {
      saving.value = false
    }
  }

  const saveRecord = async (
    draft: HaircutRecordDraft,
  ): Promise<{ record: HaircutRecord, photos: HaircutPhoto[] } | null> => {
    const currentProfile = profile.value
    if (!currentProfile) {
      error.value = '请先建立本设备档案，再记录这次理发。'
      return null
    }
    if (draft.styleName.trim().length === 0 || Number.isNaN(Date.parse(draft.date))) {
      error.value = '请填写有效的理发日期和发型名。'
      return null
    }
    if (!Number.isInteger(draft.satisfaction) || draft.satisfaction < 1 || draft.satisfaction > 5) {
      error.value = '满意度必须是 1 到 5 的整数。'
      return null
    }
    if (draft.photos.length < 1) {
      error.value = '请至少选择一张剪后阶段照片。'
      return null
    }
    if (
      draft.priceCents !== undefined
      && (!Number.isInteger(draft.priceCents) || draft.priceCents < 0)
    ) {
      error.value = '价格必须是精确到分的非负金额。'
      return null
    }
    if (
      draft.durationMinutes !== undefined
      && (!Number.isInteger(draft.durationMinutes) || draft.durationMinutes < 1)
    ) {
      error.value = '耗时必须是大于 0 的整数分钟。'
      return null
    }
    const normalizedAvoidRules = draft.avoidRules
      .map((rule) => rule.trim())
      .filter(Boolean)
    if (
      draft.outcome === 'avoid'
      && (normalizedAvoidRules.length < 1 || normalizedAvoidRules.length > 3)
    ) {
      error.value = '选择避雷时，请填写 1 到 3 条非空规则。'
      return null
    }
    if (saving.value) {
      return null
    }

    beginMutation()
    try {
      const existing = draft.id
        ? records.value.find(({ id }) => id === draft.id)
        : undefined
      if (draft.id && !existing) {
        error.value = '没有找到要编辑的剪后记录。'
        return null
      }
      const timestamp = now().toISOString()
      const recordId = existing?.id ?? createId()
      const optionalText = (value?: string) => value?.trim() || undefined
      const base = {
        id: recordId,
        profileId: currentProfile.id,
        planId: draft.planId || undefined,
        date: draft.date,
        status: 'completed' as const,
        satisfaction: draft.satisfaction as HaircutRecord['satisfaction'],
        styleName: draft.styleName.trim(),
        salonName: optionalText(draft.salonName),
        barberName: optionalText(draft.barberName),
        serviceName: optionalText(draft.serviceName),
        priceCents: draft.priceCents,
        durationMinutes: draft.durationMinutes,
        notes: optionalText(draft.notes),
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
      }
      const record: HaircutRecord = draft.outcome === 'repeat'
        ? { ...base, outcome: 'repeat' }
        : { ...base, outcome: 'avoid', avoidRules: normalizedAvoidRules }
      const photos = draft.photos.map((photo): HaircutPhoto => ({
        ...photo,
        id: photo.id ?? createId(),
        recordId,
        stage: photo.stage,
        image: photo.image,
        capturedAt: photo.capturedAt ?? timestamp,
      }))

      const saved = await repository.saveRecordWithPhotos(record, photos)
      records.value = sortRecords([
        ...records.value.filter(({ id }) => id !== recordId),
        saved.record,
      ])
      photosByRecordId.value = {
        ...photosByRecordId.value,
        [recordId]: saved.photos,
      }
      avoidRules.value = avoidRules.value.filter(({ recordId: id }) => id !== recordId)
      standardStyles.value = standardStyles.value.filter(({ recordId: id }) => id !== recordId)
      if (record.outcome === 'repeat') {
        standardStyles.value = sortCreated([...standardStyles.value, {
          id: `standard-style:${record.id}`,
          profileId: record.profileId,
          recordId: record.id,
          name: record.styleName,
          createdAt: record.updatedAt,
          active: true,
        }])
      } else {
        avoidRules.value = sortCreated([
          ...avoidRules.value,
          ...record.avoidRules.map((text, index) => ({
            id: `avoid-rule:${record.id}:${index + 1}`,
            profileId: record.profileId,
            recordId: record.id,
            text,
            createdAt: record.updatedAt,
            active: true,
          })),
        ])
      }
      return saved
    } catch (caught) {
      error.value = archiveErrorMessage(caught)
      return null
    } finally {
      saving.value = false
    }
  }

  const deleteRecord = async (recordId: string): Promise<boolean> => {
    if (saving.value) {
      return false
    }

    beginMutation()
    try {
      await repository.deleteRecord(recordId)
      records.value = records.value.filter(({ id }) => id !== recordId)
      const nextPhotos = { ...photosByRecordId.value }
      delete nextPhotos[recordId]
      photosByRecordId.value = nextPhotos
      avoidRules.value = avoidRules.value.filter(({ recordId: id }) => id !== recordId)
      standardStyles.value = standardStyles.value.filter(({ recordId: id }) => id !== recordId)
      return true
    } catch (caught) {
      error.value = archiveErrorMessage(caught)
      return false
    } finally {
      saving.value = false
    }
  }

  return {
    profiles,
    profile,
    plans,
    candidatesByPlanId,
    briefsByPlanId,
    records,
    photosByRecordId,
    avoidRules,
    standardStyles,
    loading,
    saving,
    error,
    load,
    saveProfile,
    deleteProfile,
    savePlan,
    deletePlan,
    saveBrief,
    deleteBrief,
    saveRecord,
    deleteRecord,
  }
})

export const useArchiveStore = createArchiveStore(defaultArchiveRepository)
