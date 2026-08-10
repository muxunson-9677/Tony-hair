import { fireEvent, render, screen, waitFor } from '@testing-library/vue'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { useArchiveStore } from '../features/archive/archiveStore'
import type { Candidate, HaircutPlan } from '../features/archive/types'
import {
  POLL_DRAFT_REPOSITORY_KEY,
  type PollDraftRepositoryPort,
} from '../features/polls/pollRuntime'
import type { PollDraft, PollDraftStatus } from '../features/polls/types'
import ArchivePlanDetailView from './ArchivePlanDetailView.vue'
import ArchiveProfileView from './ArchiveProfileView.vue'

const profile = {
  id: 'profile-1',
  name: '阿青',
  hairTexture: 'wavy' as const,
  strandThickness: 'fine' as const,
  density: 'medium' as const,
  stylingMinutes: 8,
  washFrequency: 'every_other_day' as const,
  preferenceNotes: '不要贴头皮',
  createdAt: '2026-08-10T00:00:00.000Z',
  updatedAt: '2026-08-10T00:00:00.000Z',
}

const newerProfile = {
  ...profile,
  id: 'profile-2',
  name: '后来更新的档案',
  updatedAt: '2026-08-11T00:00:00.000Z',
}

const plan: HaircutPlan = {
  id: 'plan-1',
  profileId: profile.id,
  title: '下次短发计划',
  date: '2026-08-18',
  status: 'ready',
  createdAt: '2026-08-10T01:00:00.000Z',
  updatedAt: '2026-08-10T01:00:00.000Z',
}

const secondPlan: HaircutPlan = {
  ...plan,
  id: 'plan-2',
  title: '另一个短发计划',
}

const newerProfilePlan: HaircutPlan = {
  ...plan,
  id: 'plan-for-profile-2',
  profileId: newerProfile.id,
  title: '另一个档案的计划',
}

const candidates: Candidate[] = [1, 2].map((order) => ({
  id: `candidate-${order}`,
  planId: plan.id,
  order,
  name: `候选 ${order}`,
  notes: '',
  source: 'demo_ai' as const,
  demoImagePath: order === 1
    ? '/demo/persona-lin-bob.webp'
    : '/demo/persona-ran-crop.webp',
}))

const draftFor = (status: PollDraftStatus): PollDraft => ({
  id: `poll-draft:${plan.id}`,
  planId: plan.id,
  title: '帮我选下次发型',
  clientRequestId: 'client_request_1234567890',
  managementToken: status === 'revoked'
    ? undefined
    : 'management_token_that_must_stay_local_1234567890',
  status,
  options: candidates.map((candidate, index) => ({
    candidateId: candidate.id,
    label: candidate.name,
    disclosure: 'demo',
    uploadId: `upload_${index + 1}_1234567890`,
    uploadStatus: status === 'draft' ? 'masked' : 'uploaded',
    maskedImage: status === 'draft' ? new Blob(['masked'], { type: 'image/webp' }) : undefined,
  })),
  pollId: status === 'active' || status === 'revoking'
    ? 'public_poll_id_1234567890'
    : undefined,
  expiresAt: status === 'active' || status === 'revoking'
    ? '2026-08-17T04:00:00.000Z'
    : undefined,
  createdAt: '2026-08-10T04:00:00.000Z',
  updatedAt: '2026-08-10T04:00:00.000Z',
})

const repositoryFor = (initialDraft: PollDraft, callOrder: string[]) => {
  let storedDraft: PollDraft | undefined = initialDraft
  const getByPlanId = vi.fn(async (planId: string) => (
    storedDraft?.planId === planId ? storedDraft : undefined
  ))
  const discardByPlanIds = vi.fn(async () => {
    callOrder.push('discard-poll-draft')
    storedDraft = undefined
  })
  const retireForArchiveDeletion = vi.fn(async () => {
    callOrder.push('retire-poll-draft')
    if (storedDraft && ['draft', 'uploading', 'revoked'].includes(storedDraft.status)) {
      storedDraft = undefined
    }
  })
  return {
    repository: {
      getByPlanId,
      discardByPlanIds,
      retireForArchiveDeletion,
    } as unknown as PollDraftRepositoryPort,
    getByPlanId,
    discardByPlanIds,
    retireForArchiveDeletion,
    getStoredDraft: () => storedDraft,
    setStoredDraft: (draft: PollDraft) => { storedDraft = draft },
  }
}

