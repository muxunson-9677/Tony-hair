// 离线就绪探测：逐项验证真实缓存状态，宁可少报也不虚报。

export type OfflineReadinessState = 'ready' | 'preparing' | 'unsupported'

export const isWeChatBrowser = (userAgent: string) => /MicroMessenger/i.test(userAgent)

interface ServiceWorkerContainerLike {
  getRegistration: () => Promise<{ active: unknown } | undefined>
}

interface CacheStorageLike {
  match: (key: string) => Promise<unknown>
}

export interface OfflineReadinessEnvironment {
  readonly serviceWorkerContainer?: ServiceWorkerContainerLike
  readonly cacheStorage?: CacheStorageLike
  readonly shellUrls: readonly string[]
  readonly timeoutMs?: number
}

const DEFAULT_PROBE_TIMEOUT_MS = 1500

const withTimeout = async <Value>(work: Promise<Value>, timeoutMs: number): Promise<Value> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('offline readiness probe timed out')), timeoutMs)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

export const probeOfflineReadiness = async (
  environment: OfflineReadinessEnvironment,
): Promise<OfflineReadinessState> => {
  const { serviceWorkerContainer, cacheStorage, shellUrls } = environment
  if (!serviceWorkerContainer || !cacheStorage) {
    return 'unsupported'
  }
  const timeoutMs = environment.timeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS
  try {
    return await withTimeout((async () => {
      const registration = await serviceWorkerContainer.getRegistration()
      if (!registration?.active) {
        return 'preparing' as const
      }
      for (const url of shellUrls) {
        if (!(await cacheStorage.match(url))) {
          return 'preparing' as const
        }
      }
      return 'ready' as const
    })(), timeoutMs)
  } catch {
    return 'preparing'
  }
}

export interface OfflineReadinessMessage {
  readonly tone: 'ready' | 'pending' | 'warning'
  readonly text: string
}

export const describeOfflineReadiness = (
  state: OfflineReadinessState,
  weChat: boolean,
): OfflineReadinessMessage => {
  if (weChat) {
    return { tone: 'warning', text: '微信内浏览器离线不可靠，请先导出 PNG 存进相册' }
  }
  if (state === 'ready') {
    return { tone: 'ready', text: '✓ 已准备好，到店断网也能打开' }
  }
  if (state === 'unsupported') {
    return { tone: 'warning', text: '这个浏览器不支持离线缓存，建议导出 PNG 备用' }
  }
  return { tone: 'pending', text: '离线缓存正在准备，联网刷新一次后就绪' }
}

// 浏览器环境取样：返回当前页面外壳需要命中的缓存 URL。
export const collectShellUrls = (documentRef: Document): string[] => {
  const urls = ['/']
  const script = documentRef.querySelector<HTMLScriptElement>('script[type="module"][src]')
  if (script?.src) {
    try {
      urls.push(new URL(script.src, documentRef.baseURI).pathname)
    } catch {
      // 无法解析时只校验外壳首页。
    }
  }
  return urls
}
