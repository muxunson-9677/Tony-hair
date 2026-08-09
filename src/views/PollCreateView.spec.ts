import { fireEvent, render, screen, waitFor } from '@testing-library/vue'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h, onMounted, onUnmounted } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import { useArchiveStore } from '../features/archive/archiveStore'
import type { Candidate, HaircutPlan } from '../features/archive/types'
import { PollDraftCandidatesChangedError } from '../features/polls/PollDraftRepository'
import {
  POLL_DRAFT_REPOSITORY_KEY,
  POLL_SERVICE_KEY,
  type PollDraftRepositoryPort,
  type PollServicePort,
} from '../features/polls/pollRuntime'
import type { PollDraft } from '../features/polls/types'
import PollCreateView from './PollCreateView.vue'

const plan: HaircutPlan = {
  id: 'plan-1',
  profileId: 'profile-1',
  title: '下次短发计划',
  date: '2026-08-10T02:00:00.000Z',
  status: 'ready',
  createdAt: '2026-08-10T02:00:00.000Z',
  updatedAt: '2026-08-10T02:00:00.000Z',
}

const imageOne = new Blob(['one'], { type: 'image/webp' })
const imageTwo = new Blob(['two'], { type: 'image/webp' })
const candidates: Candidate[] = [
  {
    id: 'candidate-1',
    planId: 'plan-1',
    order: 1,
    name: '轻盈短碎',
    notes: '',
    source: 'user_reference',
    referenceId: 'ref-1',
    referenceImage: imageOne,
    referenceImageWidth: 800,
    referenceImageHeight: 1000,
    referenceImageBytes: imageOne.size,
    referenceImageProcessedAt: '2026-08-10T01:00:00.000Z',
  },
  {
    id: 'candidate-2',
    planId: 'plan-1',
    order: 2,
    name: '自然侧分',
    notes: '',
    source: 'user_reference',
    referenceId: 'ref-2',
    referenceImage: imageTwo,
    referenceImageWidth: 800,
    referenceImageHeight: 1000,
    referenceImageBytes: imageTwo.size,
    referenceImageProcessedAt: '2026-08-10T01:00:00.000Z',
  },
]

const draft = (): PollDraft => ({
  id: 'poll-draft:plan-1',
  planId: 'plan-1',
  title: '帮我选下次发型',
  clientRequestId: 'client_request_1234567890',
  managementToken: 'management_token_that_stays_local_1234567890',
  status: 'draft',
  options: candidates.map((candidate, index) => ({
    candidateId: candidate.id,
    label: candidate.name,
    disclosure: 'reference',
    uploadId: `upload_${index + 1}_1234567890`,
    uploadStatus: 'pending',
  })),
  createdAt: '2026-08-10T04:00:00.000Z',
  updatedAt: '2026-08-10T04:00:00.000Z',
})

const exportResult = {
  blob: new Blob(['masked'], { type: 'image/webp' }),
  mimeType: 'image/webp' as const,
  width: 800,
  height: 1000,
  bytes: 6,
  processedAt: '2026-08-10T04:01:00.000Z',
}

let emitExportTwice = false
let editorMounts = 0
let editorUnmounts = 0

const MaskEditorStub = defineComponent({
  name: 'MaskEditor',
  props: { initialBlob: Blob },
  emits: ['exported'],
  setup(_, { emit }) {
    onMounted(() => { editorMounts += 1 })
    onUnmounted(() => { editorUnmounts += 1 })
    return () => h('div', { 'data-testid': 'mask-editor' }, [
      h('button', { onClick: () => {
        emit('exported', exportResult)
        if (emitExportTwice) emit('exported', exportResult)
      } }, '确认这张遮罩图'),
    ])
  },
})

