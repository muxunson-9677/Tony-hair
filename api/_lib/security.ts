import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'

const SCRYPT_PREFIX = 'scrypt$v1'

function fixedTimeEqual(left: Buffer, right: Buffer): boolean {
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

export async function verifyScryptSecret(secret: string, encoded: string): Promise<boolean> {
  try {
    const [algorithm, version, nText, rText, pText, saltHex, expectedHex, extra] = encoded.split('$')
    if (`${algorithm}$${version}` !== SCRYPT_PREFIX || extra !== undefined) return false

    const N = Number(nText)
    const r = Number(rText)
    const p = Number(pText)
    if (!Number.isSafeInteger(N) || N < 2 ** 14 || N > 2 ** 20 || (N & (N - 1)) !== 0) return false
    if (!Number.isSafeInteger(r) || r < 1 || r > 32) return false
    if (!Number.isSafeInteger(p) || p < 1 || p > 16) return false
    if (!/^[a-f0-9]{32,128}$/i.test(saltHex) || !/^[a-f0-9]{64,128}$/i.test(expectedHex)) return false

    const salt = Buffer.from(saltHex, 'hex')
    const expected = Buffer.from(expectedHex, 'hex')
    const actual = await new Promise<Buffer>((resolve, reject) => {
      scrypt(secret, salt, expected.length, { N, r, p, maxmem: 256 * 1024 * 1024 }, (error, key) => {
        if (error) reject(error)
        else resolve(key)
      })
    })
    return fixedTimeEqual(actual, expected)
  } catch {
    return false
  }
}

function signature(payload: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(payload).digest()
}

export function createSignedCookie(value: string, expiresAt: number, secret: string): string {
  const payload = Buffer.from(JSON.stringify({ v: value, e: expiresAt }), 'utf8').toString('base64url')
  return `${payload}.${signature(payload, secret).toString('base64url')}`
}

export function parseSignedCookie(
  encoded: string,
  secret: string,
  now = Date.now(),
): { value: string; expiresAt: number } | null {
  try {
    const parts = encoded.split('.')
    if (parts.length !== 2) return null
    const [payload, providedText] = parts as [string, string]
    const provided = Buffer.from(providedText, 'base64url')
    if (!fixedTimeEqual(provided, signature(payload, secret))) return null
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      v?: unknown
      e?: unknown
    }
    if (typeof parsed.v !== 'string' || !Number.isSafeInteger(parsed.e) || Number(parsed.e) <= now) return null
    return { value: parsed.v, expiresAt: Number(parsed.e) }
  } catch {
    return null
  }
}

export function hashOpaqueToken(domain: string, token: string, pepper: string): string {
  return createHmac('sha256', pepper).update(`${domain}\0${token}`, 'utf8').digest('hex')
}

export function randomOpaqueToken(bytes = 24): string {
  return randomBytes(bytes).toString('base64url')
}

export function safeTokenEqual(expectedHex: string, actualHex: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(expectedHex) || !/^[a-f0-9]{64}$/i.test(actualHex)) return false
  return fixedTimeEqual(Buffer.from(expectedHex, 'hex'), Buffer.from(actualHex, 'hex'))
}

export function constantTimeTextEqual(left: string, right: string): boolean {
  return fixedTimeEqual(createHash('sha256').update(left).digest(), createHash('sha256').update(right).digest())
}
