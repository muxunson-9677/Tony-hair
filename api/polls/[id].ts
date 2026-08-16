import { createBlobStore } from '../_lib/blob'
import { readRuntimeConfig } from '../_lib/config'
import { NeonDatabase } from '../_lib/database'
import {
  HttpError,
  jsonResponse,
  readCookie,
  requireSameOrigin,
  serializeHttpOnlyCookie,
  toErrorResponse,
} from '../_lib/http'
import { pollIdFromRequest, requireManagementToken, VOTER_COOKIE } from '../_lib/polls'
import {
  createSignedCookie,
  hashOpaqueToken,
  parseSignedCookie,
  randomOpaqueToken,
} from '../_lib/security'

interface PublicPoll {
  pollId: string
  title: string
  expiresAt: Date
  viewerHasVoted: boolean
  options: Array<{
    id: string
    label: string
    disclosure: 'demo' | 'reference'
    imageUrl: string
  }>
}

type PollLookup =
  | { outcome: 'active'; poll: PublicPoll }
  | { outcome: 'not_found' }
  | { outcome: 'gone' }
type BeginDelete =
  | { outcome: 'delete_pending'; pathnames: string[] }
  | { outcome: 'not_found' }
  | { outcome: 'gone' }
  | { outcome: 'forbidden' }

export interface PollResourceDatabase {
  getPoll(input: { pollId: string; voterCookieHash: string | null; now: Date }): Promise<PollLookup>
  beginDelete(input: {
    pollId: string
    managementTokenHash: string
    now: Date
  }): Promise<BeginDelete>
  finalizeDelete(pathnames: string[]): Promise<void>
}

interface ResourceDependencies {
  database: PollResourceDatabase
  deleteBlobs: (pathnames: string[]) => Promise<void>
  managementTokenPepper: string
  cookieSecret: string
  now: () => number
  randomToken?: () => string
  secure?: boolean
}

export function createPollResourceHandler(dependencies: ResourceDependencies) {
  return async (request: Request): Promise<Response> => {
    try {
      const pollId = pollIdFromRequest(request)
      const nowValue = dependencies.now()
      const now = new Date(nowValue)
      if (request.method === 'GET') {
        const encodedVoter = readCookie(request, VOTER_COOKIE)
        const parsedVoter = encodedVoter
          ? parseSignedCookie(encodedVoter, dependencies.cookieSecret, nowValue)
          : null
        const voterToken = parsedVoter?.value ?? (dependencies.randomToken ?? randomOpaqueToken)()
        const result = await dependencies.database.getPoll({
          pollId,
          voterCookieHash: hashOpaqueToken(
            `poll-voter:${pollId}`,
            voterToken,
            dependencies.cookieSecret,
          ),
          now,
        })
        if (result.outcome === 'not_found') throw new HttpError(404, 'POLL_NOT_FOUND', '投票不存在')
        if (result.outcome === 'gone') throw new HttpError(410, 'POLL_GONE', '投票已过期或撤销')
        const response = jsonResponse({
          pollId: result.poll.pollId,
          title: result.poll.title,
          expiresAt: result.poll.expiresAt.toISOString(),
          viewerHasVoted: result.poll.viewerHasVoted,
          options: result.poll.options,
        })
        if (!parsedVoter) {
          const expiresAt = nowValue + 365 * 24 * 60 * 60 * 1000
          response.headers.set(
            'set-cookie',
            serializeHttpOnlyCookie(
              VOTER_COOKIE,
              createSignedCookie(voterToken, expiresAt, dependencies.cookieSecret),
              365 * 24 * 60 * 60,
              dependencies.secure ?? false,
            ),
          )
        }
        return response
      }
      if (request.method !== 'DELETE') throw new HttpError(400, 'METHOD_NOT_ALLOWED', '请求方法不支持')
      requireSameOrigin(request)
      const token = requireManagementToken(request)
      const result = await dependencies.database.beginDelete({
        pollId,
        managementTokenHash: hashOpaqueToken(
          `poll-management:${pollId}`,
          token,
          dependencies.managementTokenPepper,
        ),
        now,
      })
      if (result.outcome === 'not_found') throw new HttpError(404, 'POLL_NOT_FOUND', '投票不存在')
      if (result.outcome === 'gone') throw new HttpError(410, 'POLL_GONE', '投票已过期或撤销')
      if (result.outcome === 'forbidden') throw new HttpError(403, 'MANAGEMENT_DENIED', '管理令牌不匹配')
      try {
        await dependencies.deleteBlobs(result.pathnames)
      } catch {
        throw new HttpError(503, 'BLOB_DELETE_PENDING', '投票已撤销，图片将在稍后继续清理')
      }
      await dependencies.database.finalizeDelete(result.pathnames)
      return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } })
    } catch (error) {
      return toErrorResponse(error)
    }
  }
}

export default async function handler(request: Request): Promise<Response> {
  try {
    const config = readRuntimeConfig(process.env)
    const blob = createBlobStore(config.blobToken)
    return createPollResourceHandler({
      database: new NeonDatabase(config.databaseUrl),
      deleteBlobs: blob.delete,
      managementTokenPepper: config.managementTokenPepper,
      cookieSecret: config.cookieSigningSecret,
      now: Date.now,
      randomToken: randomOpaqueToken,
      secure: process.env.VERCEL_ENV === 'production',
    })(request)
  } catch (error) {
    return toErrorResponse(error)
  }
}