const renderPlan = async (
  repository: PollDraftRepositoryPort,
  callOrder: string[],
  archiveDeleteResult = true,
) => {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useArchiveStore(pinia)
  store.$patch({
    loading: false,
    error: null,
    profiles: [profile],
    plans: [plan],
    candidatesByPlanId: { [plan.id]: candidates },
    briefsByPlanId: {},
    photosByRecordId: {},
  })
  store.load = vi.fn(async () => {})
  const deletePlan = vi.fn(async () => {
    callOrder.push('delete-plan')
    if (!archiveDeleteResult) store.error = '保存失败，数据未写入，请重试。'
    return archiveDeleteResult
  })
  store.deletePlan = deletePlan

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/archive/plans/:id', component: ArchivePlanDetailView },
      { path: '/archive/plans/:id/poll/new', component: { template: '<div />' } },
      { path: '/archive/plans/:id/brief', component: { template: '<div />' } },
      { path: '/archive/plans/:id/edit', component: { template: '<div />' } },
      { path: '/polls/:id/manage', component: { template: '<div />' } },
      { path: '/archive', component: { template: '<div />' } },
    ],
  })
  await router.push(`/archive/plans/${plan.id}`)
  await router.isReady()
  render(ArchivePlanDetailView, {
    global: {
      plugins: [pinia, router],
      provide: { [POLL_DRAFT_REPOSITORY_KEY as symbol]: repository },
    },
  })
  await screen.findByRole('heading', { level: 1, name: plan.title })
  return { deletePlan, router }
}

const renderProfile = async (
  repository: PollDraftRepositoryPort,
  callOrder: string[],
  archiveDeleteResult = true,
  profilePlans: HaircutPlan[] = [plan],
) => {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useArchiveStore(pinia)
  store.$patch({
    loading: false,
    error: null,
    profiles: [profile],
    plans: profilePlans,
    candidatesByPlanId: { [plan.id]: candidates },
    photosByRecordId: {},
  })
  store.load = vi.fn(async () => {})
  const deleteProfile = vi.fn(async () => {
    callOrder.push('delete-profile')
    if (!archiveDeleteResult) store.error = '保存失败，数据未写入，请重试。'
    return archiveDeleteResult
  })
  store.deleteProfile = deleteProfile

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/archive/profile', component: ArchiveProfileView },
      { path: '/archive/plans/:id/poll/new', component: { template: '<div />' } },
      { path: '/polls/:id/manage', component: { template: '<div />' } },
      { path: '/archive', component: { template: '<div />' } },
    ],
  })
  await router.push('/archive/profile')
  await router.isReady()
  render(ArchiveProfileView, {
    global: {
      plugins: [pinia, router],
      provide: { [POLL_DRAFT_REPOSITORY_KEY as symbol]: repository },
    },
  })
  await screen.findByRole('heading', { level: 1, name: '编辑发型档案' })
  return { deleteProfile, router, store }
}

afterEach(() => vi.restoreAllMocks())

