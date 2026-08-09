/// <reference lib="dom" />

import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { expect, test, type Page } from '@playwright/test'

const PRIVATE_SOURCE_MARKER = 'M3C_PRIVATE_ORIGINAL_SOURCE_MARKER'
const ORIGIN = 'http://127.0.0.1:4173'
const CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; connect-src 'self'; img-src 'self' blob: data: https://*.public.blob.vercel-storage.com; style-src 'self' 'unsafe-inline'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"

const openAuthorizedEditor = async (page: Page) => {
  await page.goto('/privacy/mask')
  await expect(page.getByRole('heading', { level: 1, name: /隐私\s*遮罩/ })).toBeVisible()
  await expect(page.getByRole('navigation', { name: '主导航' })).toHaveCount(0)
  await expect.poll(() => page.locator('#main-content').evaluate((element) => (
    getComputedStyle(element).paddingBottom
  ))).toBe('0px')
  await page.getByRole('checkbox', { name: /已满 18 岁/ }).check()
  return page.getByLabel('选择本人或已授权照片')
}

const markedSingleFace = async () => Buffer.concat([
  await readFile(path.resolve('public/demo/persona-lin-base.webp')),
  Buffer.from(PRIVATE_SOURCE_MARKER),
])

const createTwoFaceImage = async (page: Page) => Buffer.from(await page.evaluate(async () => {
  const load = async (url: string) => createImageBitmap(await (await fetch(url)).blob())
  const [left, right] = await Promise.all([
    load('/demo/persona-lin-base.webp'),
    load('/demo/persona-qiao-base.webp'),
  ])
  try {
    const canvas = document.createElement('canvas')
    canvas.width = 1200
    canvas.height = 800
    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error('Two-face fixture canvas unavailable')
    }
    context.fillStyle = '#d6cbbd'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(left, 0, 0, left.width, left.height, 0, 0, 600, 800)
    context.drawImage(right, 0, 0, right.width, right.height, 600, 0, 600, 800)
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
      (value) => value ? resolve(value) : reject(new Error('Two-face fixture encode failed')),
      'image/webp',
      0.94,
    ))
    return [...new Uint8Array(await blob.arrayBuffer())]
  } finally {
    left.close()
    right.close()
  }
}))

