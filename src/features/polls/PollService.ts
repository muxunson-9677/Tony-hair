import type { PollDisclosure, PollDraft } from './types'

export interface PublicPollOption {
  readonly id: string
  readonly label: string
  readonly disclosure: PollDisclosure
  readonly imageUrl: string
}

export interface PublicPoll {
  readonly pollId: string
  readonly title: string
  readonly expiresAt: string
  readonly viewerHasVoted: boolean
  readonly options: readonly PublicPollOption[]
}

export interface PollResults {
  readonly total: number
  readonly none: number
  readonly options: readonly { optionId: string; votes: number }[]
  readonly comments: readonly { comment: string; createdAt: string }[]
}

export interface UploadedMaskedResponse {
  readonly uploadId: string
  readonly assetId: string
  readonly url: string
  readonly bytes: number
  readonly contentType: 'image/webp' | 'image/jpeg'
  readonly idempotent: boolean
}

export interface CreatedPollResponse {
  readonly pollId: string
  readonly expiresAt: string
  readonly idempotent: boolean
}

interface ApiErrorBody {
  readonly error?: {
    readonly code?: unknown
    readonly message?: unknown
  }
}

export class PollServiceError extends Error {
  readonly name = 'PollServiceError'

  constructor(
    readonly kind: 'offline' | 'http',
    readonly code: string,
    message: string,
    readonly status?: number,
  ) {
    super(message)
  }
}

const jsonHeaders = { 'content-type': 'application/json' } as const

export class PollService {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async verifyAccess(code: string): Promise<{ expiresAt: string }> {
    return this.requestJson('/api/access/verify', {
      method: 'POST',
      credentials: 'same-origin',
      headers: jsonHeaders,
      body: JSON.stringify({ code }),
    })
  }

  async uploadMasked(input: { uploadId: string; image: Blob }): Promise<UploadedMaskedResponse> {
    if (input.image.type !== 'image/webp' && input.image.type !== 'image/jpeg') {
      throw new PollServiceError('http', 'UNSUPPORTED_IMAGE', '只能上传扁平化后的 WebP 或 JPEG', 415)
    }
    return this.requestJson('/api/uploads/masked', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'content-type': input.image.type,
        'x-upload-id': input.uploadId,
      },
      body: input.image,
    })
  }

  async createPoll(draft: PollDraft): Promise<CreatedPollResponse> {
    if (draft.options.some(({ assetId }) => !assetId)) {
      throw new PollServiceError('http', 'LOCAL_DRAFT_INCOMPLETE', '还有图片没有上传完成')
    }
    return this.requestJson('/api/polls', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        ...jsonHeaders,
        'x-poll-management-token': draft.managementToken,
      },
      body: JSON.stringify({
        clientRequestId: draft.clientRequestId,
        title: draft.title,
        options: draft.options.map(({ assetId, label, disclosure }) => ({ assetId, label, disclosure })),
      }),
    })
  }

  async getPoll(pollId: string): Promise<PublicPoll> {
    return this.requestJson(`/api/polls/${encodeURIComponent(pollId)}`, {
      method: 'GET',
      credentials: 'same-origin',
    })
  }

  async vote(pollId: string, input: { optionId: string | null; comment: string }): Promise<void> {
    const bootstrap = await this.getPoll(pollId)
    if (bootstrap.viewerHasVoted) {
      throw new PollServiceError('http', 'ALREADY_VOTED', '这个浏览器已经投过票', 409)
    }

    try {
      await this.postVote(pollId, input)
    } catch (error) {
      if (!(error instanceof PollServiceError) || error.code !== 'VOTER_SESSION_REQUIRED') throw error
      await this.getPoll(pollId)
      await this.postVote(pollId, input)
    }
  }

  async getResults(pollId: string, managementToken: string): Promise<PollResults> {
    return this.requestJson(`/api/polls/${encodeURIComponent(pollId)}/results`, {
      method: 'GET',
      credentials: 'same-origin',
      headers: { 'x-poll-management-token': managementToken },
    })
  }

  async revoke(pollId: string, managementToken: string): Promise<void> {
    await this.request(`/api/polls/${encodeURIComponent(pollId)}`, {
      method: 'DELETE',
      credentials: 'same-origin',
      headers: { 'x-poll-management-token': managementToken },
    })
  }

  private async postVote(
    pollId: string,
    input: { optionId: string | null; comment: string },
  ): Promise<void> {
    await this.request(`/api/polls/${encodeURIComponent(pollId)}/votes`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: jsonHeaders,
      body: JSON.stringify(input),
    })
  }

  private async requestJson<T>(url: string, init: RequestInit): Promise<T> {
    const response = await this.request(url, init)
    try {
      return await response.json() as T
    } catch {
      throw new PollServiceError('http', 'MALFORMED_RESPONSE', '服务返回了无法读取的数据', response.status)
    }
  }

  private async request(url: string, init: RequestInit): Promise<Response> {
    let response: Response
    try {
      response = await this.fetchImpl(url, init)
    } catch {
      throw new PollServiceError('offline', 'NETWORK_UNAVAILABLE', '网络不可用，请检查连接后重试')
    }

    if (response.ok) return response

    let body: ApiErrorBody = {}
    try {
      body = await response.json() as ApiErrorBody
    } catch {
      // Stable fallback below keeps malformed server responses user-recoverable.
    }
    const code = typeof body.error?.code === 'string' ? body.error.code : 'REQUEST_FAILED'
    const message = typeof body.error?.message === 'string' ? body.error.message : '请求没有完成，请稍后重试'
    throw new PollServiceError('http', code, message, response.status)
  }
}
