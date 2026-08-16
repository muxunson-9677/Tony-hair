export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers)
  headers.set('content-type', 'application/json; charset=utf-8')
  headers.set('cache-control', 'no-store')
  return new Response(JSON.stringify(body), { ...init, headers })
}

export function toErrorResponse(error: unknown): Response {
  if (error instanceof HttpError) {
    return jsonResponse({ error: { code: error.code, message: error.message } }, { status: error.status })
  }
  return jsonResponse(
    { error: { code: 'INTERNAL_ERROR', message: '服务器暂时不可用' } },
    { status: 500 },
  )
}

export function requireMethod(request: Request, method: string): void {
  if (request.method.toUpperCase() !== method) {
    throw new HttpError(400, 'METHOD_NOT_ALLOWED', '请求方法不支持')
  }
}

export function requireSameOrigin(request: Request): void {
  const origin = request.headers.get('origin')
  const expected = new URL(request.url).origin
  if (origin !== expected) throw new HttpError(403, 'ORIGIN_DENIED', '请求来源不受信任')
}

export async function readRawBody(request: Request, limitBytes: number): Promise<Uint8Array> {
  const contentLength = request.headers.get('content-length')
  if (contentLength !== null) {
    const declared = Number(contentLength)
    if (!Number.isSafeInteger(declared) || declared < 0) {
      throw new HttpError(400, 'INVALID_CONTENT_LENGTH', '请求长度无效')
    }
    if (declared > limitBytes) throw new HttpError(413, 'BODY_TOO_LARGE', '请求内容过大')
  }

  if (!request.body) return new Uint8Array()
  const chunks: Uint8Array[] = []
  let total = 0
  const reader = request.body.getReader()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > limitBytes) {
        await reader.cancel()
        throw new HttpError(413, 'BODY_TOO_LARGE', '请求内容过大')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  const body = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return body
}

export async function readJsonBody<T>(request: Request, limitBytes: number): Promise<T> {
  const raw = await readRawBody(request, limitBytes)
  try {
    return JSON.parse(new TextDecoder().decode(raw)) as T
  } catch {
    throw new HttpError(400, 'INVALID_JSON', '请求内容不是有效 JSON')
  }
}

export function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function readCookie(request: Request, name: string): string | null {
  const cookieHeader = request.headers.get('cookie')
  if (!cookieHeader) return null
  for (const field of cookieHeader.split(';')) {
    const separator = field.indexOf('=')
    if (separator < 0) continue
    if (field.slice(0, separator).trim() === name) return field.slice(separator + 1).trim()
  }
  return null
}

export function serializeHttpOnlyCookie(
  name: string,
  value: string,
  maxAgeSeconds: number,
  secure: boolean,
): string {
  return `${name}=${value}; Max-Age=${maxAgeSeconds}; Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`
}
