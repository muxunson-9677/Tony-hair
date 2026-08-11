/// <reference lib="dom" />

import { stat } from 'node:fs/promises'

import { expect, test, type BrowserContext, type Page, type TestInfo } from '@playwright/test'

const TEST_DB_SESSION_KEY = '__zajianfa_e2e_archive_db__'
const PRIVATE_SOURCE_MARKER = 'HAIRSTYLE_LIBRARY_PRIVATE_SOURCE_MARKER'
const PRIVATE_SOURCE_FILENAME = '私人原图-不应保存.jpg'
const databaseNames = new Map<string, string>()

type CapturedRequest = {
  readonly url: string
  readonly method: string
  readonly body: Buffer | null
  readonly headers: Readonly<Record<string, string>>
}

type CapturedTraffic = {
  readonly requests: CapturedRequest[]
  readonly webSockets: string[]
}

const pixelContrastRatio = (
  foreground: readonly number[],
  background: readonly number[],
) => {
  const luminance = (rgb: readonly number[]) => {
    const [r, g, b] = rgb.map((value) => {
      const normalized = value / 255
      return normalized <= 0.04045
        ? normalized / 12.92
        : ((normalized + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const foregroundLuminance = luminance(foreground)
  const backgroundLuminance = luminance(background)
  return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05)
    / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
}

const createOrientationSixJpeg = async (page: Page) => {
  const jpegBytes = await page.evaluate(async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 80
    canvas.height = 40
    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error('Fixture canvas unavailable')
    }
    context.fillStyle = '#ef1f1f'
    context.fillRect(0, 0, 40, 40)
    context.fillStyle = '#1f3fef'
    context.fillRect(40, 0, 40, 40)
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
      (value) => value ? resolve(value) : reject(new Error('Fixture encode failed')),
      'image/jpeg',
      0.95,
    ))
    return [...new Uint8Array(await blob.arrayBuffer())]
  })
  const jpeg = Buffer.from(jpegBytes)
  const exifPayload = Buffer.from([
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08,
    0x00, 0x01,
    0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01,
    0x00, 0x06, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
  ])
  const app1 = Buffer.alloc(exifPayload.length + 4)
  app1[0] = 0xff
  app1[1] = 0xe1
  app1.writeUInt16BE(exifPayload.length + 2, 2)
  exifPayload.copy(app1, 4)
  const privateBytes = Buffer.from(PRIVATE_SOURCE_MARKER, 'utf8')
  const comment = Buffer.alloc(privateBytes.length + 4)
  comment[0] = 0xff
  comment[1] = 0xfe
  comment.writeUInt16BE(privateBytes.length + 2, 2)
  privateBytes.copy(comment, 4)
  return Buffer.concat([jpeg.subarray(0, 2), app1, comment, jpeg.subarray(2)])
}

const settlePage = async (page: Page) => {
  await expect(page.locator(
    '.route-enter-active, .route-enter-from, .route-leave-active, .route-leave-to',
  )).toHaveCount(0)
  await page.evaluate(async () => {
    await document.fonts.ready
    await Promise.all([...document.images].map(async (image) => {
      if (!image.complete) {
        await new Promise<void>((resolve) => {
          image.addEventListener('load', () => resolve(), { once: true })
          image.addEventListener('error', () => resolve(), { once: true })
        })
      }
      await image.decode().catch(() => undefined)
    }))
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  })
}

const captureSettled = async (
  page: Page,
  testInfo: TestInfo,
  filename: string,
  viewport: { readonly width: number, readonly height: number },
) => {
  await page.setViewportSize(viewport)
  await page.evaluate(() => window.scrollTo(0, 0))
  await settlePage(page)
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath(filename), fullPage: true })
}

const assertResponsiveLayout = async (page: Page) => {
  for (const viewport of [
    { width: 360, height: 800 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
    { width: 1280, height: 900 },
  ]) {
    await page.setViewportSize(viewport)
    await settlePage(page)
    const layout = await page.evaluate(() => {
      const targets = [...document.querySelectorAll<HTMLElement>(
        'a, button, input:not([type="hidden"]), select, textarea',
      )]
        .map((element) => {
          const rect = (
            element instanceof HTMLInputElement
            && ['checkbox', 'radio', 'file'].includes(element.type)
            && element.closest('label')
          )
            ? element.closest('label')!.getBoundingClientRect()
            : element.getBoundingClientRect()
          return {
            label: element.getAttribute('aria-label')
              ?? element.textContent?.trim()
              ?? element.getAttribute('name')
              ?? '',
            width: rect.width,
            height: rect.height,
          }
        })
        .filter(({ width, height }) => width > 0 && height > 0)
      return {
        overflow: document.documentElement.scrollWidth > innerWidth,
        minimumHeightTarget: [...targets].sort((left, right) => left.height - right.height)[0],
        minimumWidthTarget: [...targets].sort((left, right) => left.width - right.width)[0],
      }
    })
    expect(layout.overflow, `${viewport.width}px horizontal overflow`).toBe(false)
    expect(
      Math.round(layout.minimumHeightTarget?.height ?? 0),
      `${viewport.width}px: ${layout.minimumHeightTarget?.label ?? 'missing target'}`,
    ).toBeGreaterThanOrEqual(44)
    expect(
      Math.round(layout.minimumWidthTarget?.width ?? 0),
      `${viewport.width}px: ${layout.minimumWidthTarget?.label ?? 'missing target'}`,
    ).toBeGreaterThanOrEqual(44)
  }
}

const captureRequests = (page: Page) => {
  const traffic: CapturedTraffic = { requests: [], webSockets: [] }
  page.on('request', (request) => traffic.requests.push({
    url: request.url(),
    method: request.method(),
    body: request.postDataBuffer(),
    headers: request.headers(),
  }))
  page.on('websocket', (socket) => traffic.webSockets.push(socket.url()))
  return traffic
}

const expectLocalOnly = (
  traffic: CapturedTraffic,
  origin: string,
  privateNeedles: readonly Buffer[] = [],
) => {
  const { requests, webSockets } = traffic
  const external = requests.filter(({ url }) => {
    const parsed = new URL(url)
    return ['http:', 'https:'].includes(parsed.protocol) && parsed.origin !== origin
  })
  expect(external).toEqual([])
  expect(requests.filter(({ url }) => new URL(url).pathname.startsWith('/api/'))).toEqual([])
  expect(requests.filter(({ method }) => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method))).toEqual([])
  expect(webSockets).toEqual([])
  for (const needle of privateNeedles) {
    const encodedNeedle = Buffer.from(needle.toString('base64'))
    expect(requests.some(({ url, headers, body }) => {
      const metadata = Buffer.from(`${decodeURIComponent(url)}\n${JSON.stringify(headers)}`)
      return body?.includes(needle)
        || body?.includes(encodedNeedle)
        || metadata.includes(needle)
        || metadata.includes(encodedNeedle)
    })).toBe(false)
  }
}

