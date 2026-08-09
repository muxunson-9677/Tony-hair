import { fireEvent, render, screen } from '@testing-library/vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import {
  POLL_DRAFT_REPOSITORY_KEY,
  POLL_SERVICE_KEY,
  type PollDraftRepositoryPort,
  type PollServicePort,
} from '../features/polls/pollRuntime'
import type { PollDraft } from '../features/polls/types'
import PollManageView from './PollManageView.vue'

const localDraft: PollDraft = {
  id: 'poll-draft:plan-1',
  planId: 'plan-1',
  title: '帮我选：下次短发计划',
  clientRequestId: 'client_request_1234567890',
  managementToken: 'management_token_that_stays_local_1234567890',
  status: 'active',
  pollId: 'public_poll_id_1234567890',
  expiresAt: '2026-08-17T04:00:00.000Z',
  options: [
    {
      candidateId: 'candidate-1',
      label: '轻盈短碎',
      disclosure: 'demo',
      uploadId: 'upload_1_1234567890',
      uploadStatus: 'uploaded',
      assetId: '123e4567-e89b-42d3-a456-426614174000',
      imageUrl: 'https://example.test/one.webp',
    },
    {
      candidateId: 'candidate-2',
      label: '自然侧分',
      disclosure: 'reference',
      uploadId: 'upload_2_1234567890',
      uploadStatus: 'uploaded',
      assetId: '223e4567-e89b-42d3-a456-426614174000',
      imageUrl: 'https://example.test/two.webp',
    },
  ],
  createdAt: '2026-08-10T04:00:00.000Z',
  updatedAt: '2026-08-10T04:00:00.000Z',
}

describe('PollManageView', () => {
  let repository: PollDraftRepositoryPort
  let service: PollServicePort

  beforeEach(() => {
    repository = {
      getByPlanId: vi.fn(),
      getByPollId: vi.fn(async () => localDraft),
      createDraft: vi.fn(),
      saveMaskedImage: vi.fn(),
      markOptionUploading: vi.fn(),
      markOptionFailed: vi.fn(),
      saveUploadedAsset: vi.fn(),
      markCreating: vi.fn(),
      markActive: vi.fn(),
      markRevoked: vi.fn(async () => ({ ...localDraft, status: 'revoked' as const })),
    }
    service = {
      verifyAccess: vi.fn(),
      uploadMasked: vi.fn(),
      createPoll: vi.fn(),
      getPoll: vi.fn(async () => ({
        pollId: localDraft.pollId ?? '',
        title: localDraft.title,
        expiresAt: localDraft.expiresAt ?? '',
        viewerHasVoted: false,
        options: [
          {
            id: '323e4567-e89b-42d3-a456-426614174000',
            label: '轻盈短碎',
            disclosure: 'demo' as const,
            imageUrl: 'https://example.test/one.webp',
          },
          {
            id: '423e4567-e89b-42d3-a456-426614174000',
            label: '自然侧分',
            disclosure: 'reference' as const,
            imageUrl: 'https://example.test/two.webp',
          },
        ],
      })),
      vote: vi.fn(),
      getResults: vi.fn(async () => ({
        total: 3,
        none: 1,
        options: [
          { optionId: '323e4567-e89b-42d3-a456-426614174000', votes: 2 },
          { optionId: '423e4567-e89b-42d3-a456-426614174000', votes: 0 },
        ],
        comments: [{ comment: '<b>第一张更清爽</b>', createdAt: '2026-08-10T05:00:00.000Z' }],
      })),
      revoke: vi.fn(async () => {}),
    }
  })

  const renderView = async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/polls/:id/manage', component: PollManageView }],
    })
    await router.push(`/polls/${localDraft.pollId}/manage`)
    await router.isReady()
    return render(PollManageView, {
      global: {
        plugins: [router],
        provide: {
          [POLL_DRAFT_REPOSITORY_KEY as symbol]: repository,
          [POLL_SERVICE_KEY as symbol]: service,
        },
      },
    })
  }

  test('loads results with the local token and renders comments as text', async () => {
    const { container } = await renderView()

    expect(await screen.findByText('3 票')).toBeTruthy()
    expect(screen.getByText('轻盈短碎')).toBeTruthy()
    expect(screen.getByText('2')).toBeTruthy()
    expect(screen.getByText('都不合适')).toBeTruthy()
    expect(screen.getByText('<b>第一张更清爽</b>')).toBeTruthy()
    expect(container.querySelector('b b')).toBeNull()
    expect(service.getResults).toHaveBeenCalledWith(localDraft.pollId, localDraft.managementToken)
  })

  test('does not request results when this device lacks the management token', async () => {
    vi.mocked(repository.getByPollId).mockResolvedValue({ ...localDraft, managementToken: undefined })

    await renderView()

    expect(await screen.findByText('只能在创建投票的这台设备管理')).toBeTruthy()
    expect(service.getResults).not.toHaveBeenCalled()
    expect(service.getPoll).not.toHaveBeenCalled()
  })

  test('revokes remotely before clearing local image blobs', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await renderView()
    await screen.findByText('3 票')
    await fireEvent.click(screen.getByRole('button', { name: '撤销并删除投票' }))

    expect(service.revoke).toHaveBeenCalledWith(localDraft.pollId, localDraft.managementToken)
    expect(repository.markRevoked).toHaveBeenCalledWith(localDraft.id)
    expect(await screen.findByText('投票已撤销，分享图正在删除')).toBeTruthy()
  })
})
