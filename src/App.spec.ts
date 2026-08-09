import { render, screen, within } from '@testing-library/vue'
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

  test('shows the brand promise, two main actions, and local-only notice on home', async () => {
    await renderAt('/')

    expect(screen.getByRole('heading', { level: 1, name: '咋剪发' })).toBeTruthy()
    expect(screen.getByText('剪前看看，剪时说清，剪后记住')).toBeTruthy()
    expect(screen.getByRole('link', { name: '准备去剪' })).toBeTruthy()
    expect(screen.getByRole('link', { name: '记录这次理发' })).toBeTruthy()
    expect(screen.getByText('仅保存在当前设备')).toBeTruthy()
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
})
