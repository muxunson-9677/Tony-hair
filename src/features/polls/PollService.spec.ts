import { beforeEach, describe, expect, test, vi } from 'vitest'

import { PollService, PollServiceError } from './PollService'
import type { PollDraft } from './types'

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json' },
})

const errorResponse = (status: number, code: string, message = code) => (
  jsonResponse({ error: { code, message } }, status)
)

const publicPoll = {
  pollId: 'public_poll_id_1234567890',
  title: '帮我选一个',
  expiresAt: '2026-08-17T04:00:00.000Z',
  viewerHasVoted: false,
  options: [
    {
      id: '123e4567-e89b-42d3-a456-426614174000',
      label: '轻盈短碎',
      disclosure: 'demo',
      imageUrl: 'https://example.test/one.webp',
    },
    {
      id: '223e4567-e89b-42d3-a456-426614174000',
      label: '自然侧分',
      disclosure: 'reference',
      imageUrl: 'https://example.test/two.webp',
    },
  ],
} as const

const draft: PollDraft = {
  id: 'poll-draft:plan-1',
  planId: 'plan-1',
  title: '帮我选一个',
  clientRequestId: 'client_request_1234567890',
  managementToken: 'management_token_that_stays_local_1234567890',
  status: 'creating',
  options: [
    {
      candidateId: 'candidate-1',
      label: '轻盈短碎',
      disclosure: 'demo',
      uploadId: 'upload_1234567890',
      uploadStatus: 'uploaded',
      assetId: '123e4567-e89b-42d3-a456-426614174000',
      imageUrl: 'https://example.test/one.webp',
    },
    {
      candidateId: 'candidate-2',
      label: '自然侧分',
      disclosure: 'reference',
      uploadId: 'upload_2234567890',
      uploadStatus: 'uploaded',
      assetId: '223e4567-e89b-42d3-a456-426614174000',
      imageUrl: 'https://example.test/two.webp',
    },
  ],
  createdAt: '2026-08-10T04:00:00.000Z',
  updatedAt: '2026-08-10T04:00:00.000Z',
}

describe('PollService', () => {
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>
  let service: PollService

  beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>()
    service = new PollService(fetchMock)
  })

  test('verifies the access code with same-origin credentials', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ expiresAt: '2026-08-10T06:00:00.000Z' }))

    await service.verifyAccess('demo-code')

    expect(fetchMock).toHaveBeenCalledWith('/api/access/verify', expect.objectContaining({
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: 'demo-code' }),
    }))
  })

  test('uploads only the flattened Blob with a stable x-upload-id', async () => {
    const image = new Blob(['masked'], { type: 'image/webp' })
    fetchMock.mockResolvedValueOnce(jsonResponse({
      uploadId: 'upload_1234567890',
      assetId: '123e4567-e89b-42d3-a456-426614174000',
      url: 'https://example.test/one.webp',
      bytes: image.size,
      contentType: 'image/webp',
      idempotent: false,
    }, 201))

    await service.uploadMasked({ uploadId: 'upload_1234567890', image })

    expect(fetchMock).toHaveBeenCalledWith('/api/uploads/masked', expect.objectContaining({
      method: 'POST',
      credentials: 'same-origin',
      body: image,
      headers: {
        'content-type': 'image/webp',
        'x-upload-id': 'upload_1234567890',
      },
    }))
  })

  test('sends the management token only in the create header', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      pollId: 'public_poll_id_1234567890',
      expiresAt: '2026-08-17T04:00:00.000Z',
      idempotent: false,
    }, 201))

    await service.createPoll(draft)

    const [, request] = fetchMock.mock.calls[0] ?? []
    const body = String(request?.body)
    expect(request?.headers).toEqual({
      'content-type': 'application/json',
      'x-poll-management-token': draft.managementToken,
    })
    expect(JSON.parse(body)).toEqual({
      clientRequestId: draft.clientRequestId,
      title: draft.title,
      options: draft.options.map(({ assetId, label, disclosure }) => ({ assetId, label, disclosure })),
    })
    expect(body).not.toContain(draft.managementToken)
  })

  test('GETs to establish the voter session before posting a vote', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(publicPoll))
      .mockResolvedValueOnce(jsonResponse({ voted: true }, 201))

    await service.vote(publicPoll.pollId, { optionId: null, comment: '' })

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      `/api/polls/${publicPoll.pollId}`,
      `/api/polls/${publicPoll.pollId}/votes`,
    ])
    expect(fetchMock.mock.calls[1]?.[1]).toEqual(expect.objectContaining({
      method: 'POST',
      credentials: 'same-origin',
      body: JSON.stringify({ optionId: null, comment: '' }),
    }))
  })

  test('rebuilds the voter session and retries one time when requested by the server', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(publicPoll))
      .mockResolvedValueOnce(errorResponse(409, 'VOTER_SESSION_REQUIRED'))
      .mockResolvedValueOnce(jsonResponse(publicPoll))
      .mockResolvedValueOnce(jsonResponse({ voted: true }, 201))

    await service.vote(publicPoll.pollId, { optionId: publicPoll.options[0].id, comment: '更适合你' })

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      `/api/polls/${publicPoll.pollId}`,
      `/api/polls/${publicPoll.pollId}/votes`,
      `/api/polls/${publicPoll.pollId}`,
      `/api/polls/${publicPoll.pollId}/votes`,
    ])
  })

  test('does not post when the bootstrap GET says this browser already voted', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ...publicPoll, viewerHasVoted: true }))

    await expect(service.vote(publicPoll.pollId, { optionId: null, comment: '' }))
      .rejects.toMatchObject({ code: 'ALREADY_VOTED', status: 409 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test('uses the local management token for results and revocation', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ total: 2, none: 1, options: [], comments: [] }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))

    await service.getResults(publicPoll.pollId, draft.managementToken)
    await service.revoke(publicPoll.pollId, draft.managementToken)

    expect(fetchMock.mock.calls[0]?.[1]?.headers).toEqual({
      'x-poll-management-token': draft.managementToken,
    })
    expect(fetchMock.mock.calls[1]?.[1]).toEqual(expect.objectContaining({
      method: 'DELETE',
      headers: { 'x-poll-management-token': draft.managementToken },
    }))
  })

  test('maps network failure without pretending that a vote was counted', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))

    await expect(service.getPoll(publicPoll.pollId)).rejects.toEqual(expect.objectContaining({
      name: 'PollServiceError',
      kind: 'offline',
      code: 'NETWORK_UNAVAILABLE',
    }))
  })

  test('preserves stable API error codes for duplicate and gone states', async () => {
    fetchMock.mockResolvedValueOnce(errorResponse(410, 'POLL_GONE', '投票已结束'))

    await expect(service.getPoll(publicPoll.pollId)).rejects.toEqual(expect.objectContaining({
      name: 'PollServiceError',
      kind: 'http',
      code: 'POLL_GONE',
      status: 410,
    } satisfies Partial<PollServiceError>))
  })
})