test('runs real same-origin MediaPipe under strict CSP and exports only a flat local image', async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000)
  const requests: Array<{ url: string, method: string, body: Buffer | null }> = []
  const responseCsp = new Map<string, string | undefined>()
  page.on('request', (request) => requests.push({
    url: request.url(),
    method: request.method(),
    body: request.postDataBuffer(),
  }))
  page.on('response', async (response) => {
    responseCsp.set(response.url(), (await response.allHeaders())['content-security-policy'])
  })
  await page.addInitScript(() => {
    const scope = window as unknown as { __safeFaceResponses?: unknown[] }
    scope.__safeFaceResponses = []
    const descriptor = Object.getOwnPropertyDescriptor(Worker.prototype, 'onmessage')
    if (!descriptor?.set || !descriptor.get) {
      return
    }
    Object.defineProperty(Worker.prototype, 'onmessage', {
      configurable: descriptor.configurable,
      enumerable: descriptor.enumerable,
      get: descriptor.get,
      set(listener: ((this: Worker, event: MessageEvent<unknown>) => unknown) | null) {
        descriptor.set?.call(this, listener
          ? function interceptedWorkerMessage(this: Worker, event: MessageEvent<unknown>) {
              scope.__safeFaceResponses?.push(event.data)
              return listener.call(this, event)
            }
          : null)
      },
    })
  })

  const input = await openAuthorizedEditor(page)
  expect(requests.filter(({ url }) => url.includes('/mediapipe/'))).toEqual([])
  const source = await markedSingleFace()
  expect(source.includes(Buffer.from(PRIVATE_SOURCE_MARKER))).toBe(true)

  await input.setInputFiles({
    name: '本人私密原图-marker.webp',
    mimeType: 'image/webp',
    buffer: source,
  })

  await expect(page.getByText('已自动放置初始遮罩，请确认后再调整。')).toBeVisible({ timeout: 60_000 })
  const inferenceRequests = requests.filter(({ url }) => url.includes('/mediapipe/'))
  expect(inferenceRequests.some(({ url }) => url.endsWith('/mediapipe/models/face-landmarker-float16-v1.task'))).toBe(true)
  expect(inferenceRequests.some(({ url }) => url.endsWith('.wasm'))).toBe(true)
  for (const request of inferenceRequests) {
    expect(new URL(request.url).origin).toBe(ORIGIN)
    expect(request.method).toBe('GET')
    expect(request.body).toBeNull()
  }

  const safeResponses = await page.evaluate(() => (
    window as unknown as { __safeFaceResponses?: unknown[] }
  ).__safeFaceResponses ?? [])
  expect(safeResponses).toHaveLength(1)
  expect(JSON.stringify(safeResponses)).not.toMatch(/landmark|blendshape|matrix/i)
  expect(safeResponses[0]).toMatchObject({ type: 'result', outcome: { kind: 'single' } })

  await page.getByRole('button', { name: '确认位置并继续' }).click()
  const editorCanvas = page.getByRole('img', { name: '遮罩编辑画布' })
  await editorCanvas.focus()
  await editorCanvas.press('ArrowRight')
  await page.getByRole('radio', { name: '纸片' }).check()

  for (const viewport of [
    { width: 360, height: 800 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
    { width: 1280, height: 900 },
  ]) {
    await page.setViewportSize(viewport)
    const layout = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > innerWidth,
      targets: [...document.querySelectorAll('a, button')]
        .map((element) => ({ label: element.textContent?.trim() ?? '', height: element.getBoundingClientRect().height }))
        .filter(({ height }) => height > 0)
        .sort((left, right) => left.height - right.height),
    }))
    expect(layout.overflow).toBe(false)
    expect(Math.round(layout.targets[0]?.height ?? 0), layout.targets[0]?.label).toBeGreaterThanOrEqual(45)
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: testInfo.outputPath('privacy-editor-390x844.png'), fullPage: true })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect.poll(() => editorCanvas.evaluate((element) => Number.parseFloat(
    getComputedStyle(element).transitionDuration,
  ) || 0)).toBeLessThanOrEqual(0.001)

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出单层遮罩图' }).click()
  const download = await downloadPromise
  const savedPath = await download.path()
  expect(savedPath).toBeTruthy()
  const flatBytes = await readFile(savedPath as string)
  expect(flatBytes.byteLength).toBeLessThanOrEqual(1_500_000)
  expect(flatBytes.includes(Buffer.from(PRIVATE_SOURCE_MARKER))).toBe(false)
  expect(flatBytes.includes(Buffer.from('Exif\0\0', 'binary'))).toBe(false)
  expect(download.suggestedFilename()).toMatch(/^咋剪发-隐私遮罩-\d{4}-\d{2}-\d{2}\.(webp|jpg)$/)

  const external = requests.filter(({ url }) => {
    const parsed = new URL(url)
    return ['http:', 'https:'].includes(parsed.protocol) && parsed.origin !== ORIGIN
  })
  expect(external).toEqual([])
  expect(requests.filter(({ method }) => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method))).toEqual([])
  expect(requests.some(({ body }) => body?.includes(Buffer.from(PRIVATE_SOURCE_MARKER)))).toBe(false)
  expect([...responseCsp.entries()].filter(([url]) => url.startsWith(ORIGIN)).every(([, csp]) => csp === CSP)).toBe(true)
  expect([...responseCsp.keys()].some((url) => /faceLandmarker\.worker-.*\.js$/.test(url))).toBe(true)
})

test('keeps multiple faces hard-blocked with no manual or export path', async ({ page }, testInfo) => {
  test.setTimeout(90_000)
  await page.setViewportSize({ width: 390, height: 844 })
  const input = await openAuthorizedEditor(page)
  const fixture = await createTwoFaceImage(page)
  await input.setInputFiles({ name: 'two-authorized-adults.webp', mimeType: 'image/webp', buffer: fixture })

  const alert = page.getByRole('alert')
  await expect(alert).toContainText('检测到多人', { timeout: 60_000 })
  await expect(page.getByRole('button', { name: /手动/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '导出单层遮罩图' })).toHaveCount(0)
  await alert.scrollIntoViewIfNeeded()
  await expect(alert).toBeInViewport()
  await page.screenshot({ path: testInfo.outputPath('privacy-multiple-hard-block-390x844.png') })
})

test('uses explicit manual fallback and recovers on the next image after model initialization fails', async ({ page }) => {
  test.setTimeout(60_000)
  let modelRequests = 0
  await page.route('**/mediapipe/models/face-landmarker-float16-v1.task', (route) => {
    modelRequests += 1
    return modelRequests === 1 ? route.abort('failed') : route.continue()
  })
  const input = await openAuthorizedEditor(page)
  const source = {
    name: 'manual-fallback.webp',
    mimeType: 'image/webp',
    buffer: await markedSingleFace(),
  }
  await input.setInputFiles(source)

  await expect(page.getByText('自动定位不可用，已进入完全手动模式。照片仍只在本机处理。')).toBeVisible()
  await expect(page.getByRole('button', { name: '导出单层遮罩图' })).toBeVisible()

  await page.getByLabel('换一张照片').setInputFiles({ ...source, name: 'retry-after-model-failure.webp' })
  await expect(page.getByText('已自动放置初始遮罩，请确认后再调整。')).toBeVisible({ timeout: 60_000 })
  expect(modelRequests).toBe(2)
})
