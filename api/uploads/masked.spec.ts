import { describe, expect, it } from 'vitest'

import { createSignedCookie } from '../_lib/security'
import { createMaskedUploadHandler, type UploadDatabase } from './masked'

function jpeg(bytes = 16): Uint8Array {
  const value = new Uint8Array(bytes)
  value.set([0xff, 0xd8, 0xff])
  return value
}

function webp(): Uint8Array {
  return Uint8Array.from([0x52, 0x49, 0x46, 0x46, 4, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])
}

const clientUploadId = 'upload_1234567890123456'

function db(
  outcome: Awaited<ReturnType<UploadDatabase['reserveAsset']>> = {
    outcome: 'reserved',
    assetId: '11111111-1111-4111-8111-111111111111',
  },
): UploadDatabase {
  return {
    reserveAsset: async () => outcome,
    markAssetReady: async () => true,
  }
}

function request(
  body: string | Uint8Array | ReadableStream<Uint8Array>,
  contentType: string,
  cookie = validCookie(),
  uploadId: string | null = clientUploadId,
) {
  const headers: Record<string, string> = {
    'content-type': contentType,
    cookie,
    origin: 'https://app.example',
  }
  if (uploadId) headers['x-upload-id'] = uploadId
  return new Request('https://app.example/api/uploads/masked', {
    method: 'POST',
    headers,
    body: body as never,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' })
}

function validCookie() {
  return `zjf_session=${createSignedCookie('session', 2_000, 'cookie-secret')}`
}

function handler(
  database = db(),
  putBlob: (
    body: Uint8Array,
    options: { pathname: string; cacheControlMaxAge: number },
  ) => Promise<{ url: string }> = async () => ({ url: 'https://blob.example/file.webp' }),
) {
  return createMaskedUploadHandler({
    database,
    putBlob,
    cookieSecret: 'cookie-secret',
    now: () => 1_000,
    randomToken: () => 'a'.repeat(32),
  })
}

describe('POST /api/uploads/masked', () => {
  it('accepts JPEG and WebP only when declared type matches magic bytes', async () => {
    expect((await handler()(request(jpeg(), 'image/jpeg'))).status).toBe(201)
    expect((await handler()(request(webp(), 'image/webp'))).status).toBe(201)
    expect((await handler()(request(webp(), 'image/jpeg'))).status).toBe(415)
    expect((await handler()(request(jpeg(), 'image/png'))).status).toBe(415)
  })

  it('hard-caps a chunked body at 1,500,000 bytes without content-length', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(jpeg(1_000_000))
        controller.enqueue(new Uint8Array(500_001))
        controller.close()
      },
    })
    const response = await handler()(request(stream, 'image/jpeg'))
    expect(response.status).toBe(413)
  })

  it('maps session pending and global quota decisions without calling Blob', async () => {
    let puts = 0
    const putBlob = async () => {
      puts += 1
      return { url: 'unused' }
    }
    expect((await handler(db({ outcome: 'pending_limit' }), putBlob)(request(jpeg(), 'image/jpeg'))).status).toBe(409)
    expect((await handler(db({ outcome: 'global_limit' }), putBlob)(request(jpeg(), 'image/jpeg'))).status).toBe(503)
    expect(puts).toBe(0)
  })

  it('uses a server-only random pathname and 60-second cache, never a filename', async () => {
    let observed: { pathname: string; cacheControlMaxAge: number } | undefined
    const response = await handler(db(), async (_body, options) => {
      observed = options
      return { url: 'https://blob.example/random.webp' }
    })(request(webp(), 'image/webp'))
    expect(response.status).toBe(201)
    expect(observed).toEqual({ pathname: `polls/${'a'.repeat(32)}.webp`, cacheControlMaxAge: 60 })
  })

  it('requires a stable client upload id and returns the database asset id', async () => {
    expect((await handler()(request(jpeg(), 'image/jpeg', validCookie(), null))).status).toBe(422)
    const response = await handler()(request(jpeg(), 'image/jpeg'))
    await expect(response.json()).resolves.toMatchObject({
      uploadId: clientUploadId,
      assetId: '11111111-1111-4111-8111-111111111111',
    })
  })

  it('binds an upload idempotency decision to the SHA-256 content hash', async () => {
    let contentHash = ''
    const database: UploadDatabase = {
      reserveAsset: async (input) => {
        contentHash = input.contentHash
        return { outcome: 'reserved', assetId: '11111111-1111-4111-8111-111111111111' }
      },
      markAssetReady: async () => true,
    }
    expect((await handler(database)(request(jpeg(), 'image/jpeg'))).status).toBe(201)
    expect(contentHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('returns the original ready asset after a lost response without re-uploading Blob', async () => {
    let puts = 0
    const ready = db({
      outcome: 'ready',
      assetId: '22222222-2222-4222-8222-222222222222',
      blobUrl: 'https://blob.example/original.webp',
    })
    const response = await handler(ready, async () => {
      puts += 1
      return { url: 'wrong' }
    })(request(webp(), 'image/webp'))
    expect(response.status).toBe(200)
    expect(puts).toBe(0)
    await expect(response.json()).resolves.toMatchObject({
      assetId: '22222222-2222-4222-8222-222222222222',
      idempotent: true,
    })
  })

  it('replays an identical reservation to the same server pathname', async () => {
    let pathname = ''
    const replay = db({
      outcome: 'reserved_replay',
      assetId: '33333333-3333-4333-8333-333333333333',
      pathname: 'polls/original.webp',
    })
    const response = await handler(replay, async (_body, options) => {
      pathname = options.pathname
      return { url: 'https://blob.example/original.webp' }
    })(request(webp(), 'image/webp'))
    expect(response.status).toBe(200)
    expect(pathname).toBe('polls/original.webp')
  })

  it('rejects a changed retry or already attached asset', async () => {
    expect((await handler(db({ outcome: 'conflict' }))(request(jpeg(), 'image/jpeg'))).status).toBe(409)
    expect((await handler(db({ outcome: 'attached' }))(request(jpeg(), 'image/jpeg'))).status).toBe(409)
  })

  it('leaves the database reservation recoverable when Blob fails', async () => {
    let markedReady = false
    const database: UploadDatabase = {
      reserveAsset: async () => ({
        outcome: 'reserved',
        assetId: '11111111-1111-4111-8111-111111111111',
      }),
      markAssetReady: async () => {
        markedReady = true
        return true
      },
    }
    const response = await handler(database, async () => {
      throw new Error('blob unavailable')
    })(request(jpeg(), 'image/jpeg'))
    expect(response.status).toBe(503)
    expect(markedReady).toBe(false)
  })

  it('rejects missing, tampered, and expired sessions', async () => {
    expect((await handler()(request(jpeg(), 'image/jpeg', ''))).status).toBe(401)
    expect((await handler()(request(jpeg(), 'image/jpeg', `${validCookie()}x`))).status).toBe(401)
    const expired = `zjf_session=${createSignedCookie('session', 999, 'cookie-secret')}`
    expect((await handler()(request(jpeg(), 'image/jpeg', expired))).status).toBe(401)
  })
})
