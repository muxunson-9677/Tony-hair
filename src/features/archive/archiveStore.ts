import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import {
  ArchiveRepository,
  ArchiveStorageError,
  ZajianfaDb,
} from './ArchiveRepository'
import type { Candidate, HairProfile, HaircutPlan } from './types'

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

export const createArchiveStore = (
  repository: ArchiveRepositoryPort,
  options: ArchiveStoreOptions = {},
) => defineStore('archive', () => {
  const now = options.now ?? (() => new Date())
  const createId = options.createId ?? (() => crypto.randomUUID())

  const profiles = ref<HairProfile[]>([])
  const plans = ref<HaircutPlan[]>([])
  const candidatesByPlanId = ref<Record<string, Candidate[]>>({})
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
      }
    }

    const loadedPlans = sortPlans(await repository.listPlans(primaryProfile.id))
    const candidateEntries = await Promise.all(loadedPlans.map(async ({ id }) => (
      [id, await repository.listCandidates(id)] as const
    )))

    return {
      profiles: loadedProfiles,
      plans: loadedPlans,
      candidatesByPlanId: Object.fromEntries(candidateEntries),
    }
  }

  const applySnapshot = (snapshot: Awaited<ReturnType<typeof fetchSnapshot>>) => {
    profiles.value = snapshot.profiles
    plans.value = snapshot.plans
    candidatesByPlanId.value = snapshot.candidatesByPlanId
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
    loading,
    saving,
    error,
    load,
    saveProfile,
    deleteProfile,
    savePlan,
    deletePlan,
  }
})

export const useArchiveStore = createArchiveStore(defaultArchiveRepository)