const contrastRatio = async (page: Page, selector: string) => page.locator(selector).evaluate((element) => {
  const parseColor = (value: string) => {
    const parts = value.match(/[\d.]+/gu)?.map(Number) ?? []
    return { r: parts[0] ?? 0, g: parts[1] ?? 0, b: parts[2] ?? 0, a: parts[3] ?? 1 }
  }
  const foreground = parseColor(getComputedStyle(element).color)
  let background = { r: 0, g: 0, b: 0, a: 0 }
  for (let current: Element | null = element; current; current = current.parentElement) {
    const behind = parseColor(getComputedStyle(current).backgroundColor)
    background = {
      r: background.r + behind.r * behind.a * (1 - background.a),
      g: background.g + behind.g * behind.a * (1 - background.a),
      b: background.b + behind.b * behind.a * (1 - background.a),
      a: background.a + behind.a * (1 - background.a),
    }
    if (background.a >= 0.999) break
  }
  if (background.a < 1) {
    background = {
      r: background.r + 255 * (1 - background.a),
      g: background.g + 255 * (1 - background.a),
      b: background.b + 255 * (1 - background.a),
      a: 1,
    }
  }
  const luminance = ({ r, g, b }: { r: number, g: number, b: number }) => {
    const channel = (value: number) => {
      const normalized = value / 255
      return normalized <= 0.04045
        ? normalized / 12.92
        : ((normalized + 0.055) / 1.055) ** 2.4
    }
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
  }
  const foregroundLuminance = luminance(foreground)
  const backgroundLuminance = luminance(background)
  return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05)
    / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
})

const nonTextContrastRatio = async (
  page: Page,
  selector: string,
  foregroundProperty: string,
  backgroundFrom: 'self' | 'parent',
) => page.locator(selector).evaluate((element, options) => {
  const parseColor = (value: string) => {
    const parts = value.match(/[\d.]+/gu)?.map(Number) ?? []
    return { r: parts[0] ?? 0, g: parts[1] ?? 0, b: parts[2] ?? 0, a: parts[3] ?? 1 }
  }
  const effectiveBackground = (start: Element | null) => {
    let color = { r: 0, g: 0, b: 0, a: 0 }
    for (let current = start; current; current = current.parentElement) {
      const behind = parseColor(getComputedStyle(current).backgroundColor)
      color = {
        r: color.r + behind.r * behind.a * (1 - color.a),
        g: color.g + behind.g * behind.a * (1 - color.a),
        b: color.b + behind.b * behind.a * (1 - color.a),
        a: color.a + behind.a * (1 - color.a),
      }
      if (color.a >= 0.999) break
    }
    return color.a < 1
      ? {
          r: color.r + 255 * (1 - color.a),
          g: color.g + 255 * (1 - color.a),
          b: color.b + 255 * (1 - color.a),
        }
      : color
  }
  const luminance = ({ r, g, b }: { r: number, g: number, b: number }) => {
    const channel = (value: number) => {
      const normalized = value / 255
      return normalized <= 0.04045
        ? normalized / 12.92
        : ((normalized + 0.055) / 1.055) ** 2.4
    }
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
  }
  const foreground = parseColor(getComputedStyle(element).getPropertyValue(options.foregroundProperty))
  const background = effectiveBackground(options.backgroundFrom === 'self' ? element : element.parentElement)
  const foregroundLuminance = luminance(foreground)
  const backgroundLuminance = luminance(background)
  return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05)
    / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
}, { foregroundProperty, backgroundFrom })

const expectDockDoesNotCoverContent = async (page: Page, dockSelector: string) => {
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))
  const layout = await page.evaluate((selector) => {
    const dock = document.querySelector<HTMLElement>(selector)
    const lastSection = document.querySelector<HTMLElement>('article section:last-of-type')
    if (!dock || !lastSection) throw new Error(`Missing action dock evidence for ${selector}`)
    const dockRect = dock.getBoundingClientRect()
    const sectionRect = lastSection.getBoundingClientRect()
    const mobileNavigation = document.querySelector<HTMLElement>('.bottom-nav--mobile')
    const mobileNavigationRect = mobileNavigation?.getBoundingClientRect()
    return {
      dockBottom: dockRect.bottom,
      dockTop: dockRect.top,
      viewportHeight: innerHeight,
      sectionBottom: sectionRect.bottom,
      safeAreaGap: mobileNavigationRect && mobileNavigationRect.height > 0
        ? mobileNavigationRect.top - dockRect.bottom
        : null,
      computedSafeOffset: mobileNavigationRect && mobileNavigationRect.height > 0
        ? Number.parseFloat(getComputedStyle(dock).bottom)
          - Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-height'))
        : null,
    }
  }, dockSelector)
  expect(layout.dockBottom).toBeLessThanOrEqual(layout.viewportHeight)
  expect(layout.sectionBottom).toBeLessThanOrEqual(layout.dockTop)
  if (layout.safeAreaGap !== null) {
    expect(layout.safeAreaGap).toBeGreaterThanOrEqual(9)
  }
  if (layout.computedSafeOffset !== null) {
    expect(layout.computedSafeOffset).toBeGreaterThanOrEqual(9.5)
  }
}

