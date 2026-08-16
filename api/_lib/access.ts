import { HttpError, readCookie } from './http'
import { hashOpaqueToken, parseSignedCookie } from './security'

export const SESSION_COOKIE = 'zjf_session'

export function authenticateSession(
  request: Request,
  cookieSecret: string,
  now: number,
): { sessionHash: string; expiresAt: number } {
  const encoded = readCookie(request, SESSION_COOKIE)
  const parsed = encoded ? parseSignedCookie(encoded, cookieSecret, now) : null
  if (!parsed) throw new HttpError(401, 'SESSION_REQUIRED', '体验会话无效或已过期')
  return {
    sessionHash: hashOpaqueToken('share-session', parsed.value, cookieSecret),
    expiresAt: parsed.expiresAt,
  }
}
