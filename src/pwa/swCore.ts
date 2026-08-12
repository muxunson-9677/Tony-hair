// Service Worker 缓存策略核心。保持纯粹可单测：sw.ts 只做事件接线。

export const CACHE_PREFIX = 'tonybao-shell'
export const CACHE_VERSION = 'v1'
export const CACHE_NAME = `${CACHE_PREFIX}-${CACHE_VERSION}`

export const SHELL_FALLBACK_KEY = '/'

export type FetchStrategy = 'navigation' | 'cache-first' | 'passthrough'

interface RequestLike {
  readonly method: string
  readonly mode: RequestMode | string
  readonly url: string
}

interface ResponseLike {
  readonly ok?: boolean
  clone?: () => unknown
}

// 方法签名（而非属性箭头函数）刻意保持双变，让真实 Cache/fetch 与测试替身都能结构匹配。
interface CacheLike {
  match(key: string): Promise<unknown>
  put(key: string, value: unknown): Promise<void>
}

interface CacheStorageLike {
  keys(): Promise<string[]>
  delete(name: string): Promise<boolean>
}

const CACHE_FIRST_PATTERN = /^\/(assets|brand|demo)\//

export const classifyRequest = (request: RequestLike, origin: string): FetchStrategy => {
  if (request.method !== 'GET') {
    return 'passthrough'
  }
  if (request.mode === 'navigate') {
    return 'navigation'
  }
  const url = new URL(request.url)
  if (url.origin !== origin) {
    return 'passthrough'
  }
  if (url.pathname.startsWith('/mediapipe/')) {
    return 'passthrough'
  }
  if (CACHE_FIRST_PATTERN.test(url.pathname) || url.pathname === '/manifest.webmanifest') {
    return 'cache-first'
  }
  return 'passthrough'
}

export const cleanupStaleCaches = async (cacheStorage: CacheStorageLike) => {
  const names = await cacheStorage.keys()
  await Promise.all(
    names
      .filter((name) => name.startsWith(`${CACHE_PREFIX}-`) && name !== CACHE_NAME)
      .map((name) => cacheStorage.delete(name)),
  )
}

interface RespondNavigationInput {
  readonly fetchFn: (request: RequestLike) => Promise<ResponseLike>
  readonly cache: CacheLike
  readonly request: RequestLike
}

// 导航网络优先：在线永远拿最新 HTML（新版本下次打开生效），断网回退缓存外壳。
export const respondNavigation = async ({ fetchFn, cache, request }: RespondNavigationInput) => {
  try {
    const response = await fetchFn(request)
    if (response.ok !== false && response.clone) {
      await cache.put(SHELL_FALLBACK_KEY, response.clone())
    }
    return response
  } catch (error) {
    const cached = await cache.match(SHELL_FALLBACK_KEY)
    if (cached) {
      return cached
    }
    throw error
  }
}

interface RespondCacheFirstInput {
  readonly fetchFn: (request: RequestLike) => Promise<ResponseLike>
  readonly cache: CacheLike
  readonly request: RequestLike
  readonly cacheKey: string
}

export const respondCacheFirst = async ({ fetchFn, cache, request, cacheKey }: RespondCacheFirstInput) => {
  const cached = await cache.match(cacheKey)
  if (cached) {
    return cached
  }
  const response = await fetchFn(request)
  if (response.ok !== false && response.clone) {
    await cache.put(cacheKey, response.clone())
  }
  return response
}