describe('ArchivePlanDetailView poll-aware deletion', () => {
  test.each(['draft', 'uploading', 'revoked'] as const)(
    'discards a %s PollDraft before deleting the plan after explicit confirmation',
    async (status) => {
      const callOrder: string[] = []
      const local = repositoryFor(draftFor(status), callOrder)
      const confirmDelete = vi.spyOn(window, 'confirm').mockReturnValue(true)
      const { deletePlan } = await renderPlan(local.repository, callOrder)

      await fireEvent.click(screen.getByRole('button', { name: '删除计划' }))

      await waitFor(() => expect(deletePlan).toHaveBeenCalledWith(plan.id))
      expect(callOrder).toEqual(['retire-poll-draft', 'delete-plan'])
      expect(local.retireForArchiveDeletion).toHaveBeenCalledWith([plan.id])
      expect(local.discardByPlanIds).not.toHaveBeenCalled()
      expect(local.getStoredDraft()).toBeUndefined()
      expect(confirmDelete).toHaveBeenCalledWith(status === 'revoked'
        ? expect.stringMatching(/删除.*计划/)
        : expect.stringMatching(/旧分享草稿.*遮罩图.*管理信息/))
      expect(confirmDelete.mock.calls.flat().join('')).not.toMatch(/投票/)
    },
  )

  test.each(['creating', 'active', 'revoking'] as const)(
    'preserves a complete %s PollDraft while allowing plan deletion without a retired UI link',
    async (status) => {
      const callOrder: string[] = []
      const original = draftFor(status)
      const local = repositoryFor(original, callOrder)
      const confirmDelete = vi.spyOn(window, 'confirm').mockReturnValue(true)
      const { deletePlan } = await renderPlan(local.repository, callOrder)

      await fireEvent.click(screen.getByRole('button', { name: '删除计划' }))

      await waitFor(() => expect(deletePlan).toHaveBeenCalledWith(plan.id))
      expect(callOrder).toEqual(['retire-poll-draft', 'delete-plan'])
      expect(local.retireForArchiveDeletion).toHaveBeenCalledWith([plan.id])
      expect(local.discardByPlanIds).not.toHaveBeenCalled()
      expect(confirmDelete).toHaveBeenCalledWith(expect.stringMatching(/删除.*计划/))
      expect(local.getStoredDraft()).toEqual(original)
      expect(screen.queryByRole('link', { name: /投票/ })).toBeNull()
    },
  )

  test('preserves a draft promoted to creating after preflight and still deletes the plan', async () => {
    const callOrder: string[] = []
    const original = draftFor('draft')
    const promoted: PollDraft = { ...original, status: 'creating' }
    const local = repositoryFor(original, callOrder)
    local.retireForArchiveDeletion.mockImplementationOnce(async () => {
      callOrder.push('retire-poll-draft')
      local.setStoredDraft(promoted)
    })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { deletePlan } = await renderPlan(local.repository, callOrder)

    await fireEvent.click(screen.getByRole('button', { name: '删除计划' }))

    await waitFor(() => expect(deletePlan).toHaveBeenCalledWith(plan.id))
    expect(callOrder).toEqual(['retire-poll-draft', 'delete-plan'])
    expect(local.discardByPlanIds).not.toHaveBeenCalled()
    expect(local.getStoredDraft()).toEqual(promoted)
    expect(local.getStoredDraft()?.managementToken).toBe(original.managementToken)
  })

  test('keeps the plan and shows an alert when PollDraft cleanup fails', async () => {
    const callOrder: string[] = []
    const local = repositoryFor(draftFor('draft'), callOrder)
    local.retireForArchiveDeletion.mockRejectedValueOnce(new Error('IndexedDB unavailable'))
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { deletePlan } = await renderPlan(local.repository, callOrder)

    await fireEvent.click(screen.getByRole('button', { name: '删除计划' }))

    expect((await screen.findByRole('alert')).textContent).toMatch(/旧分享草稿.*未删除/)
    expect(screen.getByRole('alert').textContent).not.toMatch(/投票/)
    expect(deletePlan).not.toHaveBeenCalled()
  })

  test('keeps the plan in place when archive deletion fails after confirmed PollDraft cleanup', async () => {
    const callOrder: string[] = []
    const local = repositoryFor(draftFor('draft'), callOrder)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { deletePlan, router } = await renderPlan(local.repository, callOrder, false)

    await fireEvent.click(screen.getByRole('button', { name: '删除计划' }))

    await waitFor(() => expect(deletePlan).toHaveBeenCalledWith(plan.id))
    expect(callOrder).toEqual(['retire-poll-draft', 'delete-plan'])
    expect(local.getStoredDraft()).toBeUndefined()
    expect(router.currentRoute.value.path).toBe(`/archive/plans/${plan.id}`)
    expect((await screen.findByRole('alert')).textContent).toMatch(/保存失败/)
  })
})

