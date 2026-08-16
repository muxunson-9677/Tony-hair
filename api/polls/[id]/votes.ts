import { readRuntimeConfig } from '../../_lib/config'
import { NeonDatabase } from '../../_lib/database'
import {
  HttpError,
  isJsonObject,
  jsonResponse,
  readCookie,
  readJsonBody,
  requireMethod,
  requireSameOrigin,
  serializeHttpOnlyCookie,
  toErrorResponse,
} from '../../_lib/http'
import { pollIdFromRequest, VOTER_COOKIE } from '../../_lib/polls'
import {
  createSignedCookie,
  hashOpaqueToken,
  parseSignedCookie,
  randomOpaqueToken,
} from '../../_lib/security'

export interface VoteDatabase {
  castVote(input: {
    pollId: string
    optionId: string | null
    voterCookieHash: string
    comment: string
    now: Date
  }): Promise<'created' | 'duplicate' | 'invalid_option' | 'not_found' | 'gone'>
}

export function createPollVoteHandler(dependencies: {
  database: VoteDatabase
  cookieSecret: string
  now: () => number
  randomToken: () => string
  secure?: boolean
}) {
  return async (request: Request): Promise<Response> => {
    try {
      requireMethod(request, 'POST')
      requireSameOrigin(request)
      const pollId = pollIdFromRequest(request)
      const parsedBody = await readJsonBody<unknown>(request, 1_024)
      if (!isJsonObject(parsedBody)) {
        throw new HttpError(422, 'INVALID_VOTE_BODY', '鎶曠エ璇锋眰鍐呭鏃犳晥')
      }
      const body = parsedBody as { optionId?: unknown; comment?: unknown }
      const optionId = body.optionId
      if (
        optionId !== null &&
        (typeof optionId !== 'string' ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(optionId))
      ) {
        throw new HttpError(422, 'INVALID_OPTION', '投票选项无效')
      }
      if (typeof body.comment !== 'string') throw new HttpError(422, 'INVALID_COMMENT', '短评无效')
      const comment = body.comment.replaceAll('\0', '')
      if ([...comment].length > 60) throw new HttpError(422, 'COMMENT_TOO_LONG', '短评不能超过 60 个字符')

      const now = dependencies.now()
      const existing = readCookie(request, VOTER_COOKIE)
      const parsed = existing ? parseSignedCookie(existing, dependencies.cookieSecret, now) : null
      const expiresAt = now + 365 * 24 * 60 * 60 * 1000
      if (!parsed) {
        const voterToken = dependencies.randomToken()
        return jsonResponse(
          {
            error: {
              code: 'VOTER_SESSION_REQUIRED',
              message: '已建立浏览器投票会话，请重试提交',
            },
          },
          {
            status: 409,
            headers: {
              'set-cookie': serializeHttpOnlyCookie(
                VOTER_COOKIE,
                createSignedCookie(voterToken, expiresAt, dependencies.cookieSecret),
                365 * 24 * 60 * 60,
                dependencies.secure ?? false,
              ),
            },
          },
        )
      }
      const voterToken = parsed.value
      const result = await dependencies.database.castVote({
        pollId,
        optionId,
        voterCookieHash: hashOpaqueToken(`poll-voter:${pollId}`, voterToken, dependencies.cookieSecret),
        comment,
        now: new Date(now),
      })
      if (result === 'duplicate') throw new HttpError(409, 'ALREADY_VOTED', '这个浏览器已经投过票')
      if (result === 'invalid_option') throw new HttpError(422, 'INVALID_OPTION', '选项不属于这个投票')
      if (result === 'not_found') throw new HttpError(404, 'POLL_NOT_FOUND', '投票不存在')
      if (result === 'gone') throw new HttpError(410, 'POLL_GONE', '投票已过期或撤销')
      return jsonResponse(
        { voted: true },
        {
          status: 201,
          headers: {
            'set-cookie': serializeHttpOnlyCookie(
              VOTER_COOKIE,
              createSignedCookie(voterToken, expiresAt, dependencies.cookieSecret),
              365 * 24 * 60 * 60,
              dependencies.secure ?? false,
            ),
          },
        },
      )
    } catch (error) {
      return toErrorResponse(error)
    }
  }
}

export default async function handler(request: Request): Promise<Response> {
  try {
    const config = readRuntimeConfig(process.env)
    return createPollVoteHandler({
      database: new NeonDatabase(config.databaseUrl),
      cookieSecret: config.cookieSigningSecret,
      now: Date.now,
      randomToken: randomOpaqueToken,
      secure: process.env.VERCEL_ENV === 'production',
    })(request)
  } catch (error) {
    return toErrorResponse(error)
  }
}