const cleanupDatabase = async (
  context: BrowserContext,
  page: Page,
  databaseName: string,
) => {
  if (!page.isClosed()) {
    await page.close()
  }
  const cleanupPage = await context.newPage()
  await cleanupPage.goto('/')
  await cleanupPage.evaluate(async (name) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(name)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
      request.onblocked = () => reject(new Error(`Database cleanup blocked: ${name}`))
    })
  }, databaseName)
  await cleanupPage.close()
}

const fillProfile = async (page: Page, name: string) => {
  await page.getByLabel('称呼').fill(name)
  const details = page.locator('.profile-setup-step').nth(2)
  if (await details.getAttribute('open') === null) {
    await details.locator('summary').click()
  }
  await page.getByLabel('发质').selectOption('wavy')
  await page.getByLabel('发丝粗细').selectOption('fine')
  await page.getByLabel('发量').selectOption('medium')
  await page.getByLabel('日常打理分钟').fill('8')
  await page.getByLabel('洗发频率').selectOption('every_other_day')
  await page.getByRole('button', { name: '保存档案' }).click()
}

const openPlanDetails = async (page: Page) => {
  const details = page.locator('.plan-setup-details')
  if (await details.getAttribute('open') === null) {
    await details.locator('summary').click()
  }
}

const fillBrief = async (page: Page, targetName: string) => {
  const target = page.getByLabel(`目标候选：${targetName}`)
  if (!(await target.isChecked())) {
    await target.check()
  }
  await page.getByText('需要修改时展开').click()
  await page.getByLabel('整体').fill('整体保留轻盈轮廓')
  await page.getByLabel('顶部').fill('顶部保留自然支撑')
  await page.getByLabel('刘海').fill('刘海自然露额')
  await page.getByLabel('两侧').fill('两侧贴合但不推白')
  await page.getByLabel('鬓角').fill('鬓角保留自然尖角')
  await page.getByLabel('后脑').fill('后脑连接自然')
  await page.getByLabel('最在意 1', { exact: true }).fill('两侧不要炸')
  await page.getByLabel('绝对不要 1', { exact: true }).fill('不要推白')
  await page.getByRole('button', { name: '保存沟通卡' }).click()
}

test.beforeEach(async ({ page }, testInfo) => {
  const databaseName = `zajianfa-library-e2e-${testInfo.workerIndex}-${Date.now()}-${crypto.randomUUID()}`
  databaseNames.set(testInfo.testId, databaseName)
  await page.addInitScript(
    ({ key, name }) => sessionStorage.setItem(key, name),
    { key: TEST_DB_SESSION_KEY, name: databaseName },
  )
})

test.afterEach(async ({ context, page }, testInfo) => {
  const databaseName = databaseNames.get(testInfo.testId)
  databaseNames.delete(testInfo.testId)
  if (databaseName) {
    await cleanupDatabase(context, page, databaseName)
  }
})

