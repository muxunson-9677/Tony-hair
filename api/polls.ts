import { authenticateSession } from './_lib/access'
import { readRuntimeConfig } from './_lib/config'
import { NeonDatabase } from './_lib/database'
import {
  HttpError,
  isJsonObject,
  jsonResponse,
  readJsonBody,
  requireMethod,
  requireSameOrigin,
  toErrorResponse,
} from './_lib/http'
import { plainTextWithin, requireManagementToken } from './_lib/polls'
import { hashOpaqueToken, randomOpaqueToken, safeTokenEqual } from './_lib/security'

type PollCreateResult =
  | { outcome: 'created'; pollId: string; expiresAt: Date }
  | { outcome: 'idempotent_candidate'; pollId: string; expiresAt: Date; managementTokenHash: string }
  | { outcome: 'invalid_assets' }
  | { outcome: 'active_limit' }
  | { outcome: 'conflict' }

export interface PollCreateDatabase {
  createPoll(input: {
    pollId: string
    sessionHash: string
    clientRequestId: string
    title: string
    managementTokenHash: string
    assetIds: string[]
    labels: string[]
    disclosures: Array<'demo' | 'reference'>
    now: Date
  }): Promise<PollCreateResult>
}

interface PollDependencies {
  database: PollCreateDatabase
  cookieSecret: string
  managementTokenPepper: string
  now: () => number
  randomPollId: () => string
}

interface CreatePollBody {
  clientRequestId?: unknown
  title?: unknown
  options?: unknown
}

export function createPollHandler(dependencies: PollDependencies) {
  return async (request: Request): Promise<Response> => {
    try {
      requireMethod(request, 'POST')
      requireSameOrigin(request)
      const now = dependencies.now()
      const { sessionHash } = authenticateSession(request, dependencies.cookieSecret, now)
      const managementToken = requireManagementToken(request)
      const parsedBody = await readJsonBody<unknown>(request, 8_192)
      if (!isJsonObject(parsedBody)) {
        throw new HttpError(422, 'INVALID_POLL_BODY', '鎶曠エ璇锋眰鍐呭鏃犳晥')
      }
      const body = parsedBody as CreatePollBody
      if (!plainTextWithin(body.clientRequestId, 16, 128)) {
        throw new HttpError(422, 'INVALID_CLIENT_REQUEST_ID', '请求标识无效')
      }
      if (!plainTextWithin(body.title, 1, 60)) {
        throw new HttpError(422, 'INVALID_TITLE', '投票标题无效')
      }
      if (!Array.isArray(body.options) || body.options.length < 2 || body.options.length > 4) {
        throw new HttpError(422, 'INVALID_OPTIONS', '投票必须包含 2 到 4 个方案')
      }
      const options = body.options.map((item) => {
        if (!item || typeof item !== 'object') throw new HttpError(422, 'INVALID_OPTIONS', '投票方案无效')
        const candidate = item as { assetId?: unknown; label?: unknown; disclosure?: unknown }
        const disclosure = candidate.disclosure
        if (
          typeof candidate.assetId !== 'string' ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate.assetId) ||
          !plainTextWithin(candidate.label, 1, 40) ||
          (disclosure !== 'demo' && disclosure !== 'reference')
        ) {
          throw new HttpError(422, 'INVALID_OPTIONS', '投票方案无效')
        }
        return { assetId: candidate.assetId, label: candidate.label, disclosure } as {
          assetId: string
          label: string
          disclosure: 'demo' | 'reference'
        }
      })
      if (new Set(options.map((option) => option.assetId)).size !== options.length) {
        throw new HttpError(422, 'INVALID_OPTIONS', '投票图片不能重复')
      }

      const pollId = dependencies.randomPollId()
      if (!/^[A-Za-z0-9_-]{22,96}$/.test(pollId)) {
        throw new HttpError(500, 'RANDOMNESS_ERROR', '服务器随机标识生成失败')
      }
      const result = await dependencies.database.createPoll({
        pollId,
        sessionHash,
        clientRequestId: body.clientRequestId,
        title: body.title,
        managementTokenHash: hashOpaqueToken(
          `poll-management:${pollId}`,
          managementToken,
          dependencies.managementTokenPepper,
        ),
        assetIds: options.map((option) => option.assetId),
        labels: options.map((option) => option.label),
        disclosures: options.map((option) => option.disclosure),
        now: new Date(now),
      })
      if (result.outcome === 'invalid_assets') {
        throw new HttpError(422, 'INVALID_ASSETS', '图片不存在、尚未就绪或不属于当前会话')
      }
      if (result.outcome === 'active_limit') {
        throw new HttpError(409, 'ACTIVE_POLL_LIMIT', '当前会话活动投票已达上限')
      }
      if (result.outcome === 'conflict') {
        throw new HttpError(409, 'POLL_CONFLICT', '投票创建冲突，请重试')
      }
      if (result.outcome === 'idempotent_candidate') {
        const expected = hashOpaqueToken(
          `poll-management:${result.pollId}`,
          managementToken,
          dependencies.managementTokenPepper,
        )
        if (!safeTokenEqual(expected, result.managementTokenHash)) {
          throw new HttpError(409, 'IDEMPOTENCY_CONFLICT', '请求标识已被使用')
        }
        return jsonResponse(
          { pollId: result.pollId, expiresAt: result.expiresAt.toISOString(), idempotent: true },
          { status: 200 },
        )
      }
      return jsonResponse(
        { pollId: result.pollId, expiresAt: result.expiresAt.toISOString(), idempotent: false },
        { status: 201 },
      )
    } catch (error) {
      return toErrorResponse(error)
    }
  }
}

export default async function handler(request: Request): Promise<Response> {
  try {
    const config = readRuntimeConfig(process.env)
    return createPollHandler({
      database: new NeonDatabase(config.databaseUrl),
      cookieSecret: config.cookieSigningSecret,
      managementTokenPepper: config.managementTokenPepper,
      now: Date.now,
      randomPollId: () => randomOpaqueToken(16),
    })(request)
  } catch (error) {
    return toErrorResponse(error)
  }
}
