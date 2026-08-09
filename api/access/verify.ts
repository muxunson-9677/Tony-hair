import { SESSION_COOKIE } from '../_lib/access'
import { readRuntimeConfig } from '../_lib/config'
import {
  HttpError,
  isJsonObject,
  jsonResponse,
  readJsonBody,
  requireMethod,
  requireSameOrigin,
  serializeHttpOnlyCookie,
  toErrorResponse,
} from '../_lib/http'
import { createSignedCookie, randomOpaqueToken, verifyScryptSecret } from '../_lib/security'

const ACCESS_DENIED_MESSAGE = '\u4f53\u9a8c\u7801\u65e0\u6548'

interface VerifyAccessDependencies {
  accessCodeHash: string
  cookieSecret: string
  now: () => number
  randomToken: () => string
  secure: boolean
}

export function createVerifyAccessHandler(dependencies: VerifyAccessDependencies) {
  return async (request: Request): Promise<Response> => {
    try {
      requireMethod(request, 'POST')
      requireSameOrigin(request)
      const body = await readJsonBody<unknown>(request, 512)
      if (!isJsonObject(body)) throw new HttpError(401, 'ACCESS_DENIED', ACCESS_DENIED_MESSAGE)
      const valid =
        typeof body.code === 'string' &&
        body.code.length <= 128 &&
        (await verifyScryptSecret(body.code, dependencies.accessCodeHash))
      if (!valid) throw new HttpError(401, 'ACCESS_DENIED', ACCESS_DENIED_MESSAGE)

      const now = dependencies.now()
      const expiresAt = now + 2 * 60 * 60 * 1000
      const signed = createSignedCookie(
        dependencies.randomToken(),
        expiresAt,
        dependencies.cookieSecret,
      )
      return jsonResponse(
        { expiresAt: new Date(expiresAt).toISOString() },
        {
          status: 200,
          headers: {
            'set-cookie': serializeHttpOnlyCookie(
              SESSION_COOKIE,
              signed,
              2 * 60 * 60,
              dependencies.secure,
            ),
          },
        },
      )
    } catch (error) {
      return toErrorResponse(error)
    }
  }
}

export default async function handler(request: Request): Promise<Response> {
  try {
    const config = readRuntimeConfig(process.env)
    return createVerifyAccessHandler({
      accessCodeHash: config.accessCodeHash,
      cookieSecret: config.cookieSigningSecret,
      now: Date.now,
      randomToken: randomOpaqueToken,
      secure: process.env.VERCEL_ENV === 'production',
    })(request)
  } catch (error) {
    return toErrorResponse(error)
  }
}
