import { describe, expect, it } from 'vitest'

import {
  describeOfflineReadiness,
  isWeChatBrowser,
  probeOfflineReadiness,
  type OfflineReadinessState,
} from './offlineReadiness'

const WECHAT_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 MicroMessenger/8.0.49'
const CHROME_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36'

const readyEnvironment = () => ({
  serviceWorkerContainer: {
    getRegistration: async () => ({ active: { state: 'activated' } }),
  },
  cacheStorage: {
    match: async (key: string) => (key === '/' || key === '/assets/main-abc.js' ? { ok: true } : undefined),
  },
  shellUrls: ['/', '/assets/main-abc.js'],
})

describe('isWeChatBrowser', () => {
  it('detects the WeChat built-in browser from its UA marker', () => {
    expect(isWeChatBrowser(WECHAT_UA)).toBe(true)
    expect(isWeChatBrowser(CHROME_UA)).toBe(false)
    expect(isWeChatBrowser('')).toBe(false)
  })
})

describe('probeOfflineReadiness', () => {
  it('reports unsupported when service workers or cache storage are missing', async () => {
    expect(await probeOfflineReadiness({ ...readyEnvironment(), serviceWorkerContainer: undefined })).toBe('unsupported')
    expect(await probeOfflineReadiness({ ...readyEnvironment(), cacheStorage: undefined })).toBe('unsupported')
  })

  it('reports preparing while no service worker is active yet', async () => {
    expect(await probeOfflineReadiness({
      ...readyEnvironment(),
      serviceWorkerContainer: { getRegistration: async () => undefined },
    })).toBe('preparing')
    expect(await probeOfflineReadiness({
      ...readyEnvironment(),
      serviceWorkerContainer: { getRegistration: async () => ({ active: null }) },
    })).toBe('preparing')
  })

  it('reports preparing when any shell URL is missing from the cache', async () => {
    expect(await probeOfflineReadiness({
      ...readyEnvironment(),
      cacheStorage: { match: async (key: string) => (key === '/' ? { ok: true } : undefined) },
    })).toBe('preparing')
  })

  it('reports ready only when the worker is active and every shell URL is cached', async () => {
    expect(await probeOfflineReadiness(readyEnvironment())).toBe('ready')
  })

  it('treats a hanging probe as preparing instead of overclaiming', async () => {
    const state = await probeOfflineReadiness({
      ...readyEnvironment(),
      cacheStorage: { match: () => new Promise(() => {}) },
      timeoutMs: 20,
    })
    expect(state).toBe('preparing')
  })

  it('treats probe errors as preparing', async () => {
    expect(await probeOfflineReadiness({
      ...readyEnvironment(),
      serviceWorkerContainer: {
        getRegistration: async () => {
          throw new Error('security error')
        },
      },
    })).toBe('preparing')
  })
})

describe('describeOfflineReadiness', () => {
  const messages: Record<OfflineReadinessState | 'wechat', string> = {
    ready: '✓ 已准备好，到店断网也能打开',
    preparing: '离线缓存正在准备，联网刷新一次后就绪',
    unsupported: '这个浏览器不支持离线缓存，建议导出 PNG 备用',
    wechat: '微信内浏览器离线不可靠，请先导出 PNG 存进相册',
  }

  it('lets the WeChat warning win over every probe state', () => {
    expect(describeOfflineReadiness('ready', true)).toEqual({ tone: 'warning', text: messages.wechat })
    expect(describeOfflineReadiness('unsupported', true)).toEqual({ tone: 'warning', text: messages.wechat })
  })

  it('maps probe states to honest copy', () => {
    expect(describeOfflineReadiness('ready', false)).toEqual({ tone: 'ready', text: messages.ready })
    expect(describeOfflineReadiness('preparing', false)).toEqual({ tone: 'pending', text: messages.preparing })
    expect(describeOfflineReadiness('unsupported', false)).toEqual({ tone: 'warning', text: messages.unsupported })
  })
})
