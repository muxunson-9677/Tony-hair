import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'

// 屏幕常亮组合式函数：现场页 auto 模式自动申请并在回到前台时重申请；
// 发型展示页沿用手动 toggle。申请失败一律降级为不激活，不抛错。

export interface WakeLockHandle {
  release: () => Promise<void>
}

export interface WakeLockApi {
  request: (type: 'screen') => Promise<WakeLockHandle>
}

export interface UseScreenWakeLockOptions {
  readonly auto?: boolean
  /** 测试注入口；缺省读取 navigator.wakeLock。显式传 undefined 表示不支持。 */
  readonly wakeLockApi?: WakeLockApi
}

export interface ScreenWakeLockController {
  readonly supported: boolean
  readonly active: Ref<boolean>
  request: () => Promise<void>
  release: () => Promise<void>
  toggle: () => Promise<void>
}

const resolveWakeLockApi = (options?: UseScreenWakeLockOptions): WakeLockApi | undefined => {
  if (options && 'wakeLockApi' in options) {
    return options.wakeLockApi
  }
  return (navigator as Navigator & { wakeLock?: WakeLockApi }).wakeLock
}

export const useScreenWakeLock = (options?: UseScreenWakeLockOptions): ScreenWakeLockController => {
  const api = resolveWakeLockApi(options)
  const supported = Boolean(api)
  const active = ref(false)
  let handle: WakeLockHandle | null = null

  const release = async () => {
    const current = handle
    handle = null
    active.value = false
    if (current) {
      try {
        await current.release()
      } catch {
        // 释放失败无需处理：锁随页面销毁自动失效。
      }
    }
  }

  const request = async () => {
    if (!api || handle) {
      return
    }
    try {
      handle = await api.request('screen')
      active.value = true
    } catch {
      handle = null
      active.value = false
    }
  }

  const toggle = async () => {
    if (handle) {
      await release()
    } else {
      await request()
    }
  }

  const onVisibilityChange = () => {
    if (options?.auto && document.visibilityState !== 'hidden') {
      // 系统在页面退到后台时会自动释放锁，回前台需要重新申请。
      handle = null
      void request()
    }
  }

  onMounted(() => {
    document.addEventListener('visibilitychange', onVisibilityChange)
    if (options?.auto) {
      void request()
    }
  })

  onBeforeUnmount(() => {
    document.removeEventListener('visibilitychange', onVisibilityChange)
    void release()
  })

  return { supported, active, request, release, toggle }
}
