/// <reference lib="webworker" />
// Tony宝 应用外壳 Service Worker。策略逻辑在 swCore.ts（可单测），这里只接事件。

import {
  CACHE_NAME,
  classifyRequest,
  cleanupStaleCaches,
  respondCacheFirst,
  respondNavigation,
} from './swCore'

declare const self: ServiceWorkerGlobalScope

// 构建时由 vite 插件把 '__PRECACHE_MANIFEST_JSON__' 原样替换成 JSON 数组字符串。
const readPrecacheManifest = (): string[] => {
  try {
    const parsed: unknown = JSON.parse('__PRECACHE_MANIFEST_JSON__')
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

const PRECACHE_URLS = ['/', ...readPrecacheManifest()]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)),
  )
  // 刻意不 skipWaiting：新版本「下次打开生效」，绝不打断现场使用。
})

self.addEventListener('activate', (event) => {
  event.waitUntil(cleanupStaleCaches(caches))
  // 刻意不 clients.claim：已打开的旧页面继续用旧缓存直到下次导航。
})

self.addEventListener('fetch', (event) => {
  const strategy = classifyRequest(event.request, self.location.origin)
  if (strategy === 'passthrough') {
    return
  }
  if (strategy === 'navigation') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME)
      return await respondNavigation({ fetchFn: fetch, cache, request: event.request }) as Response
    })())
    return
  }
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME)
    const cacheKey = new URL(event.request.url).pathname
    return await respondCacheFirst({ fetchFn: fetch, cache, request: event.request, cacheKey }) as Response
  })())
})