describe('ArchiveProfileView poll-aware deletion', () => {
  test.each(['draft', 'uploading', 'revoked'] as const)(
    'discards a %s PollDraft before deleting the profile after explicit confirmation',
    async (status) => {
      const callOrder: string[] = []
      const local = repositoryFor(draftFor(status), callOrder)
      const confirmDelete = vi.spyOn(window, 'confirm').mockReturnValue(true)
      const { deleteProfile } = await renderProfile(local.repository, callOrder)

      await fireEvent.click(screen.getByRole('button', { name: '删除档案及其内容' }))

      await waitFor(() => expect(deleteProfile).toHaveBeenCalledWith(profile.id))
      expect(callOrder).toEqual(['retire-poll-draft', 'delete-profile'])
      expect(local.retireForArchiveDeletion).toHaveBeenCalledWith([plan.id])
      expect(local.discardByPlanIds).not.toHaveBeenCalled()
      expect(local.getStoredDraft()).toBeUndefined()
      expect(confirmDelete).toHaveBeenCalledWith(status === 'revoked'
        ? expect.stringMatching(/删除档案.*计划.*历史记录/)
        : expect.stringMatching(/旧分享草稿.*遮罩图.*管理信息/))
      expect(confirmDelete.mock.calls.flat().join('')).not.toMatch(/投票/)
    },
  )

  test.each(['creating', 'active', 'revoking'] as const)(
    'preserves a complete %s PollDraft while allowing profile deletion without a retired UI link',
    async (status) => {
      const callOrder: string[] = []
      const original = draftFor(status)
      const local = repositoryFor(original, callOrder)
      const confirmDelete = vi.spyOn(window, 'confirm').mockReturnValue(true)
      const { deleteProfile } = await renderProfile(local.repository, callOrder)

      await fireEvent.click(screen.getByRole('button', { name: '删除档案及其内容' }))

      await waitFor(() => expect(deleteProfile).toHaveBeenCalledWith(profile.id))
      expect(callOrder).toEqual(['retire-poll-draft', 'delete-profile'])
      expect(local.retireForArchiveDeletion).toHaveBeenCalledWith([plan.id])
      expect(local.discardByPlanIds).not.toHaveBeenCalled()
      expect(confirmDelete).toHaveBeenCalledWith(expect.stringMatching(/删除档案.*计划.*历史记录/))
      expect(local.getStoredDraft()).toEqual(original)
      expect(screen.queryByRole('link', { name: /投票/ })).toBeNull()
    },
  )

  test('keeps the profile and shows an alert when PollDraft cleanup fails', async () => {
    const callOrder: string[] = []
    const local = repositoryFor(draftFor('uploading'), callOrder)
    local.retireForArchiveDeletion.mockRejectedValueOnce(new Error('IndexedDB unavailable'))
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { deleteProfile } = await renderProfile(local.repository, callOrder)

    await fireEvent.click(screen.getByRole('button', { name: '删除档案及其内容' }))

    expect((await screen.findByRole('alert')).textContent).toMatch(/旧分享草稿.*未删除/)
    expect(screen.getByRole('alert').textContent).not.toMatch(/投票/)
    expect(deleteProfile).not.toHaveBeenCalled()
  })

  test('discards only local-only drafts while preserving an active row and deleting the profile', async () => {
    const callOrder: string[] = []
    const localDraft = draftFor('draft')
    const activeDraft: PollDraft = {
      ...draftFor('active'),
      id: `poll-draft:${secondPlan.id}`,
      planId: secondPlan.id,
      title: '另一个计划的投票',
    }
    const storedDrafts = new Map([
      [plan.id, localDraft],
      [secondPlan.id, activeDraft],
    ])
    const getByPlanId = vi.fn(async (planId: string) => storedDrafts.get(planId))
    const discardByPlanIds = vi.fn(async () => { callOrder.push('discard-poll-drafts') })
    const retireForArchiveDeletion = vi.fn(async (planIds: readonly string[]) => {
      callOrder.push('retire-poll-drafts')
      planIds.forEach((planId) => {
        const draft = storedDrafts.get(planId)
        if (draft && ['draft', 'uploading', 'revoked'].includes(draft.status)) {
          storedDrafts.delete(planId)
        }
      })
    })
    const repository = {
      getByPlanId,
      discardByPlanIds,
      retireForArchiveDeletion,
    } as unknown as PollDraftRepositoryPort
    const confirmDelete = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { deleteProfile } = await renderProfile(
      repository,
      callOrder,
      true,
      [plan, secondPlan],
    )

    await fireEvent.click(screen.getByRole('button', { name: '删除档案及其内容' }))

    await waitFor(() => expect(deleteProfile).toHaveBeenCalledWith(profile.id))
    expect(getByPlanId).toHaveBeenCalledTimes(2)
    expect(retireForArchiveDeletion).toHaveBeenCalledWith([plan.id, secondPlan.id])
    expect(discardByPlanIds).not.toHaveBeenCalled()
    expect(callOrder).toEqual(['retire-poll-drafts', 'delete-profile'])
    expect(storedDrafts.has(plan.id)).toBe(false)
    expect(storedDrafts.get(secondPlan.id)).toEqual(activeDraft)
    expect(confirmDelete).toHaveBeenCalledOnce()
    expect(screen.queryByRole('link', { name: /投票/ })).toBeNull()
  })

  test('keeps the profile in place when archive deletion fails after confirmed PollDraft cleanup', async () => {
    const callOrder: string[] = []
    const local = repositoryFor(draftFor('uploading'), callOrder)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { deleteProfile, router } = await renderProfile(local.repository, callOrder, false)

    await fireEvent.click(screen.getByRole('button', { name: '删除档案及其内容' }))

    await waitFor(() => expect(deleteProfile).toHaveBeenCalledWith(profile.id))
    expect(callOrder).toEqual(['retire-poll-draft', 'delete-profile'])
    expect(local.getStoredDraft()).toBeUndefined()
    expect(router.currentRoute.value.path).toBe('/archive/profile')
    expect((await screen.findByRole('alert')).textContent).toMatch(/保存失败/)
  })

  test('refreshes stale plans and preserves a poll added in another tab without blocking deletion', async () => {
    const callOrder: string[] = []
    const activeDraft: PollDraft = {
      ...draftFor('active'),
      id: `poll-draft:${secondPlan.id}`,
      planId: secondPlan.id,
      title: '跨标签新增计划的投票',
    }
    const getByPlanId = vi.fn(async (planId: string) => (
      planId === secondPlan.id ? activeDraft : undefined
    ))
    const discardByPlanIds = vi.fn(async () => { callOrder.push('discard-poll-drafts') })
    const retireForArchiveDeletion = vi.fn(async () => { callOrder.push('retire-poll-drafts') })
    const repository = {
      getByPlanId,
      discardByPlanIds,
      retireForArchiveDeletion,
    } as unknown as PollDraftRepositoryPort
    const confirmDelete = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { deleteProfile, store } = await renderProfile(repository, callOrder)
    store.load = vi.fn(async () => {
      store.plans = [plan, secondPlan]
    })

    await fireEvent.click(screen.getByRole('button', { name: '删除档案及其内容' }))

    await waitFor(() => expect(deleteProfile).toHaveBeenCalledWith(profile.id))
    expect(store.load).toHaveBeenCalledOnce()
    expect(getByPlanId).toHaveBeenCalledWith(secondPlan.id)
    expect(retireForArchiveDeletion).toHaveBeenCalledWith([plan.id, secondPlan.id])
    expect(discardByPlanIds).not.toHaveBeenCalled()
    expect(confirmDelete).toHaveBeenCalledOnce()
    expect(callOrder).toEqual(['retire-poll-drafts', 'delete-profile'])
    expect(screen.queryByRole('link', { name: /投票/ })).toBeNull()
  })

  test('blocks profile deletion when the authoritative refresh fails and leaves stale state', async () => {
    const callOrder: string[] = []
    const getByPlanId = vi.fn(async () => undefined)
    const discardByPlanIds = vi.fn(async () => { callOrder.push('discard-poll-drafts') })
    const repository = { getByPlanId, discardByPlanIds } as unknown as PollDraftRepositoryPort
    const confirmDelete = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { deleteProfile, store } = await renderProfile(repository, callOrder)
    store.load = vi.fn(async () => {
      store.error = '档案暂时无法读取，请稍后重试。'
    })

    await fireEvent.click(screen.getByRole('button', { name: '删除档案及其内容' }))

    expect((await screen.findByRole('alert')).textContent).toMatch(/档案暂时无法读取/)
    expect(store.plans).toEqual([plan])
    expect(getByPlanId).not.toHaveBeenCalled()
    expect(discardByPlanIds).not.toHaveBeenCalled()
    expect(deleteProfile).not.toHaveBeenCalled()
    expect(confirmDelete).not.toHaveBeenCalled()
  })

  test('blocks profile deletion when refresh shows that the profile no longer exists', async () => {
    const callOrder: string[] = []
    const getByPlanId = vi.fn(async () => undefined)
    const discardByPlanIds = vi.fn(async () => { callOrder.push('discard-poll-drafts') })
    const repository = { getByPlanId, discardByPlanIds } as unknown as PollDraftRepositoryPort
    const confirmDelete = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { deleteProfile, store } = await renderProfile(repository, callOrder)
    store.load = vi.fn(async () => {
      store.profiles = []
      store.plans = []
    })

    await fireEvent.click(screen.getByRole('button', { name: '删除档案及其内容' }))

    expect((await screen.findByRole('alert')).textContent).toMatch(/刷新后没有找到.*档案未删除/)
    expect(getByPlanId).not.toHaveBeenCalled()
    expect(discardByPlanIds).not.toHaveBeenCalled()
    expect(deleteProfile).not.toHaveBeenCalled()
    expect(confirmDelete).not.toHaveBeenCalled()
  })

  test('blocks deletion when refresh promotes another primary profile with a different plan snapshot', async () => {
    const callOrder: string[] = []
    const getByPlanId = vi.fn(async () => undefined)
    const discardByPlanIds = vi.fn(async () => { callOrder.push('discard-poll-drafts') })
    const repository = { getByPlanId, discardByPlanIds } as unknown as PollDraftRepositoryPort
    const confirmDelete = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { deleteProfile, store } = await renderProfile(repository, callOrder)
    store.load = vi.fn(async () => {
      store.profiles = [newerProfile, profile]
      store.plans = [newerProfilePlan]
    })

    await fireEvent.click(screen.getByRole('button', { name: '删除档案及其内容' }))

    expect((await screen.findByRole('alert')).textContent).toMatch(/主要档案.*变化.*未删除/)
    expect(store.load).toHaveBeenCalledOnce()
    expect(getByPlanId).not.toHaveBeenCalled()
    expect(discardByPlanIds).not.toHaveBeenCalled()
    expect(deleteProfile).not.toHaveBeenCalledWith(profile.id)
    expect(deleteProfile).not.toHaveBeenCalledWith(newerProfile.id)
    expect(confirmDelete).not.toHaveBeenCalled()
  })
})
