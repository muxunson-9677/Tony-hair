import { readRuntimeConfig } from '../../_lib/config'
import { NeonDatabase } from '../../_lib/database'
import { HttpError, jsonResponse, requireMethod, toErrorResponse } from '../../_lib/http'
import { pollIdFromRequest, requireManagementToken } from '../../_lib/polls'
import { hashOpaqueToken } from '../../_lib/security'

interface PollResults {
  total: number
  none: number
  options: Array<{ optionId: string; votes: number }>
  comments: Array<{ comment: string; createdAt: string }>
}

type ResultsLookup =
  | { outcome: 'active'; results: PollResults }
  | { outcome: 'not_found' }
  | { outcome: 'gone' }
  | { outcome: 'forbidden' }

export interface PollResultsDatabase {
  getResults(input: {
    pollId: string
    managementTokenHash: string
    now: Date
  }): Promise<ResultsLookup>
}

export function createPollResultsHandler(dependencies: {
  database: PollResultsDatabase
  managementTokenPepper: string
  now: () => number
}) {
  return async (request: Request): Promise<Response> => {
    try {
      requireMethod(request, 'GET')
      const pollId = pollIdFromRequest(request)
      const token = requireManagementToken(request)
      const result = await dependencies.database.getResults({
        pollId,
        managementTokenHash: hashOpaqueToken(
          `poll-management:${pollId}`,
          token,
          dependencies.managementTokenPepper,
        ),
        now: new Date(dependencies.now()),
      })
      if (result.outcome === 'not_found') throw new HttpError(404, 'POLL_NOT_FOUND', '投票不存在')
      if (result.outcome === 'gone') throw new HttpError(410, 'POLL_GONE', '投票已过期或撤销')
      if (result.outcome === 'forbidden') throw new HttpError(403, 'MANAGEMENT_DENIED', '管理令牌不匹配')
      return jsonResponse(result.results)
    } catch (error) {
      return toErrorResponse(error)
    }
  }
}

export default async function handler(request: Request): Promise<Response> {
  try {
    const config = readRuntimeConfig(process.env)
    return createPollResultsHandler({
      database: new NeonDatabase(config.databaseUrl),
      managementTokenPepper: config.managementTokenPepper,
      now: Date.now,
    })(request)
  } catch (error) {
    return toErrorResponse(error)
  }
}
