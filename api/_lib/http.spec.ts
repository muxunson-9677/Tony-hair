import { describe, expect, it } from 'vitest'

import { HttpError, readJsonBody, readRawBody, requireSameOrigin, toErrorResponse } from './http'

describe('HTTP helpers', () => {
  it('requires an exact same-origin write request', () => {
    const request = new Request('https://app.example/api', {
      headers: { origin: 'https://app.example' },
    })
    expect(() => requireSameOrigin(request)).not.toThrow()

    const foreign = new Request('https://app.example/api', {
      headers: { origin: 'https://evil.example' },
    })
    expect(() => requireSameOrigin(foreign)).toThrowError(
      expect.objectContaining({ status: 403, code: 'ORIGIN_DENIED' }),
    )
  })

  it('bounds JSON bodies before parsing', async () => {
    const request = new Request('https://app.example/api', {
      method: 'POST',
      body: JSON.stringify({ value: 'x'.repeat(100) }),
    })
    await expect(readJsonBody(request, 16)).rejects.toMatchObject({ status: 413 })
  })

  it('stream-bounds raw bodies even without content-length', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(6))
        controller.enqueue(new Uint8Array(6))
        controller.close()
      },
    })
    const request = new Request('https://app.example/api', { method: 'POST', body: stream, duplex: 'half' } as RequestInit & { duplex: 'half' })
    await expect(readRawBody(request, 10)).rejects.toMatchObject({ status: 413 })
  })

  it('returns stable no-store JSON errors without CORS', async () => {
    const response = toErrorResponse(new HttpError(422, 'INVALID_INPUT', 'invalid'))
    expect(response.status).toBe(422)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.has('access-control-allow-origin')).toBe(false)
    await expect(response.json()).resolves.toEqual({ error: { code: 'INVALID_INPUT', message: 'invalid' } })
  })
})
