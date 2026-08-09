import { render, screen, waitFor, within } from '@testing-library/vue'
import { createPinia } from 'pinia'
import { createMemoryHistory } from 'vue-router'
import { describe, expect, test } from 'vitest'

import App from './App.vue'
import { createAppRouter } from './router'

async function renderAt(path: string) {
  const router = createAppRouter(createMemoryHistory())

  await router.push(path)
  await router.isReady()

  render(App, {
    global: {
      plugins: [createPinia(), router],
    },
  })

  return router
}

describe('app shell', () => {
  test('registers the four primary routes', () => {
    const router = createAppRouter(createMemoryHistory())
    const paths = router.getRoutes().map((route) => route.path)

    expect(paths).toEqual(expect.arrayContaining(['/', '/try', '/archive', '/me']))
  })

  test('shows the brand promise, main actions, and local data risks on home', async () => {
    await renderAt('/')

    expect(screen.getByRole('heading', { level: 1, name: '咋剪发' })).toBeTruthy()
    expect(screen.getByText('剪前看看，剪时说清，剪后记住')).toBeTruthy()
    expect(screen.getByRole('link', { name: '准备去剪' })).toBeTruthy()
    expect(screen.getByRole('link', { name: '记录这次理发' })).toBeTruthy()
    expect(screen.getByText('当前阶段不创建记录；后续记录仅保存在当前设备')).toBeTruthy()
    expect(
      screen.getByText('清理浏览器数据、使用无痕模式或更换设备，都可能让记录丢失。'),
    ).toBeTruthy()
  })

  test('keeps the four destinations visible and exposes the current route', async () => {
    await renderAt('/archive')

    const navigation = screen.getByRole('navigation', { name: '主导航' })
    const labels = ['首页', '试发型', '档案', '我的']

    for (const label of labels) {
      expect(within(navigation).getByRole('link', { name: label })).toBeTruthy()
    }

    expect(within(navigation).getByRole('link', { name: '档案' }).getAttribute('aria-current')).toBe(
      'page',
    )
    expect(navigation.querySelectorAll('[aria-current="page"]')).toHaveLength(1)
  })

  test('updates the title and moves focus to main content after client navigation', async () => {
    const router = await renderAt('/')
    const main = document.querySelector<HTMLElement>('#main-content')
    const homeLink = screen.getByRole('link', { name: '首页' })

    await waitFor(() => expect(document.title).toBe('咋剪发'))
    expect(main?.getAttribute('tabindex')).toBe('-1')

    homeLink.focus()
    expect(document.activeElement).toBe(homeLink)

    await router.push('/try')

    await waitFor(() => {
      expect(document.title).toBe('试发型｜咋剪发')
      expect(document.activeElement).toBe(main)
    })
  })

  test('labels the try-on route as a sample without promising real generation', async () => {
    await renderAt('/try')

    expect(screen.getByRole('heading', { level: 1, name: '试发型' })).toBeTruthy()
    expect(screen.getByText('示例体验')).toBeTruthy()
    expect(screen.getByText('当前阶段不调用真实 AI，也不会生成发型图。')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /生成/ })).toBeNull()
  })

  test('gives the archive route honest first-stage copy', async () => {
    await renderAt('/archive')

    expect(screen.getByRole('heading', { level: 1, name: '档案' })).toBeTruthy()
    expect(screen.getByText(/下一阶段/)).toBeTruthy()
  })

  test('gives the profile route honest first-stage copy', async () => {
    await renderAt('/me')

    expect(screen.getByRole('heading', { level: 1, name: '我的' })).toBeTruthy()
    expect(screen.getByText(/偏好与隐私设置/)).toBeTruthy()
  })

  test('shows a useful not-found page for an unknown deep link', async () => {
    await renderAt('/missing/deep-link')

    expect(screen.getByRole('heading', { level: 1, name: '页面没找到' })).toBeTruthy()
    expect(screen.getByRole('link', { name: '返回首页' }).getAttribute('href')).toBe('/')
  })
})