test('browses six styles and keeps a keyboard-created favorite folder after reload', async ({
  baseURL,
  page,
}, testInfo) => {
  test.setTimeout(120_000)
  const traffic = captureRequests(page)
  const origin = new URL(baseURL as string).origin

  await page.goto('/')
  await captureSettled(page, testInfo, 'home-empty-390x844.png', { width: 390, height: 844 })
  await captureSettled(page, testInfo, 'home-empty-1440x900.png', { width: 1440, height: 900 })

  const logoEvidence = await page.evaluate(async () => {
    const inspect = async (path: string, points: readonly (readonly [number, number])[]) => {
      const response = await fetch(path)
      if (!response.ok) throw new Error(`Logo fixture unavailable: ${path}`)
      const bitmap = await createImageBitmap(await response.blob())
      try {
        const canvas = document.createElement('canvas')
        canvas.width = bitmap.width
        canvas.height = bitmap.height
        const context = canvas.getContext('2d', { willReadFrequently: true })
        if (!context) throw new Error('Logo evidence canvas unavailable')
        context.drawImage(bitmap, 0, 0)
        return {
          width: bitmap.width,
          height: bitmap.height,
          pixels: points.map(([x, y]) => [...context.getImageData(x, y, 1, 1).data]),
        }
      } finally {
        bitmap.close()
      }
    }
    return {
      master: await inspect('/brand/zajianfa-scissors-512.png', [
        [0, 0], [511, 0], [0, 511], [511, 511],
        [164, 366], [348, 366], [161, 120], [256, 270], [120, 380],
      ]),
      touch: await inspect('/brand/zajianfa-scissors-touch-180.png', [[0, 0], [179, 179]]),
      favicon32: await inspect('/brand/zajianfa-scissors-32.png', []),
      favicon16: await inspect('/brand/zajianfa-scissors-16.png', []),
      icons: [...document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"], link[rel="apple-touch-icon"]')]
        .map(({ rel, href }) => ({ rel, path: new URL(href).pathname })),
    }
  })
  expect(logoEvidence.master).toMatchObject({ width: 512, height: 512 })
  expect(logoEvidence.master.pixels.slice(0, 6).map((pixel) => pixel[3])).toEqual([0, 0, 0, 0, 0, 0])
  expect(logoEvidence.master.pixels.slice(6, 8).map((pixel) => pixel[3])).toEqual([255, 255])
  expect(logoEvidence.master.pixels[8]).toEqual([35, 26, 26, 255])
  expect(pixelContrastRatio(logoEvidence.master.pixels[8], [243, 239, 229])).toBeGreaterThanOrEqual(3)
  expect(pixelContrastRatio(logoEvidence.master.pixels[6], [23, 21, 18])).toBeGreaterThanOrEqual(3)
  expect(logoEvidence.touch).toMatchObject({ width: 180, height: 180 })
  expect(logoEvidence.touch.pixels.map((pixel) => pixel[3])).toEqual([255, 255])
  expect(logoEvidence.favicon32).toMatchObject({ width: 32, height: 32 })
  expect(logoEvidence.favicon16).toMatchObject({ width: 16, height: 16 })
  expect(logoEvidence.icons).toEqual(expect.arrayContaining([
    { rel: 'icon', path: '/brand/zajianfa-scissors-32.png' },
    { rel: 'icon', path: '/brand/zajianfa-scissors-16.png' },
    { rel: 'apple-touch-icon', path: '/brand/zajianfa-scissors-touch-180.png' },
  ]))
  await page.evaluate(() => {
    const evidence = document.createElement('aside')
    evidence.id = 'logo-background-evidence'
    evidence.setAttribute('aria-label', 'Logo 暖色与深色背景验证')
    evidence.style.cssText = [
      'position:fixed', 'inset:80px 24px auto', 'z-index:999', 'display:grid',
      'grid-template-columns:1fr 1fr', 'gap:12px', 'padding:12px',
      'background:#f8f4ec', 'box-shadow:0 16px 60px rgba(0,0,0,.35)',
    ].join(';')
    for (const background of ['#f8f4ec', '#171512']) {
      const panel = document.createElement('div')
      panel.style.cssText = `display:grid;place-items:center;min-height:150px;background:${background}`
      const image = document.createElement('img')
      image.src = '/brand/zajianfa-scissors-512.png'
      image.alt = ''
      image.style.cssText = 'width:120px;height:120px;object-fit:contain'
      panel.append(image)
      evidence.append(panel)
    }
    document.body.append(evidence)
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.locator('#logo-background-evidence img')).toHaveCount(2)
  await settlePage(page)
  await page.screenshot({ path: testInfo.outputPath('logo-backgrounds-390x844.png') })
  await page.locator('#logo-background-evidence').evaluate((element) => element.remove())

  await page.goto('/styles')
  await expect(page.getByRole('heading', { level: 1, name: '找发型' })).toBeVisible()
  await expect(page.getByTestId('hairstyle-tile')).toHaveCount(6)
  await captureSettled(page, testInfo, 'catalog-390x844.png', { width: 390, height: 844 })

  await page.getByLabel('搜索发型').fill('渐层')
  await expect(page.getByTestId('hairstyle-tile')).toHaveCount(1)
  await expect(page.getByRole('link', { name: '查看发型：清爽渐层' })).toBeVisible()
  await page.getByLabel('搜索发型').fill('')
  await expect(page.getByTestId('hairstyle-tile')).toHaveCount(6)
  await page.getByRole('button', { name: /筛选条件/ }).click()
  await page.getByLabel('筛选目标：少打理').check()
  await page.getByLabel('筛选维护：低维护').check()
  await expect(page.getByTestId('hairstyle-tile')).toHaveCount(2)
  await expect(page.getByRole('link', { name: '查看发型：清爽渐层' })).toBeVisible()
  await expect(page.getByRole('link', { name: '查看发型：纹理短碎发' })).toBeVisible()
  await page.getByRole('button', { name: '重置条件' }).click()
  await expect(page.getByTestId('hairstyle-tile')).toHaveCount(6)

  const favorite = page.getByRole('button', { name: '收藏：清爽渐层' })
  for (let index = 0; index < 30 && !(await favorite.evaluate((element) => (
    document.activeElement === element
  ))); index += 1) {
    await page.keyboard.press('Tab')
  }
  await expect(favorite).toBeFocused()
  const focusStyle = await favorite.evaluate((element) => {
    const style = getComputedStyle(element)
    return { style: style.outlineStyle, width: Number.parseFloat(style.outlineWidth) }
  })
  expect(focusStyle.style).not.toBe('none')
  expect(focusStyle.width).toBeGreaterThanOrEqual(3)
  await favorite.press('Space')
  await expect(favorite).toHaveAttribute('aria-pressed', 'true')

  const filterToggle = page.getByRole('button', { name: /筛选条件/ })
  for (let index = 0; index < 30 && !(await filterToggle.evaluate((element) => (
    document.activeElement === element
  ))); index += 1) {
    await page.keyboard.press('Shift+Tab')
  }
  await expect(filterToggle).toBeFocused()
  await expect.poll(() => nonTextContrastRatio(
    page,
    '.style-filter-bar__toggle',
    'outline-color',
    'self',
  )).toBeGreaterThanOrEqual(3)
  expect(await nonTextContrastRatio(
    page,
    '.style-filter-bar__toggle',
    'border-top-color',
    'parent',
  )).toBeGreaterThanOrEqual(3)

  await page.getByRole('link', { name: '我的收藏', exact: true }).click()
  await page.getByRole('button', { name: '新建收藏夹' }).click()
  await page.getByLabel('收藏夹名称').fill('下次沟通')
  await page.getByRole('button', { name: '创建收藏夹' }).click()
  await page.getByLabel('移动“清爽渐层”到收藏夹').selectOption({ label: '下次沟通' })
  await page.getByRole('button', { name: '下次沟通' }).click()
  await expect(page.getByRole('link', { name: '查看发型：清爽渐层' })).toBeVisible()

  await page.reload()
  await page.getByRole('button', { name: '下次沟通' }).click()
  await expect(page.getByRole('button', { name: '下次沟通' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('link', { name: '查看发型：清爽渐层' })).toBeVisible()
  await captureSettled(page, testInfo, 'favorites-390x844.png', { width: 390, height: 844 })
  await captureSettled(page, testInfo, 'favorites-1440x900.png', { width: 1440, height: 900 })

  await page.goto('/styles')
  await assertResponsiveLayout(page)
  await captureSettled(page, testInfo, 'catalog-1440x900.png', { width: 1440, height: 900 })

  await page.setViewportSize({ width: 390, height: 844 })
  await settlePage(page)
  for (const selector of [
    '.style-library-header h1',
    '.style-library-header > div > p:last-child',
    '.style-library-disclosure',
    '.style-filter-bar__search > span',
    '.style-filter-bar__toggle',
    '.style-library-header nav a[aria-current="page"]',
    '.hairstyle-grid__item:first-child .hairstyle-tile__copy strong',
    '.hairstyle-grid__item:first-child .hairstyle-tile__copy small',
  ]) {
    expect(await contrastRatio(page, selector), selector).toBeGreaterThanOrEqual(4.5)
  }

  const zoomTextSelectors = [
    '.style-library-header > div > p:last-child',
    '.style-library-disclosure',
    '.style-filter-bar__search > span',
    '.style-filter-bar__search input',
    '.style-filter-bar__toggle',
    '.hairstyle-grid__item:first-child .hairstyle-tile__copy strong',
    '.hairstyle-grid__item:first-child .hairstyle-tile__copy small',
  ] as const
  const baselineFontSizes = await page.evaluate((selectors) => Object.fromEntries(selectors.map((selector) => {
    const element = document.querySelector(selector)
    if (!element) throw new Error(`Missing 200% text evidence: ${selector}`)
    return [selector, Number.parseFloat(getComputedStyle(element).fontSize)]
  })), zoomTextSelectors)
  const baselineHeadingSize = await page.locator('.style-library-header h1').evaluate((element) => (
    Number.parseFloat(getComputedStyle(element).fontSize)
  ))
  const zoomStyle = await page.addStyleTag({ content: 'html { font-size: 200% !important; }' })
  await settlePage(page)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const zoomEvidence = await page.evaluate(({ selectors, baselineSizes, baselineHeading }) => {
    const text = selectors.map((selector) => {
      const element = document.querySelector<HTMLElement>(selector)
      if (!element) throw new Error(`Missing enlarged text evidence: ${selector}`)
      return {
        selector,
        ratio: Number.parseFloat(getComputedStyle(element).fontSize) / baselineSizes[selector],
        clippedHorizontally: element.scrollWidth > element.clientWidth + 1,
        clippedVertically: element.scrollHeight > element.clientHeight + 1,
        visible: element.getBoundingClientRect().width > 0 && element.getBoundingClientRect().height > 0,
      }
    })
    const overlapPairs = [
      ['.style-library-header h1', '.style-library-header > div > p:last-child'],
      ['.style-library-header > div', '.style-library-header nav'],
      ['.style-library-header', '.style-library-disclosure'],
      ['.style-filter-bar__search', '.style-filter-bar__toggle'],
      ['.style-filter-bar', '.style-library-results'],
      ['.hairstyle-grid__item:first-child .hairstyle-tile__media', '.hairstyle-grid__item:first-child .hairstyle-tile__copy'],
    ] as const
    const overlaps = overlapPairs.map(([firstSelector, secondSelector]) => {
      const first = document.querySelector<HTMLElement>(firstSelector)?.getBoundingClientRect()
      const second = document.querySelector<HTMLElement>(secondSelector)?.getBoundingClientRect()
      if (!first || !second) throw new Error(`Missing 200% overlap evidence: ${firstSelector}`)
      const horizontalIntersection = Math.min(first.right, second.right) - Math.max(first.left, second.left)
      const verticalIntersection = Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top)
      return { firstSelector, secondSelector, overlaps: horizontalIntersection > 1 && verticalIntersection > 1 }
    })
    const heading = document.querySelector<HTMLElement>('.style-library-header h1')
    if (!heading) throw new Error('Missing enlarged heading evidence')
    return {
      text,
      overlaps,
      headingRatio: Number.parseFloat(getComputedStyle(heading).fontSize) / baselineHeading,
    }
  }, {
    selectors: zoomTextSelectors,
    baselineSizes: baselineFontSizes,
    baselineHeading: baselineHeadingSize,
  })
  for (const textEvidence of zoomEvidence.text) {
    expect(textEvidence.ratio, textEvidence.selector).toBeGreaterThanOrEqual(1.99)
    expect(textEvidence.visible, textEvidence.selector).toBe(true)
    if (!textEvidence.selector.endsWith(' input')) {
      expect(textEvidence.clippedHorizontally, textEvidence.selector).toBe(false)
      expect(textEvidence.clippedVertically, textEvidence.selector).toBe(false)
    }
  }
  expect(zoomEvidence.headingRatio).toBeGreaterThanOrEqual(1.5)
  expect(zoomEvidence.overlaps.filter(({ overlaps }) => overlaps)).toEqual([])
  await page.screenshot({ path: testInfo.outputPath('catalog-zoom-200-390x844.png'), fullPage: true })
  await zoomStyle.evaluate((element) => element.parentNode?.removeChild(element))

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect.poll(() => page.getByRole('button', { name: '收藏：清爽渐层' }).evaluate((element) => (
    getComputedStyle(element).transitionDuration.split(',').every((duration) => Number.parseFloat(duration) <= 0.001)
  ))).toBe(true)
  await page.emulateMedia({ reducedMotion: 'no-preference' })

  const compiledCss = await page.evaluate(async () => (await Promise.all(
    [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')]
      .map(async ({ href }) => (await fetch(href)).text()),
  )).join('\n'))
  const compactCss = compiledCss.replace(/\s+/gu, '')
  expect(compactCss).toContain(
    '@supportsnot((-webkit-backdrop-filter:blur(1px))or(backdrop-filter:blur(1px)))',
  )
  expect(compactCss).toContain('@media(prefers-reduced-transparency:reduce)')
  expect(compactCss).toContain('backdrop-filter:none')

  await page.goto('/styles/catalog/qiao-taper')
  await expect(page.getByRole('heading', { level: 1, name: '清爽渐层' })).toBeVisible()
  await expect(page.getByRole('link', { name: '加入计划' })).toBeVisible()
  await captureSettled(page, testInfo, 'catalog-detail-390x844.png', { width: 390, height: 844 })
  await expectDockDoesNotCoverContent(page, '.style-action-dock')

  const mediaClient = await page.context().newCDPSession(page)
  await mediaClient.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }],
  })
  const reducedTransparency = await page.locator('.style-action-dock').evaluate((element) => ({
    matches: matchMedia('(prefers-reduced-transparency: reduce)').matches,
    background: getComputedStyle(element).backgroundColor,
    backdropFilter: getComputedStyle(element).backdropFilter,
  }))
  expect(reducedTransparency).toEqual({
    matches: true,
    background: 'rgb(255, 255, 255)',
    backdropFilter: 'none',
  })
  await mediaClient.send('Emulation.setEmulatedMedia', { features: [] })

  const fallbackEvidence = await page.evaluate(() => {
    let supportsCondition = ''
    let selector = ''
    let declaration = ''
    for (const sheet of document.styleSheets) {
      for (const rule of sheet.cssRules) {
        if (!(rule instanceof CSSSupportsRule) || !rule.conditionText.includes('backdrop-filter')) {
          continue
        }
        const glassRule = [...rule.cssRules].find((nestedRule): nestedRule is CSSStyleRule => (
          nestedRule instanceof CSSStyleRule
          && nestedRule.selectorText.includes('.style-action-dock')
        ))
        if (glassRule) {
          supportsCondition = rule.conditionText
          selector = glassRule.selectorText
          declaration = glassRule.style.cssText
          break
        }
      }
      if (selector) break
    }
    const dock = document.querySelector<HTMLElement>('.style-action-dock')
    if (!dock || !selector || !declaration) {
      throw new Error('Compiled glass fallback rule is unavailable')
    }
    const before = getComputedStyle(dock).backgroundColor
    const forcedFallback = document.createElement('style')
    forcedFallback.textContent = `${selector} { ${declaration} }`
    document.head.append(forcedFallback)
    const after = getComputedStyle(dock).backgroundColor
    forcedFallback.remove()
    return { supportsCondition, selector, declaration, before, after }
  })
  expect(fallbackEvidence.supportsCondition).toContain('backdrop-filter')
  expect(fallbackEvidence.selector).toContain('.style-action-dock')
  expect(fallbackEvidence.declaration).toContain('background')
  expect(fallbackEvidence.before).toMatch(/^rgba\(/u)
  expect(fallbackEvidence.after).toBe('rgb(245, 240, 231)')

  await captureSettled(page, testInfo, 'catalog-detail-1440x900.png', { width: 1440, height: 900 })
  await expectDockDoesNotCoverContent(page, '.style-action-dock')

  expectLocalOnly(traffic, origin)
})

test('keeps a processed private reference local while its mixed-plan snapshot survives source deletion', async ({
  baseURL,
  page,
}, testInfo) => {
  test.setTimeout(120_000)
  const traffic = captureRequests(page)
  const origin = new URL(baseURL as string).origin
  const sourceJpeg = await createOrientationSixJpeg(page)
  expect(sourceJpeg.includes(Buffer.from('Exif\0\0', 'binary'))).toBe(true)
  expect(sourceJpeg.includes(Buffer.from(PRIVATE_SOURCE_MARKER))).toBe(true)

  await page.addInitScript(() => {
    const nativeCreateImageBitmap = createImageBitmap.bind(globalThis)
    const nativeAdd = IDBObjectStore.prototype.add
    let delayedFirstDecode = false
    IDBObjectStore.prototype.add = function controlledAdd(
      this: IDBObjectStore,
      value: unknown,
      key?: IDBValidKey,
    ) {
      const state = globalThis as typeof globalThis & { __blockPrivateReferenceWrites?: boolean }
      if (state.__blockPrivateReferenceWrites && this.name === 'privateReferences') {
        throw new DOMException('Synthetic local quota evidence', 'QuotaExceededError')
      }
      return Reflect.apply(
        nativeAdd,
        this,
        key === undefined ? [value] : [value, key],
      ) as IDBRequest<IDBValidKey>
    } as typeof IDBObjectStore.prototype.add
    globalThis.createImageBitmap = (async (...args: Parameters<typeof createImageBitmap>) => {
      if (!delayedFirstDecode) {
        delayedFirstDecode = true
        await new Promise((resolve) => setTimeout(resolve, 3_000))
      }
      return nativeCreateImageBitmap(...args)
    }) as typeof createImageBitmap
  })

  await page.goto('/styles/references')
  await expect(page.getByText('还没有私人参考')).toBeVisible()
  await captureSettled(page, testInfo, 'private-empty-390x844.png', { width: 390, height: 844 })
  await captureSettled(page, testInfo, 'private-empty-1440x900.png', { width: 1440, height: 900 })
  await page.getByRole('link', { name: '添加第一张参考' }).click()
  const referenceInput = page.getByLabel('选择私人参考照片')
  await referenceInput.setInputFiles({
    name: PRIVATE_SOURCE_FILENAME,
    mimeType: 'image/jpeg',
    buffer: sourceJpeg,
  })
  await expect(page.getByText('正在本机处理照片…')).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: testInfo.outputPath('private-processing-390x844.png'), fullPage: true })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.screenshot({ path: testInfo.outputPath('private-processing-1440x900.png'), fullPage: true })
  await expect(page.getByText(/已处理 · 40 × 80/)).toBeVisible({ timeout: 10_000 })

  await page.getByRole('button', { name: '清除所选照片' }).click()
  await referenceInput.setInputFiles({
    name: '无法读取-私人参考.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from('not-a-valid-private-image'),
  })
  await expect(page.getByRole('alert')).toHaveText('无法读取这张照片，请换一张后重试。')
  await captureSettled(page, testInfo, 'private-error-390x844.png', { width: 390, height: 844 })
  await captureSettled(page, testInfo, 'private-error-1440x900.png', { width: 1440, height: 900 })
  await page.getByRole('button', { name: '清除所选照片' }).click()
  await referenceInput.setInputFiles({
    name: PRIVATE_SOURCE_FILENAME,
    mimeType: 'image/jpeg',
    buffer: sourceJpeg,
  })
  await expect(page.getByText(/已处理 · 40 × 80/)).toBeVisible()
  await page.getByLabel('参考名称').fill('耳侧长度参考')
  await page.getByLabel('我的备注').fill('只参考耳侧长度，不照搬颜色。')
  await page.getByLabel('标签').fill('通勤，耳侧，通勤')
  await page.getByRole('button', { name: '两侧' }).click()
  await page.getByRole('radio', { name: '喜欢这里' }).check()
  await page.getByLabel('两侧说明').fill('耳侧长度要盖住一半耳朵')
  await page.getByRole('button', { name: '记下两侧' }).click()

  await page.evaluate(() => {
    const state = globalThis as typeof globalThis & { __blockPrivateReferenceWrites?: boolean }
    state.__blockPrivateReferenceWrites = true
  })
  await page.getByRole('button', { name: '保存私人参考' }).click()
  await expect(page.getByRole('alert')).toHaveText('本机存储空间不足，请清理不需要的本地内容后重试。')
  await captureSettled(page, testInfo, 'private-storage-error-390x844.png', { width: 390, height: 844 })
  await captureSettled(page, testInfo, 'private-storage-error-1440x900.png', { width: 1440, height: 900 })
  await page.evaluate(() => {
    const state = globalThis as typeof globalThis & { __blockPrivateReferenceWrites?: boolean }
    state.__blockPrivateReferenceWrites = false
  })
  await page.getByRole('button', { name: '保存私人参考' }).click()

  await expect(page.getByRole('heading', { level: 1, name: '耳侧长度参考' })).toBeVisible()
  const referencePath = new URL(page.url()).pathname
  const databaseName = databaseNames.get(testInfo.testId)
  expect(databaseName).toBeTruthy()
  const storedReference = await page.evaluate(async (name) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    try {
      const row = await new Promise<{
        image: Blob
        width: number
        height: number
        bytes: number
        [key: string]: unknown
      }>((resolve, reject) => {
        const request = database.transaction('privateReferences', 'readonly')
          .objectStore('privateReferences').getAll()
        request.onsuccess = () => resolve(request.result[0])
        request.onerror = () => reject(request.error)
      })
      const bytes = new Uint8Array(await row.image.arrayBuffer())
      const bitmap = await createImageBitmap(row.image)
      const result = {
        keys: Object.keys(row),
        serialized: JSON.stringify({ ...row, image: undefined }),
        type: row.image.type,
        size: row.image.size,
        width: row.width,
        height: row.height,
        bitmapWidth: bitmap.width,
        bitmapHeight: bitmap.height,
        byteText: new TextDecoder('latin1').decode(bytes),
        rawBytes: [...bytes],
      }
      bitmap.close()
      return result
    } finally {
      database.close()
    }
  }, databaseName as string)
  expect(storedReference).toMatchObject({
    width: 40,
    height: 80,
    bitmapWidth: 40,
    bitmapHeight: 80,
    size: storedReference.size,
  })
  expect(['image/webp', 'image/jpeg']).toContain(storedReference.type)
  expect(storedReference.keys).not.toContain('filename')
  expect(storedReference.serialized).not.toContain(PRIVATE_SOURCE_FILENAME)
  expect(storedReference.serialized).toContain('耳侧长度要盖住一半耳朵')
  expect(storedReference.byteText).not.toMatch(/Exif|EXIF/)
  expect(storedReference.byteText).not.toContain(PRIVATE_SOURCE_MARKER)

  await page.getByRole('button', { name: '更多' }).click()
  await page.getByRole('link', { name: '编辑私人参考' }).click()
  await expect(page.getByRole('heading', { level: 1, name: '编辑私人参考' })).toBeVisible()
  await page.getByLabel('我的备注').fill('已编辑：只参考耳侧长度，不照搬颜色。')
  await page.getByLabel('标签').fill('通勤，耳侧，已编辑')
  await page.getByRole('button', { name: '保存修改' }).click()
  await expect(page.getByRole('heading', { level: 1, name: '耳侧长度参考' })).toBeVisible()
  await page.reload()
  await expect(page.getByText(/已编辑[:：]只参考耳侧长度[,，]不照搬颜色。/)).toBeVisible()
  await expect(page.getByText('已编辑', { exact: true })).toBeVisible()
  await expect(page.getByText('两侧想保留')).toBeVisible()
  await expect(page.getByText('耳侧长度要盖住一半耳朵')).toBeVisible()

  await page.getByRole('button', { name: '更多' }).click()
  const favorite = page.getByRole('button', { name: '收藏：耳侧长度参考' })
  await favorite.press('Space')
  await expect(favorite).toHaveAttribute('aria-pressed', 'true')
  await captureSettled(page, testInfo, 'private-reference-390x844.png', { width: 390, height: 844 })
  await expectDockDoesNotCoverContent(page, '.reference-action-dock')
  await captureSettled(page, testInfo, 'private-reference-1440x900.png', { width: 1440, height: 900 })
  await expectDockDoesNotCoverContent(page, '.reference-action-dock')

  await page.getByRole('link', { name: '给理发师看' }).click()
  await expect(page.getByRole('heading', { level: 1, name: '耳侧长度参考' })).toBeVisible()
  await expect(page.getByText(/已编辑[:：]只参考耳侧长度[,，]不照搬颜色。/)).toBeVisible()
  await expect(page.getByText('两侧想保留')).toBeVisible()
  await expect(page.getByText('耳侧长度要盖住一半耳朵')).toBeVisible()
  await expect(page.getByText('给理发师看的要点')).toHaveCount(0)
  await expect(page.getByRole('navigation', { name: '主导航' })).toHaveCount(0)
  await captureSettled(page, testInfo, 'private-barber-390x844.png', { width: 390, height: 844 })
  await captureSettled(page, testInfo, 'private-barber-1440x900.png', { width: 1440, height: 900 })

  await page.goto(referencePath)
  await page.getByRole('link', { name: '加入计划' }).click()
  await expect(page).toHaveURL(/\/archive\/profile\?next=/)
  await fillProfile(page, '阿青')
  await expect(page).toHaveURL(/\/archive\/plans\/new$/)
  await expect(page.getByText('已把“耳侧长度参考”加入探索计划；再选 1—3 个方向即可保存。')).toBeVisible()
  await page.getByText('继续添加或更换候选').click()
  await page.getByRole('button', { name: '加入候选：齐颌短鲍伯' }).click()
  await openPlanDetails(page)
  await page.getByLabel('计划标题').fill('耳侧与鲍伯探索')
  await page.getByLabel('计划日期').fill('2026-08-28')
  await page.getByLabel('计划状态').selectOption('ready')
  await page.getByRole('button', { name: '保存计划' }).click()

  await expect(page.getByRole('heading', { level: 1, name: '耳侧与鲍伯探索' })).toBeVisible()
  await expect(page.getByRole('img', { name: '耳侧长度参考本地候选图' })).toBeVisible()
  await expect(page.getByRole('img', { name: '齐颌短鲍伯预制示例' })).toBeVisible()
  await expect(page.getByText(/两侧想保留：耳侧长度要盖住一半耳朵/u)).toBeVisible()
  const planPath = new URL(page.url()).pathname
  await page.getByRole('link', { name: '创建沟通卡' }).click()
  await fillBrief(page, '耳侧长度参考')
  const briefPath = new URL(page.url()).pathname
  await expect(page.getByRole('region', { name: '理发师沟通卡预览' })).toContainText('耳侧长度参考')
  await captureSettled(page, testInfo, 'mixed-brief-390x844.png', { width: 390, height: 844 })

  await page.goto(referencePath)
  await page.getByRole('button', { name: '更多' }).click()
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: '删除私人参考' }).click()
  await expect(page.getByRole('heading', { level: 1, name: '我的参考' })).toBeVisible()
  await expect(page.getByText('还没有私人参考')).toBeVisible()

  await page.goto(planPath)
  await expect(page.getByRole('img', { name: '耳侧长度参考本地候选图' })).toBeVisible()
  await expect(page.getByRole('img', { name: '齐颌短鲍伯预制示例' })).toBeVisible()
  await page.goto(briefPath)
  await expect(page.getByRole('region', { name: '理发师沟通卡预览' })).toContainText('耳侧长度参考')
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出 PNG' }).click()
  const download = await downloadPromise
  const exportedPath = testInfo.outputPath('mixed-plan-snapshot-brief.png')
  await download.saveAs(exportedPath)
  expect((await stat(exportedPath)).size).toBeGreaterThan(0)
  await captureSettled(page, testInfo, 'mixed-brief-1440x900.png', { width: 1440, height: 900 })

  await page.goto('/styles/catalog/lin-bob/show')
  await expect(page.getByRole('heading', { level: 1, name: '齐颌短鲍伯' })).toBeVisible()
  await page.getByText('完整部位说明与现实限制').click()
  await expect(page.getByText('只提供正面参考；侧面与后脑必须结合你的头型、发旋和现场长度确认。')).toBeVisible()
  await expect(page.getByRole('heading', { level: 2, name: '剪发沟通要点' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: '主导航' })).toHaveCount(0)
  await captureSettled(page, testInfo, 'curated-barber-390x844.png', { width: 390, height: 844 })
  await assertResponsiveLayout(page)
  await captureSettled(page, testInfo, 'curated-barber-1440x900.png', { width: 1440, height: 900 })

  expectLocalOnly(traffic, origin, [
    Buffer.from('Exif\0\0', 'binary'),
    Buffer.from(PRIVATE_SOURCE_MARKER),
    sourceJpeg,
    Buffer.from(storedReference.rawBytes),
  ])
})

