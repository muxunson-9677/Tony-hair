import { describe, expect, it } from 'vitest'

import {
  createSignedCookie,
  hashOpaqueToken,
  parseSignedCookie,
  verifyScryptSecret,
} from './security'

describe('security primitives', () => {
  it('verifies a versioned scrypt hash asynchronously', async () => {
    const encoded =
      'scrypt$v1$16384$8$1$00112233445566778899aabbccddeeff$8f95f0edd763b3c649324a4f153673e4c620efe445a840b16ca341c824e3d76c675d7ad7e6e76dbe4b6f74b8994e69954bb4d99903a2a2b9ff6737347ca5c652'

    await expect(verifyScryptSecret('正确体验码', encoded)).resolves.toBe(true)
    await expect(verifyScryptSecret('错误体验码', encoded)).resolves.toBe(false)
  })

  it('rejects malformed scrypt encodings without throwing', async () => {
    await expect(verifyScryptSecret('anything', 'not-a-hash')).resolves.toBe(false)
    await expect(verifyScryptSecret('anything', 'scrypt$v1$bad')).resolves.toBe(false)
  })

  it('round-trips signed cookies and rejects tampering or expiry', () => {
    const now = Date.parse('2026-08-10T00:00:00.000Z')
    const cookie = createSignedCookie('session-1', now + 60_000, 'signing-secret')

    expect(parseSignedCookie(cookie, 'signing-secret', now)).toEqual({
      value: 'session-1',
      expiresAt: now + 60_000,
    })
    expect(parseSignedCookie(`${cookie}x`, 'signing-secret', now)).toBeNull()
    expect(parseSignedCookie(cookie, 'signing-secret', now + 60_001)).toBeNull()
  })

  it('domain-separates opaque-token hashes', () => {
    expect(hashOpaqueToken('poll:one', 'token', 'pepper')).not.toBe(
      hashOpaqueToken('poll:two', 'token', 'pepper'),
    )
  })
})