describe('PollCreateView', () => {
  let currentDraft: PollDraft
  let repository: PollDraftRepositoryPort
  let service: PollServicePort
  let callOrder: string[]

  beforeEach(() => {
    emitExportTwice = false
    editorMounts = 0
    editorUnmounts = 0
    currentDraft = draft()
    callOrder = []
    repository = {
      getByPlanId: vi.fn(async () => undefined),
      createDraft: vi.fn(async () => {
        callOrder.push('persist-draft')
        return currentDraft
      }),
      restartDraft: vi.fn(async () => currentDraft),
      saveMaskedImage: vi.fn(async (_draftId, candidateId, result) => {
        currentDraft = {
          ...currentDraft,
          options: currentDraft.options.map((option) => option.candidateId === candidateId ? {
            ...option,
            uploadStatus: 'masked',
            maskedImage: result.blob,
            maskedMimeType: result.mimeType,
            maskedWidth: result.width,
            maskedHeight: result.height,
            maskedBytes: result.bytes,
            maskedAt: result.processedAt,
          } : option),
        }
        return currentDraft
      }),
      markOptionUploading: vi.fn(async () => currentDraft),
      markOptionFailed: vi.fn(async (_draftId, candidateId, errorCode) => {
        currentDraft = {
          ...currentDraft,
          options: currentDraft.options.map((option) => option.candidateId === candidateId ? {
            ...option,
            uploadStatus: 'failed',
            uploadErrorCode: errorCode,
          } : option),
        }
        return currentDraft
      }),
      saveUploadedAsset: vi.fn(async (_draftId, candidateId, asset) => {
        currentDraft = {
          ...currentDraft,
          options: currentDraft.options.map((option) => option.candidateId === candidateId ? {
            ...option,
            uploadStatus: 'uploaded',
            assetId: asset.assetId,
            imageUrl: asset.imageUrl,
          } : option),
        }
        return currentDraft
      }),
      markCreating: vi.fn(async () => ({ ...currentDraft, status: 'creating' as const })),
      markActive: vi.fn(async (_draftId, pollId, expiresAt) => {
        currentDraft = { ...currentDraft, status: 'active', pollId, expiresAt }
        return currentDraft
      }),
      getByPollId: vi.fn(),
      markRevoked: vi.fn(),
    }
    service = {
      verifyAccess: vi.fn(async () => ({ expiresAt: '2026-08-10T06:00:00.000Z' })),
      uploadMasked: vi.fn(async ({ uploadId }) => {
        callOrder.push(`upload:${uploadId}`)
        return {
          uploadId,
          assetId: uploadId.includes('_1_')
            ? '123e4567-e89b-42d3-a456-426614174000'
            : '223e4567-e89b-42d3-a456-426614174000',
          url: `https://example.test/${uploadId}.webp`,
          bytes: 6,
          contentType: 'image/webp' as const,
          idempotent: false,
        }
      }),
      createPoll: vi.fn(async (savedDraft) => {
        callOrder.push(`create:${savedDraft.clientRequestId}:${savedDraft.managementToken}`)
        return {
          pollId: 'public_poll_id_1234567890',
          expiresAt: '2026-08-17T04:00:00.000Z',
          idempotent: false,
        }
      }),
      getPoll: vi.fn(),
      vote: vi.fn(),
      getResults: vi.fn(),
      revoke: vi.fn(),
    }
  })

  const renderView = async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useArchiveStore(pinia)
    store.$patch({
      loading: false,
      error: null,
      plans: [plan],
      candidatesByPlanId: { 'plan-1': candidates },
      photosByRecordId: {},
    })
    store.load = vi.fn(async () => {})

    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/archive/plans/:id/poll/new', component: PollCreateView },
        { path: '/archive/plans/:id', component: { template: '<div />' } },
        { path: '/polls/:id/manage', component: { template: '<div />' } },
      ],
    })
    await router.push('/archive/plans/plan-1/poll/new')
    await router.isReady()

    return render(PollCreateView, {
      global: {
        plugins: [pinia, router],
        provide: {
          [POLL_DRAFT_REPOSITORY_KEY as symbol]: repository,
          [POLL_SERVICE_KEY as symbol]: service,
        },
        stubs: { MaskEditor: MaskEditorStub },
      },
    })
  }

  const reachMaskQueue = async () => {
    await renderView()
    await fireEvent.update(screen.getByLabelText('体验码'), 'demo-code')
    await fireEvent.click(screen.getByRole('button', { name: '验证体验码' }))
    await fireEvent.click(await screen.findByRole('checkbox', { name: /已满 18 岁/ }))
    await fireEvent.click(screen.getByRole('button', { name: '开始逐张遮罩' }))
  }

  test('reuses one MaskEditor while advancing through every candidate', async () => {
    await reachMaskQueue()

    expect(await screen.findByText('01 / 02')).toBeTruthy()
    expect(screen.getAllByTestId('mask-editor')).toHaveLength(1)
    expect(editorMounts).toBe(1)
    await fireEvent.click(screen.getByRole('button', { name: '确认这张遮罩图' }))

    expect(await screen.findByText('02 / 02')).toBeTruthy()
    expect(screen.getAllByTestId('mask-editor')).toHaveLength(1)
    expect(editorMounts).toBe(1)
    expect(editorUnmounts).toBe(0)
    await fireEvent.click(screen.getByRole('button', { name: '确认这张遮罩图' }))
    expect(await screen.findByRole('button', { name: '上传并创建投票' })).toBeTruthy()
  })

  test('ignores a stale duplicate export from the candidate that just advanced', async () => {
    emitExportTwice = true
    await reachMaskQueue()

    await fireEvent.click(await screen.findByRole('button', { name: '确认这张遮罩图' }))

    await waitFor(() => expect(repository.saveMaskedImage).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('02 / 02')).toBeTruthy()
  })

  test('persists identifiers before uploading and can finish at the management link', async () => {
    await reachMaskQueue()
    await fireEvent.click(await screen.findByRole('button', { name: '确认这张遮罩图' }))
    await fireEvent.click(await screen.findByRole('button', { name: '确认这张遮罩图' }))
    await fireEvent.click(await screen.findByRole('button', { name: '上传并创建投票' }))

    expect((await screen.findByRole('link', { name: '查看结果并管理' })).getAttribute('href'))
      .toBe('/polls/public_poll_id_1234567890/manage')
    expect(callOrder).toEqual([
      'persist-draft',
      'upload:upload_1_1234567890',
      'upload:upload_2_1234567890',
      'create:client_request_1234567890:management_token_that_stays_local_1234567890',
    ])
    expect(service.uploadMasked).toHaveBeenCalledWith(expect.objectContaining({ image: exportResult.blob }))
  })

  test('shows the failed local image as retryable without replacing its upload id', async () => {
    vi.mocked(service.uploadMasked).mockRejectedValueOnce(new Error('offline'))
    await reachMaskQueue()
    await fireEvent.click(await screen.findByRole('button', { name: '确认这张遮罩图' }))
    await fireEvent.click(await screen.findByRole('button', { name: '确认这张遮罩图' }))
    await fireEvent.click(await screen.findByRole('button', { name: '上传并创建投票' }))

    expect(await screen.findByText('投票没有创建完成，本地草稿已保留，可以重试。')).toBeTruthy()
    expect(screen.getByText('可重试')).toBeTruthy()
    expect(currentDraft.options[0]?.uploadId).toBe('upload_1_1234567890')
  })

  test('resumes at the first unfinished candidate without replacing local ids', async () => {
    currentDraft = {
      ...currentDraft,
      options: currentDraft.options.map((option, index) => index === 0 ? {
        ...option,
        uploadStatus: 'masked',
        maskedImage: exportResult.blob,
        maskedMimeType: exportResult.mimeType,
      } : option),
    }
    vi.mocked(repository.getByPlanId).mockResolvedValue(currentDraft)
    vi.mocked(repository.createDraft).mockResolvedValue(currentDraft)

    await reachMaskQueue()

    expect(await screen.findByText('02 / 02')).toBeTruthy()
    expect(currentDraft.managementToken).toBe('management_token_that_stays_local_1234567890')
    expect(currentDraft.options.map(({ uploadId }) => uploadId)).toEqual([
      'upload_1_1234567890',
      'upload_2_1234567890',
    ])
    await waitFor(() => expect(repository.createDraft).toHaveBeenCalledOnce())
  })

  test('requires explicit confirmation before replacing a draft whose plan candidates changed', async () => {
    vi.mocked(repository.createDraft).mockRejectedValue(new PollDraftCandidatesChangedError('draft'))
    await renderView()
    await fireEvent.update(screen.getByLabelText('体验码'), 'demo-code')
    await fireEvent.click(screen.getByRole('button', { name: '验证体验码' }))
    await fireEvent.click(await screen.findByRole('checkbox', { name: /已满 18 岁/ }))
    await fireEvent.click(screen.getByRole('button', { name: '开始逐张遮罩' }))

    expect(await screen.findByText('计划候选已经变化，请确认是否放弃旧草稿并按当前候选重新开始。')).toBeTruthy()
    await fireEvent.click(screen.getByRole('button', { name: '按当前候选重新开始' }))

    expect(repository.restartDraft).toHaveBeenCalledOnce()
    expect(await screen.findByText('01 / 02')).toBeTruthy()
  })

  test('reconciles a creating draft with its original idempotency identity before considering changed candidates', async () => {
    currentDraft = {
      ...currentDraft,
      status: 'creating',
      options: currentDraft.options.map((option, index) => ({
        ...option,
        uploadStatus: 'uploaded',
        maskedImage: exportResult.blob,
        maskedMimeType: exportResult.mimeType,
        assetId: index === 0
          ? '123e4567-e89b-42d3-a456-426614174000'
          : '223e4567-e89b-42d3-a456-426614174000',
      })),
    }
    vi.mocked(repository.createDraft).mockRejectedValue(new PollDraftCandidatesChangedError('creating'))
    vi.mocked(repository.getByPlanId).mockResolvedValue(currentDraft)
    await renderView()
    await fireEvent.update(screen.getByLabelText('体验码'), 'demo-code')
    await fireEvent.click(screen.getByRole('button', { name: '验证体验码' }))
    await fireEvent.click(await screen.findByRole('checkbox', { name: /已满 18 岁/ }))
    await fireEvent.click(screen.getByRole('button', { name: '开始逐张遮罩' }))

    expect(await screen.findByText('上次创建请求的响应可能丢失。请先用原管理密钥和 clientRequestId 重试确认结果。')).toBeTruthy()
    expect(screen.getByRole('button', { name: '上传并创建投票' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '按当前候选重新开始' })).toBeNull()
    expect(currentDraft.managementToken).toBe('management_token_that_stays_local_1234567890')
    expect(currentDraft.clientRequestId).toBe('client_request_1234567890')
  })
})