test('creates a one-snapshot repeat plan and its communication card from an active standard style', async ({
  baseURL,
  page,
}, testInfo) => {
  test.setTimeout(90_000)
  const traffic = captureRequests(page)
  const origin = new URL(baseURL as string).origin

  await page.goto('/archive/profile')
  await fillProfile(page, '复刻测试')
  await page.getByRole('link', { name: '记录这次理发' }).click()
  await page.getByLabel('理发日期').fill('2026-08-20')
  await page.getByLabel('发型名').fill('上次满意短发')
  await page.getByLabel('满意度').selectOption('5')
  await page.getByLabel('剪后照片').setInputFiles('public/demo/persona-ran-sidepart.webp')
  await page.getByLabel('就这样').check()
  await page.getByRole('button', { name: '保存剪后记录' }).click()
  await expect(page.getByText('已存为标准发型')).toBeVisible()

  await page.getByRole('link', { name: '返回档案' }).click()
  await page.getByRole('link', { name: '新建发型计划' }).click()
  await openPlanDetails(page)
  await page.getByLabel('复刻标准发型').check()
  await page.getByRole('button', { name: '选择标准发型：上次满意短发' }).click()
  await expect(page.getByText('已选择 1 / 1')).toBeVisible()
  await page.getByLabel('计划标题').fill('复刻上次满意短发')
  await page.getByLabel('计划日期').fill('2026-08-30')
  await page.getByLabel('计划状态').selectOption('ready')
  await page.getByRole('button', { name: '保存计划' }).click()

  await expect(page.getByRole('heading', { level: 1, name: '复刻上次满意短发' })).toBeVisible()
  await expect(page.getByRole('img', { name: '上次满意短发本地候选图' })).toBeVisible()
  await expect(page.getByRole('list', { name: '计划候选' }).getByRole('listitem')).toHaveCount(1)
  await expect(page.getByText('01 · PAST · 真实剪后记录', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: '创建沟通卡' }).click()
  await fillBrief(page, '上次满意短发')
  await expect(page.getByRole('region', { name: '理发师沟通卡预览' })).toContainText('上次满意短发')
  await captureSettled(page, testInfo, 'repeat-brief-390x844.png', { width: 390, height: 844 })
  await captureSettled(page, testInfo, 'repeat-brief-1440x900.png', { width: 1440, height: 900 })

  expectLocalOnly(traffic, origin)
})
