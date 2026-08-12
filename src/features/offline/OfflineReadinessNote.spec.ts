import { render, waitFor } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'

import OfflineReadinessNote from './OfflineReadinessNote.vue'

const CHROME_UA = 'Mozilla/5.0 (Linux; Android 14) Chrome/126.0 Mobile Safari/537.36'
const WECHAT_UA = 'Mozilla/5.0 (iPhone) MicroMessenger/8.0.49'

describe('OfflineReadinessNote', () => {
  it('claims readiness only when the probe says ready', async () => {
    const { getByTestId } = render(OfflineReadinessNote, {
      props: { probeState: 'ready', userAgent: CHROME_UA },
    })
    await waitFor(() => {
      expect(getByTestId('offline-readiness').textContent).toContain('已准备好，到店断网也能打开')
    })
  })

  it('warns WeChat users to export a PNG even when the cache is ready', async () => {
    const { getByTestId } = render(OfflineReadinessNote, {
      props: { probeState: 'ready', userAgent: WECHAT_UA },
    })
    await waitFor(() => {
      expect(getByTestId('offline-readiness').textContent).toContain('微信内浏览器离线不可靠，请先导出 PNG 存进相册')
    })
  })

  it('is honest about unsupported environments (jsdom has no service worker)', async () => {
    const { getByTestId } = render(OfflineReadinessNote, {
      props: { userAgent: CHROME_UA },
    })
    await waitFor(() => {
      expect(getByTestId('offline-readiness').textContent).toContain('这个浏览器不支持离线缓存，建议导出 PNG 备用')
    })
  })
})
