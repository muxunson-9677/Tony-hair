import { HttpError, readCookie } from './http'
import { hashOpaqueToken, parseSignedCookie } from './security'

export const VOTER_COOKIE = 'zjf_voter'

export function pollIdFromRequest(request: Request): string {
  const segments = new URL(request.url).pathname.split('/').filter(Boolean)
  const pollIndex = segments.lastIndexOf('polls')
  const pollId = pollIndex >= 0 ? segments[pollIndex + 1] : undefined
  if (!pollId || !/^[A-Za-z0-9_-]{16,96}$/.test(pollId)) {
    throw new HttpError(404, 'POLL_NOT_FOUND', '投票不存在')
  }
  return pollId
}

export function requireManagementToken(request: Request): string {
  const token = request.headers.get('x-poll-management-token')
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
    throw new HttpError(401, 'MANAGEMENT_TOKEN_REQUIRED', '管理令牌无效')
  }
  const decoded = Buffer.from(token, 'base64url')
  if (decoded.byteLength !== 32 || decoded.toString('base64url') !== token) {
    throw new HttpError(401, 'MANAGEMENT_TOKEN_REQUIRED', '管理令牌无效')
  }
  return token
}

export function plainTextWithin(value: unknown, minimum: number, maximum: number): value is string {
  return (
    typeof value === 'string' &&
    !value.includes('\0') &&
    [...value].length >= minimum &&
    [...value].length <= maximum
  )
}

export function voterHashFromRequest(
  request: Request,
  cookieSecret: string,
  now: number,
  pollId: string,
): string | null {
  const encoded = readCookie(request, VOTER_COOKIE)
  const parsed = encoded ? parseSignedCookie(encoded, cookieSecret, now) : null
  return parsed ? hashOpaqueToken(`poll-voter:${pollId}`, parsed.value, cookieSecret) : null
}
