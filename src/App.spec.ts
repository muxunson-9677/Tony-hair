import { fireEvent, render, screen, waitFor, within } from '@testing-library/vue'
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

    expect(paths).toEqual(expect.arrayContaining([
      '/',
      '/try',
      '/archive',
      '/archive/profile',
      '/archive/plans/new',
      '/archive/plans/:id',
      '/archive/plans/:id/edit',
      '/archive/plans/:id/poll/new',
      '/archive/records/new',
      '/archive/records/:id',
      '/archive/records/:id/edit',
      '/p/:id',
      '/polls/:id/manage',
      '/me',
    ]))
  })

  test('gives poll workspaces a wide shell without the product navigation', () => {
    const router = createAppRouter(createMemoryHistory())

    for (const path of [
      '/archive/plans/plan-1/poll/new',
      '/p/public-poll',
      '/polls/public-poll/manage',
    ]) {
      expect(router.resolve(path).meta).toMatchObject({
        hideBottomNav: true,
        wideLayout: true,
      })
    }
  })

  test('shows the brand promise, main actions, and local data risks on home', async () => {
    await renderAt('/')

    expect(screen.getByRole('heading', { level: 1, name: '咋剪发' })).toBeTruthy()
    expect(screen.getByText('剪前看看，剪时说清，剪后记住')).toBeTruthy()
    expect(screen.getByRole('link', { name: '准备去剪' })).toBeTruthy()
    expect(screen.getByRole('link', { name: '记录这次理发' }).getAttribute('href')).toBe(
      '/archive/records/new',
    )
    expect(screen.getByText('照片和记录仅保存在当前设备，不会上传或同步。')).toBeTruthy()
    expect(
      screen.getByText('清理浏览器数据、使用无痕模式或更换设备，都可能让记录丢失。'),
    ).toBeTruthy()

    const visualLink = await screen.findByRole('link', { name: '查看短发示例并进入试发型' })
    expect(visualLink.getAttribute('href')).toBe('/try')
    expect(
      within(visualLink).getByRole('img', { name: /AI 生成的虚构成年人物短发造型示例/ }),
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
    expect(screen.getByText('预先制作的合成人物素材，不会处理你的照片')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /上传|生成/ })).toBeNull()
    expect(screen.queryByRole('link', { name: /上传|生成/ })).toBeNull()
    expect(document.querySelector('input[type="file"]')).toBeNull()
  })

  test('switches the fictional adult and hairstyle details together', async () => {
    await renderAt('/try')

    const resultImage = screen.getByTestId('try-result-image')
    expect(resultImage.getAttribute('src')).toBe('/demo/persona-lin-bob.webp')
    expect(resultImage.getAttribute('alt')).toContain('林澄的齐颌短鲍伯')

    await fireEvent.click(screen.getByRole('button', { name: '选择人物：乔衡' }))
    await fireEvent.click(screen.getByRole('button', { name: '选择方案：清爽渐层' }))

    expect(resultImage.getAttribute('src')).toBe('/demo/persona-qiao-taper.webp')
    expect(resultImage.getAttribute('alt')).toContain('乔衡的清爽渐层')
    expect(screen.getByText('厚硬直发的支撑力适合做清楚的顶部纹理，缩短两侧会更利落。')).toBeTruthy()
    expect(screen.getByText('低至中：吹干后用少量哑光发泥抓出方向。')).toBeTruthy()
    expect(screen.getByText('需理发师现场确认')).toBeTruthy()
  })

  test('offers three prewritten micro-adjustments through an aria-live status', async () => {
    await renderAt('/try')

    const adjustments = screen.getAllByRole('button', { name: /微调示例：/ })
    const liveStatus = screen.getByRole('status')

    expect(adjustments).toHaveLength(3)
    expect(liveStatus.getAttribute('aria-live')).toBe('polite')

    await fireEvent.click(screen.getByRole('button', { name: '微调示例：刘海更轻' }))

    expect(liveStatus.textContent).toContain(
      '请把刘海末端做轻，保留参差感，不要剪成整齐的一条线。需理发师现场确认。',
    )
  })

  test('gives an empty archive an honest local-only starting point', async () => {
    await renderAt('/archive')

    expect(screen.getByRole('heading', { level: 1, name: '档案' })).toBeTruthy()
    expect(await screen.findByText('这台设备还没有发型档案')).toBeTruthy()
    expect(screen.getByText(/只保存在当前设备/)).toBeTruthy()
    expect(screen.getByText(/清理浏览器数据.*丢失/)).toBeTruthy()
  })

  test('offers the local privacy mask from the profile route', async () => {
    await renderAt('/me')

    expect(screen.getByRole('heading', { level: 1, name: '我的' })).toBeTruthy()
    const maskLink = screen.getByRole('link', { name: /照片遮罩/ })
    expect(maskLink.getAttribute('href')).toBe('/privacy/mask')
  })

  test('keeps the privacy mask workbench free of the fixed main navigation', async () => {
    await renderAt('/privacy/mask')

    expect(screen.getByRole('heading', { level: 1, name: /隐私\s*遮罩/ })).toBeTruthy()
    expect(screen.queryByRole('navigation', { name: '主导航' })).toBeNull()
    expect(document.querySelector('#main-content')?.classList).toContain('app-main--without-nav')
  })

  test('shows a useful not-found page for an unknown deep link', async () => {
    await renderAt('/missing/deep-link')

    expect(screen.getByRole('heading', { level: 1, name: '页面没找到' })).toBeTruthy()
    expect(screen.getByRole('link', { name: '返回首页' }).getAttribute('href')).toBe('/')
  })
})
