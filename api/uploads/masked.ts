import { createHash } from 'node:crypto'

import { authenticateSession } from '../_lib/access'
import { createBlobStore } from '../_lib/blob'
import { readRuntimeConfig } from '../_lib/config'
import { NeonDatabase } from '../_lib/database'
import {
  HttpError,
  jsonResponse,
  readRawBody,
  requireMethod,
  requireSameOrigin,
  toErrorResponse,
} from '../_lib/http'
import { randomOpaqueToken } from '../_lib/security'

export interface UploadDatabase {
  reserveAsset(input: {
    sessionHash: string
    uploadId: string
    pathname: string
    bytes: number
    contentType: 'image/jpeg' | 'image/webp'
    contentHash: string
    now: Date
  }): Promise<
    | { outcome: 'reserved'; assetId: string; pathname?: string }
    | { outcome: 'reserved_replay'; assetId: string; pathname?: string }
    | { outcome: 'ready'; assetId: string; blobUrl: string }
    | { outcome: 'pending_limit' }
    | { outcome: 'global_limit' }
    | { outcome: 'conflict' }
    | { outcome: 'attached' }
  >
  markAssetReady(input: {
    sessionHash: string
    uploadId: string
    blobUrl: string
    now: Date
  }): Promise<boolean>
}

interface UploadDependencies {
  database: UploadDatabase
  putBlob: (
    body: Uint8Array,
    options: { pathname: string; cacheControlMaxAge: number },
  ) => Promise<{ url: string }>
  cookieSecret: string
  now: () => number
  randomToken: () => string
}

function validatedImageType(contentType: string | null, body: Uint8Array): 'image/jpeg' | 'image/webp' {
  const jpeg = body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff
  const webp =
    body.length >= 12 &&
    new TextDecoder().decode(body.slice(0, 4)) === 'RIFF' &&
    new TextDecoder().decode(body.slice(8, 12)) === 'WEBP'
  if (contentType === 'image/jpeg' && jpeg) return 'image/jpeg'
  if (contentType === 'image/webp' && webp) return 'image/webp'
  throw new HttpError(415, 'UNSUPPORTED_IMAGE', '仅支持与声明格式一致的 JPEG 或 WebP 图片')
}

export function createMaskedUploadHandler(dependencies: UploadDependencies) {
  return async (request: Request): Promise<Response> => {
    try {
      requireMethod(request, 'POST')
      requireSameOrigin(request)
      const now = dependencies.now()
      const { sessionHash } = authenticateSession(request, dependencies.cookieSecret, now)
      const body = await readRawBody(request, 1_500_000)
      if (body.length === 0) throw new HttpError(400, 'EMPTY_IMAGE', '图片内容不能为空')
      const contentType = validatedImageType(request.headers.get('content-type'), body)
      const uploadId = request.headers.get('x-upload-id')
      if (!uploadId || !/^[A-Za-z0-9_-]{16,128}$/.test(uploadId)) {
        throw new HttpError(422, 'INVALID_UPLOAD_ID', '上传标识无效')
      }
      const extension = contentType === 'image/webp' ? 'webp' : 'jpg'
      const pathname = `polls/${dependencies.randomToken()}.${extension}`
      const contentHash = createHash('sha256').update(body).digest('hex')
      const reservation = await dependencies.database.reserveAsset({
        sessionHash,
        uploadId,
        pathname,
        bytes: body.byteLength,
        contentType,
        contentHash,
        now: new Date(now),
      })
      if (reservation.outcome === 'pending_limit') {
        throw new HttpError(409, 'SESSION_UPLOAD_LIMIT', '当前会话待处理图片已达上限')
      }
      if (reservation.outcome === 'global_limit') {
        throw new HttpError(503, 'SHARE_STORAGE_LIMIT', '分享空间暂时已满')
      }
      if (reservation.outcome === 'conflict') {
        throw new HttpError(409, 'UPLOAD_CONTENT_CONFLICT', '相同上传标识对应了不同图片')
      }
      if (reservation.outcome === 'attached') {
        throw new HttpError(409, 'UPLOAD_ALREADY_ATTACHED', '图片已经用于投票，不能再次上传')
      }
      if (reservation.outcome === 'ready') {
        return jsonResponse(
          {
            uploadId,
            assetId: reservation.assetId,
            url: reservation.blobUrl,
            bytes: body.byteLength,
            contentType,
            idempotent: true,
          },
          { status: 200 },
        )
      }

      const reservedPathname = reservation.pathname ?? pathname
      let uploaded: { url: string }
      try {
        uploaded = await dependencies.putBlob(body, { pathname: reservedPathname, cacheControlMaxAge: 60 })
      } catch {
        throw new HttpError(503, 'BLOB_UNAVAILABLE', '图片存储暂时不可用，请稍后重试')
      }
      const ready = await dependencies.database.markAssetReady({
        sessionHash,
        uploadId,
        blobUrl: uploaded.url,
        now: new Date(now),
      })
      if (!ready) throw new HttpError(503, 'UPLOAD_STATE_ERROR', '上传状态保存失败，请稍后重试')
      return jsonResponse(
        {
          uploadId,
          assetId: reservation.assetId,
          url: uploaded.url,
          bytes: body.byteLength,
          contentType,
          idempotent: reservation.outcome === 'reserved_replay',
        },
        { status: reservation.outcome === 'reserved_replay' ? 200 : 201 },
      )
    } catch (error) {
      return toErrorResponse(error)
    }
  }
}

export default async function handler(request: Request): Promise<Response> {
  try {
    const config = readRuntimeConfig(process.env)
    const database = new NeonDatabase(config.databaseUrl)
    const blob = createBlobStore(config.blobToken)
    return createMaskedUploadHandler({
      database,
      putBlob: blob.put,
      cookieSecret: config.cookieSigningSecret,
      now: Date.now,
      randomToken: randomOpaqueToken,
    })(request)
  } catch (error) {
    return toErrorResponse(error)
  }
}
