import { fireEvent, render, screen, waitFor, within } from '@testing-library/vue'
import { createPinia } from 'pinia'
import { createMemoryHistory } from 'vue-router'
import { afterEach, describe, expect, test, vi } from 'vitest'

import App from './App.vue'
import { createAppRouter } from './router'

afterEach(() => vi.unstubAllGlobals())

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
  test('registers product routes without the retired public-poll surface', () => {
    const router = createAppRouter(createMemoryHistory())
    const paths = router.getRoutes().map((route) => route.path)

    expect(paths).toEqual(expect.arrayContaining([
      '/',
      '/try',
      '/styles',
      '/styles/favorites',
      '/styles/catalog/:id',
      '/archive',
      '/archive/profile',
      '/archive/plans/new',
      '/archive/plans/:id',
      '/archive/plans/:id/edit',
      '/archive/records/new',
      '/archive/records/:id',
      '/archive/records/:id/edit',
      '/me',
    ]))
    expect(paths).not.toEqual(expect.arrayContaining([
      '/archive/plans/:id/poll/new',
      '/p/:id',
      '/polls/:id/manage',
    ]))
  })

  test.each([
    '/archive/plans/plan-1/poll/new',
    '/p/public-poll',
    '/polls/public-poll/manage',
  ])('renders the product unavailable state for retired poll URL %s', async (path) => {
    const router = await renderAt(path)

    expect(router.currentRoute.value.name).toBe('not-found')
    expect(screen.getByRole('heading', { level: 1, name: '页面没找到' })).toBeTruthy()
    expect(screen.queryByText(/好友投票|投票结果|发起好友投票/)).toBeNull()
  })

  test('resolves every retired poll URL through the catch-all route', () => {
    const router = createAppRouter(createMemoryHistory())
    for (const path of [
      '/archive/plans/plan-1/poll/new',
      '/p/public-poll',
      '/polls/public-poll/manage',
    ]) {
      expect(router.resolve(path).name).toBe('not-found')
    }
  })

  test('shows the decorative scissors beside the visible brand and one stateful main action', async () => {
    await renderAt('/')

    expect(document.querySelector('.app-shell')?.getAttribute('data-visual-system'))
      .toBe('apple-light')

    const lockup = screen.getByTestId('brand-lockup')
    const logo = lockup.querySelector<HTMLImageElement>('img[alt=""]')
    expect(logo?.getAttribute('src')).toBe('/brand/zajianfa-scissors-512.png')
    expect(screen.getByRole('heading', { level: 1, name: 'Tony宝' })).toBeTruthy()
    expect(screen.getByText('剪前帮你定，剪时替你说，剪后帮你记')).toBeTruthy()
    expect((await screen.findByRole('link', { name: '先认识一下我的头发' })).getAttribute('href'))
      .toBe('/archive/profile')
    expect(screen.getAllByTestId('home-primary-action')).toHaveLength(1)
    expect(screen.getByText('一张正面照，加上你确定的几件事就够了。')).toBeTruthy()
    expect(screen.queryByText('不是替你追热点，而是把发质、维护和理发要求放到同一页里。'))
      .toBeNull()
    expect(screen.getByText('照片和记录仅保存在当前设备，不会上传或同步。')).toBeTruthy()
    expect(
      screen.getByText('清理浏览器数据、使用无痕模式或更换设备，都可能让记录丢失。'),
    ).toBeTruthy()

    expect(screen.queryByRole('link', { name: '查看发型：柔和侧分' })).toBeNull()
    expect(screen.queryByRole('img', { name: /AI 生成的虚构成年人物短发造型示例/ }))
      .toBeNull()
  })

  test('keeps the four destinations visible and exposes the current route', async () => {
    const router = await renderAt('/archive')

    const navigation = screen.getByRole('navigation', { name: '主导航' })
    const labels = ['首页', '找发型', '档案', '我的']

    for (const label of labels) {
      expect(within(navigation).getByRole('link', { name: label })).toBeTruthy()
    }

    expect(navigation.querySelectorAll('[data-nav-icon]')).toHaveLength(4)
    expect(navigation.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(4)
    for (const index of ['01', '02', '03', '04']) {
      expect(within(navigation).queryByText(index)).toBeNull()
    }

    expect(within(navigation).getByRole('link', { name: '档案' }).getAttribute('aria-current')).toBe(
      'page',
    )
    expect(navigation.querySelectorAll('[aria-current="page"]')).toHaveLength(1)

    await router.push('/')
    await waitFor(() => {
      expect(within(navigation).getByRole('link', { name: '首页' }).getAttribute('aria-current'))
        .toBe('page')
    })
    expect(navigation.querySelectorAll('[aria-current="page"]')).toHaveLength(1)
  })

  test('presents my tools as colorful tactile actions instead of numbered rows', async () => {
    await renderAt('/me')

    const tools = screen.getByRole('navigation', { name: '我的工具' })
    expect(tools.querySelectorAll('[data-tool-icon]')).toHaveLength(3)
    expect(tools.querySelectorAll('[data-tactile]')).toHaveLength(3)
    for (const index of ['01', '02', '03']) {
      expect(within(tools).queryByText(index)).toBeNull()
    }
  })

  test('places the desktop navigation before main content in DOM and keyboard order', async () => {
    const mediaQuery = {
      matches: true,
      media: '(min-width: 900px)',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(() => true),
    } satisfies MediaQueryList
    vi.stubGlobal('matchMedia', vi.fn(() => mediaQuery))

    await renderAt('/')

    const navigation = screen.getByRole('navigation', { name: '主导航' })
    const main = document.querySelector('#main-content')
    expect(screen.getAllByRole('navigation', { name: '主导航' })).toHaveLength(1)
    expect(navigation.classList).toContain('bottom-nav--desktop')
    expect(navigation.compareDocumentPosition(main!) & Node.DOCUMENT_POSITION_FOLLOWING)
      .not.toBe(0)
  })

  test('updates the title and moves focus to main content after client navigation', async () => {
    const router = await renderAt('/')
    const main = document.querySelector<HTMLElement>('#main-content')
    const homeLink = screen.getByRole('link', { name: '首页' })

    await waitFor(() => expect(document.title).toBe('Tony宝'))
    expect(main?.getAttribute('tabindex')).toBe('-1')

    homeLink.focus()
    expect(document.activeElement).toBe(homeLink)

    await router.push('/styles')

    await waitFor(() => {
      expect(document.title).toBe('找发型｜Tony宝')
      expect(document.activeElement).toBe(main)
    })
  })

  test('labels the try-on route as a sample without promising real generation', async () => {
    await renderAt('/try')

    expect(screen.getByRole('heading', { level: 1, name: '示例方向对比' })).toBeTruthy()
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

  test('keeps My compact and actionable without accounts, commerce or social features', async () => {
    await renderAt('/me')

    expect(screen.getByRole('heading', { level: 1, name: '我的' })).toBeTruthy()
    expect(screen.getByRole('link', { name: /头发档案/ }).getAttribute('href'))
      .toBe('/archive/profile')
    expect(screen.getByRole('link', { name: /理发档案/ }).getAttribute('href')).toBe('/archive')
    const maskLink = screen.getByRole('link', { name: /照片遮罩/ })
    expect(maskLink.getAttribute('href')).toBe('/privacy/mask')
    expect(screen.getByText(/仅保存在当前设备/)).toBeTruthy()
    expect(screen.queryByText(/会员|订单|积分|社区|发帖|评论/)).toBeNull()
  })

  test('keeps the privacy mask workbench free of the fixed main navigation', async () => {
    await renderAt('/privacy/mask')

    expect(screen.getByRole('heading', { level: 1, name: /隐私\s*遮罩/ })).toBeTruthy()
    expect(screen.queryByRole('navigation', { name: '主导航' })).toBeNull()
    expect(document.querySelector('#main-content')?.classList).toContain('app-main--without-nav')
  })

  test.each([
    '/archive/profile',
    '/archive/plans/new',
    '/archive/plans/missing',
    '/archive/records/new',
    '/archive/records/missing',
    '/archive/plans/missing/brief',
  ])('keeps the immersive task at %s free of the fixed main navigation', async (path) => {
    await renderAt(path)

    expect(screen.queryByRole('navigation', { name: '主导航' })).toBeNull()
    expect(document.querySelector('#main-content')?.classList).toContain('app-main--without-nav')
  })

  test('shows a useful not-found page for an unknown deep link', async () => {
    await renderAt('/missing/deep-link')

    expect(screen.getByRole('heading', { level: 1, name: '页面没找到' })).toBeTruthy()
    expect(screen.getByRole('link', { name: '返回首页' }).getAttribute('href')).toBe('/')
  })
})
