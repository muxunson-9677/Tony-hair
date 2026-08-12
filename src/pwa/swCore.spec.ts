import { describe, expect, it, vi } from 'vitest'

import {
  CACHE_NAME,
  CACHE_PREFIX,
  CACHE_VERSION,
  classifyRequest,
  cleanupStaleCaches,
  respondCacheFirst,
  respondNavigation,
} from './swCore'

const ORIGIN = 'https://tonybao.local'

const request = (path: string, overrides: { method?: string, mode?: RequestMode, origin?: string } = {}) => ({
  method: overrides.method ?? 'GET',
  mode: overrides.mode ?? 'no-cors',
  url: `${overrides.origin ?? ORIGIN}${path}`,
})

interface StoredResponse {
  readonly body: string
}

const createCache = (initial: Record<string, StoredResponse> = {}) => {
  const entries = new Map<string, StoredResponse>(Object.entries(initial))
  return {
    entries,
    match: vi.fn(async (key: string) => entries.get(key)),
    put: vi.fn(async (key: string, value: StoredResponse) => {
      entries.set(key, value)
    }),
  }
}

describe('cache versioning', () => {
  it('derives the cache name from prefix and version', () => {
    expect(CACHE_NAME).toBe(`${CACHE_PREFIX}-${CACHE_VERSION}`)
  })

  it('deletes only stale caches from the same prefix on activate', async () => {
    const deleted: string[] = []
    const cacheStorage = {
      keys: async () => [
        `${CACHE_PREFIX}-v0`,
        CACHE_NAME,
        `${CACHE_PREFIX}-v99`,
        'someone-elses-cache',
      ],
      delete: async (name: string) => {
        deleted.push(name)
        return true
      },
    }
    await cleanupStaleCaches(cacheStorage)
    expect(deleted).toEqual([`${CACHE_PREFIX}-v0`, `${CACHE_PREFIX}-v99`])
  })
})

describe('classifyRequest', () => {
  it('routes navigations to the navigation strategy', () => {
    expect(classifyRequest(request('/archive/plans/p1/brief/show', { mode: 'navigate' }), ORIGIN)).toBe('navigation')
  })

  it('serves built assets, brand, demo images, and the manifest cache-first', () => {
    expect(classifyRequest(request('/assets/index-abc123.js'), ORIGIN)).toBe('cache-first')
    expect(classifyRequest(request('/assets/index-abc123.css'), ORIGIN)).toBe('cache-first')
    expect(classifyRequest(request('/brand/zajianfa-scissors-512.png'), ORIGIN)).toBe('cache-first')
    expect(classifyRequest(request('/demo/persona-lin-base.webp'), ORIGIN)).toBe('cache-first')
    expect(classifyRequest(request('/manifest.webmanifest'), ORIGIN)).toBe('cache-first')
  })

  it('passes through mediapipe assets, cross-origin requests, and non-GET requests', () => {
    expect(classifyRequest(request('/mediapipe/1.0.1/wasm/vision_wasm_internal.wasm'), ORIGIN)).toBe('passthrough')
    expect(classifyRequest(request('/mediapipe/models/face-landmarker-float16-v1.task'), ORIGIN)).toBe('passthrough')
    expect(classifyRequest(request('/assets/index-abc.js', { origin: 'https://evil.example' }), ORIGIN)).toBe('passthrough')
    expect(classifyRequest(request('/assets/index-abc.js', { method: 'POST' }), ORIGIN)).toBe('passthrough')
    expect(classifyRequest(request('/api/polls'), ORIGIN)).toBe('passthrough')
  })
})

describe('respondNavigation', () => {
  it('prefers the network and refreshes the cached shell', async () => {
    const cache = createCache({ '/': { body: 'stale shell' } })
    const fresh = { body: 'fresh shell', clone: () => ({ body: 'fresh shell' }) }
    const response = await respondNavigation({
      fetchFn: async () => fresh,
      cache,
      request: request('/archive', { mode: 'navigate' }),
    })
    expect(response).toBe(fresh)
    expect(cache.put).toHaveBeenCalledWith('/', { body: 'fresh shell' })
  })

  it('falls back to the cached shell when the network is down', async () => {
    const cache = createCache({ '/': { body: 'cached shell' } })
    const response = await respondNavigation({
      fetchFn: async () => {
        throw new TypeError('offline')
      },
      cache,
      request: request('/archive/plans/p1/brief/show', { mode: 'navigate' }),
    })
    expect(response).toEqual({ body: 'cached shell' })
  })

  it('rethrows offline errors when no shell is cached yet', async () => {
    const cache = createCache()
    await expect(respondNavigation({
      fetchFn: async () => {
        throw new TypeError('offline')
      },
      cache,
      request: request('/', { mode: 'navigate' }),
    })).rejects.toThrow('offline')
  })
})

describe('respondCacheFirst', () => {
  it('serves from the cache without touching the network', async () => {
    const cached = { body: 'cached asset' }
    const cache = createCache({ '/assets/index-abc.js': cached })
    const fetchFn = vi.fn()
    const response = await respondCacheFirst({
      fetchFn,
      cache,
      request: request('/assets/index-abc.js'),
      cacheKey: '/assets/index-abc.js',
    })
    expect(response).toBe(cached)
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('fetches once on a miss and fills the cache for next time', async () => {
    const cache = createCache()
    const fresh = { body: 'network asset', ok: true, clone: () => ({ body: 'network asset' }) }
    const response = await respondCacheFirst({
      fetchFn: async () => fresh,
      cache,
      request: request('/brand/zajianfa-scissors-512.png'),
      cacheKey: '/brand/zajianfa-scissors-512.png',
    })
    expect(response).toBe(fresh)
    expect(cache.entries.get('/brand/zajianfa-scissors-512.png')).toEqual({ body: 'network asset' })
  })

  it('does not cache failed responses', async () => {
    const cache = createCache()
    const missing = { body: 'not found', ok: false, clone: () => ({ body: 'not found' }) }
    const response = await respondCacheFirst({
      fetchFn: async () => missing,
      cache,
      request: request('/assets/gone.js'),
      cacheKey: '/assets/gone.js',
    })
    expect(response).toBe(missing)
    expect(cache.entries.size).toBe(0)
  })
})
