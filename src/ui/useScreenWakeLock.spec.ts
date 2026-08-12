import { defineComponent, h, nextTick } from 'vue'
import { render } from '@testing-library/vue'
import { describe, expect, it, vi } from 'vitest'

import { useScreenWakeLock, type WakeLockApi, type WakeLockHandle } from './useScreenWakeLock'

const createWakeLockApi = () => {
  const sentinels: { released: boolean }[] = []
  const api: WakeLockApi = {
    request: vi.fn(async () => {
      const sentinel = { released: false }
      sentinels.push(sentinel)
      const handle: WakeLockHandle = {
        release: async () => {
          sentinel.released = true
        },
      }
      return handle
    }),
  }
  return { api, sentinels }
}

const mountWakeLock = (options: Parameters<typeof useScreenWakeLock>[0]) => {
  let controller!: ReturnType<typeof useScreenWakeLock>
  const utils = render(defineComponent({
    setup() {
      controller = useScreenWakeLock(options)
      return () => h('div')
    },
  }))
  return { controller, ...utils }
}

const flush = async () => {
  await nextTick()
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('useScreenWakeLock', () => {
  it('reports unsupported and stays inactive when the API is missing', async () => {
    const { controller } = mountWakeLock({ auto: true, wakeLockApi: undefined })
    await flush()
    expect(controller.supported).toBe(false)
    expect(controller.active.value).toBe(false)
  })

  it('requests the lock automatically on mount and releases it on unmount', async () => {
    const { api, sentinels } = createWakeLockApi()
    const { controller, unmount } = mountWakeLock({ auto: true, wakeLockApi: api })
    await flush()
    expect(controller.supported).toBe(true)
    expect(controller.active.value).toBe(true)
    expect(api.request).toHaveBeenCalledWith('screen')

    unmount()
    await flush()
    expect(sentinels[0]?.released).toBe(true)
  })

  it('re-acquires the lock when the page becomes visible again', async () => {
    const { api } = createWakeLockApi()
    const { controller } = mountWakeLock({ auto: true, wakeLockApi: api })
    await flush()
    expect(api.request).toHaveBeenCalledTimes(1)

    controller.active.value = false
    document.dispatchEvent(new Event('visibilitychange'))
    await flush()
    expect(api.request).toHaveBeenCalledTimes(2)
    expect(controller.active.value).toBe(true)
  })

  it('degrades to inactive when the request is rejected', async () => {
    const api: WakeLockApi = {
      request: vi.fn(async () => {
        throw new DOMException('denied', 'NotAllowedError')
      }),
    }
    const { controller } = mountWakeLock({ auto: true, wakeLockApi: api })
    await flush()
    expect(controller.supported).toBe(true)
    expect(controller.active.value).toBe(false)
  })

  it('supports manual toggle without auto mode', async () => {
    const { api, sentinels } = createWakeLockApi()
    const { controller } = mountWakeLock({ auto: false, wakeLockApi: api })
    await flush()
    expect(controller.active.value).toBe(false)

    await controller.toggle()
    expect(controller.active.value).toBe(true)

    await controller.toggle()
    expect(controller.active.value).toBe(false)
    expect(sentinels[0]?.released).toBe(true)
  })
})
