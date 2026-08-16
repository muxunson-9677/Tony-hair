import { createBlobStore } from '../_lib/blob'
import { readRuntimeConfig } from '../_lib/config'
import { NeonDatabase } from '../_lib/database'
import { HttpError, jsonResponse, requireMethod, toErrorResponse } from '../_lib/http'
import { constantTimeTextEqual } from '../_lib/security'

export interface CleanupDatabase {
  claimCleanup(input: { now: Date; batchSize: number }): Promise<string[]>
  finalizeCleanup(pathnames: string[]): Promise<void>
}

export function createCleanupHandler(dependencies: {
  database: CleanupDatabase
  deleteBlobs: (pathnames: string[]) => Promise<void>
  cronSecret: string
  now: () => number
  batchSize: number
}) {
  return async (request: Request): Promise<Response> => {
    try {
      requireMethod(request, 'GET')
      const authorization = request.headers.get('authorization')
      const expected = `Bearer ${dependencies.cronSecret}`
      if (!authorization || !constantTimeTextEqual(authorization, expected)) {
        throw new HttpError(401, 'CRON_UNAUTHORIZED', '清理任务认证失败')
      }
      const pathnames = await dependencies.database.claimCleanup({
        now: new Date(dependencies.now()),
        batchSize: Math.max(1, Math.min(dependencies.batchSize, 100)),
      })
      try {
        await dependencies.deleteBlobs(pathnames)
      } catch {
        throw new HttpError(503, 'CLEANUP_RETRY_REQUIRED', '清理未完成，将在后续任务中重试')
      }
      await dependencies.database.finalizeCleanup(pathnames)
      return jsonResponse({ processed: pathnames.length })
    } catch (error) {
      return toErrorResponse(error)
    }
  }
}

export default async function handler(request: Request): Promise<Response> {
  try {
    const config = readRuntimeConfig(process.env)
    const blob = createBlobStore(config.blobToken)
    return createCleanupHandler({
      database: new NeonDatabase(config.databaseUrl),
      deleteBlobs: blob.delete,
      cronSecret: config.cronSecret,
      now: Date.now,
      batchSize: 50,
    })(request)
  } catch (error) {
    return toErrorResponse(error)
  }
}
