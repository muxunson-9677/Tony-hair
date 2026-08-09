import { describe, expect, it } from 'vitest'

import { createVerifyAccessHandler } from './verify'

const validHash =
  'scrypt$v1$16384$8$1$00112233445566778899aabbccddeeff$8f95f0edd763b3c649324a4f153673e4c620efe445a840b16ca341c824e3d76c675d7ad7e6e76dbe4b6f74b8994e69954bb4d99903a2a2b9ff6737347ca5c652'

function request(code: unknown, origin = 'https://app.example') {
  return new Request('https://app.example/api/access/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify({ code }),
  })
}

function rawRequest(body: unknown) {
  return new Request('https://app.example/api/access/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://app.example' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/access/verify', () => {
  it.each([null, []])('maps a non-object JSON root to the uniform access denial', async (body) => {
    let randomCalls = 0
    const handler = createVerifyAccessHandler({
      accessCodeHash: validHash,
      cookieSecret: 'cookie-secret',
      now: () => 1_786_320_000_000,
      randomToken: () => {
        randomCalls += 1
        return 'session-token'
      },
      secure: true,
    })
    const response = await handler(rawRequest(body))
    const ordinaryDenial = await handler(request(42))
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual(await ordinaryDenial.json())
    expect(randomCalls).toBe(0)
  })

  it('returns one uniform 401 response for wrong or malformed codes', async () => {
    const handler = createVerifyAccessHandler({
      accessCodeHash: validHash,
      cookieSecret: 'cookie-secret',
      now: () => 1_786_320_000_000,
      randomToken: () => 'session-token',
      secure: true,
    })
    const wrong = await handler(request('错误体验码'))
    const malformed = await handler(request(42))
    expect(wrong.status).toBe(401)
    expect(malformed.status).toBe(401)
    expect(await wrong.json()).toEqual(await malformed.json())
  })

  it('sets a signed two-hour HttpOnly SameSite cookie', async () => {
    const now = 1_786_320_000_000
    const handler = createVerifyAccessHandler({
      accessCodeHash: validHash,
      cookieSecret: 'cookie-secret',
      now: () => now,
      randomToken: () => 'session-token',
      secure: true,
    })
    const response = await handler(request('正确体验码'))
    expect(response.status).toBe(200)
    expect(response.headers.get('set-cookie')).toMatch(
      /^zjf_session=.+; Max-Age=7200; Path=\/; HttpOnly; SameSite=Lax; Secure$/,
    )
    await expect(response.json()).resolves.toEqual({ expiresAt: new Date(now + 7_200_000).toISOString() })
  })

  it('rejects cross-origin writes', async () => {
    const handler = createVerifyAccessHandler({
      accessCodeHash: validHash,
      cookieSecret: 'cookie-secret',
      now: () => 0,
      randomToken: () => 'session-token',
      secure: false,
    })
    expect((await handler(request('正确体验码', 'https://evil.example'))).status).toBe(403)
  })
})
