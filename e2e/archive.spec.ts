/// <reference lib="dom" />

import path from 'node:path'

import { expect, test, type Page } from '@playwright/test'

const TEST_DB_SESSION_KEY = '__zajianfa_e2e_archive_db__'
const databaseNames = new Map<string, string>()
const PRIVATE_SOURCE_MARKER = 'M3A_PRIVATE_SOURCE_BYTES_AND_FILENAME'

const openProfileStep = async (page: Page, index: number) => {
  const step = page.locator('.profile-setup-step').nth(index)
  if (await step.getAttribute('open') === null) {
    await step.locator('summary').click()
  }
}

const openPlanDetails = async (page: Page) => {
  const details = page.locator('.plan-setup-details')
  if (await details.getAttribute('open') === null) {
    await details.locator('summary').click()
  }
}

const waitForSettledRoute = async (page: Page) => {
  await expect(page.locator('.route-enter-active, .route-leave-active')).toHaveCount(0)
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
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Fixture encode failed')), 'image/jpeg', 0.95)
    })
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

test.beforeEach(async ({ page }, testInfo) => {
  const databaseName = `zajianfa-e2e-${testInfo.workerIndex}-${Date.now()}-${Math.random().toString(36).slice(2)}`
  databaseNames.set(testInfo.testId, databaseName)
  await page.addInitScript(
    ({ key, name }) => {
      const browser = globalThis as unknown as {
        sessionStorage: { setItem(storageKey: string, value: string): void }
      }
      browser.sessionStorage.setItem(key, name)
    },
    { key: TEST_DB_SESSION_KEY, name: databaseName },
  )
})

test.afterEach(async ({ context, page }, testInfo) => {
  const databaseName = databaseNames.get(testInfo.testId)
  databaseNames.delete(testInfo.testId)
  if (!databaseName) {
    return
  }

  if (!page.isClosed()) {
    await page.close()
  }
  const cleanupPage = await context.newPage()
  await cleanupPage.goto('/')
  await cleanupPage.evaluate(async (name) => {
    await new Promise<void>((resolve, reject) => {
      const browser = globalThis as unknown as {
        indexedDB: {
          deleteDatabase(databaseName: string): {
            error: unknown
            onsuccess: (() => void) | null
            onerror: (() => void) | null
            onblocked: (() => void) | null
          }
        }
      }
      const request = browser.indexedDB.deleteDatabase(name)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
      request.onblocked = () => reject(new Error(`Database cleanup blocked: ${name}`))
    })
  }, databaseName)
  await cleanupPage.close()
})

test('persists a plan and local haircut record through repeat, avoid, refresh, and record deletion', async ({
  page,
}, testInfo) => {
  await page.goto('/archive')
  await expect(page.getByText('这台设备还没有发型档案')).toBeVisible()
  await page.getByRole('link', { name: '建立档案' }).click()

  await page.getByLabel('称呼').fill('小林')
  await openProfileStep(page, 2)
  await page.getByLabel('发质').selectOption('wavy')
  await page.getByLabel('发丝粗细').selectOption('fine')
  await page.getByLabel('发量').selectOption('medium')
  await page.getByLabel('日常打理分钟').fill('12')
  await page.getByLabel('洗发频率').selectOption('every_other_day')
  await page.getByLabel('偏好备注').fill('希望露耳，但两侧不要推白')
  await page.getByRole('button', { name: '保存档案' }).click()

  await expect(page).toHaveURL(/\/archive$/)
  await expect(page.getByRole('heading', { level: 2, name: '小林的发型档案' })).toBeVisible()
  await page.getByRole('link', { name: '准备下次怎么剪' }).click()

  await openPlanDetails(page)
  await page.getByLabel('计划标题').fill('夏末短发计划')
  await page.getByLabel('计划日期').fill('2026-08-22')
  await page.getByLabel('计划状态').selectOption('ready')
  await page.getByRole('button', { name: '加入候选：齐颌短鲍伯' }).click()
  await page.getByText('继续添加或更换候选').click()
  await page.getByRole('button', { name: '加入候选：纹理短碎发' }).click()
  await expect(page.getByText('已选择 2 / 4')).toBeVisible()
  await page.getByRole('button', { name: '保存计划' }).click()

  await expect(page.getByRole('heading', { level: 1, name: '夏末短发计划' })).toBeVisible()
  await expect(page.getByRole('img', { name: /齐颌短鲍伯/ })).toBeVisible()
  await expect(page.getByRole('img', { name: /纹理短碎发/ })).toBeVisible()
  await expect(page.getByText('示例体验 · 非用户生成').first()).toBeVisible()

  await page.getByRole('link', { name: '返回档案' }).click()
  await expect(page.getByRole('heading', { level: 2, name: '小林的发型档案' })).toBeVisible()
  await page.getByRole('link', { name: '记录这次理发' }).click()

  await expect(page.getByRole('heading', { level: 1, name: '记录这次理发' })).toBeVisible()
  await page.getByText('日期、名称和满意度', { exact: true }).click()
  await page.getByText('在哪剪的（可选）', { exact: true }).click()
  await page.getByText('更多记录（可选）', { exact: true }).click()
  await page.getByLabel('关联计划（可选）').selectOption({ label: '夏末短发计划' })
  await page.getByLabel('理发日期').fill('2026-08-20')
  await page.getByLabel('发型名').fill('纹理短碎发')
  await page.getByLabel('店铺', { exact: true }).fill('巷口理发店')
  await page.getByLabel('店铺位置（可选）').fill('静安区南京西路 688 号')
  await page.getByLabel('理发师').fill('Tony')
  await page.getByLabel('服务').fill('洗剪吹')
  await page.getByLabel('价格（元）').fill('128.50')
  await page.getByLabel('耗时（分钟）').fill('75')
  await page.getByLabel('备注').fill('顶部保留自然纹理')
  await page.getByLabel('满意度').selectOption('5')
  await page.getByLabel('剪后照片').setInputFiles(path.resolve('public/demo/persona-ran-sidepart.webp'))
  await page.getByLabel('就这样').check()
  await page.getByRole('button', { name: '保存剪后记录' }).click()

  await expect(page.getByRole('heading', { level: 1, name: '纹理短碎发' })).toBeVisible()
  await expect(page.getByRole('img', { name: '纹理短碎发的剪后照片' })).toBeVisible()
  await expect(page.getByText('5 / 5')).toBeVisible()
  await page.getByText('查看本次店铺与备注').click()
  await expect(page.getByText('静安区南京西路 688 号')).toBeVisible()
  await expect(page.getByText('下次可以照着剪')).toBeVisible()
  await expect(page.getByRole('navigation', { name: '主导航' })).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('record-detail-390x844.png'), fullPage: true })

  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: '纹理短碎发' })).toBeVisible()
  await expect(page.getByRole('img', { name: '纹理短碎发的剪后照片' })).toBeVisible()

  await page.getByRole('link', { name: '返回档案' }).click()
  await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: '首页' }).click()
  await expect(page.getByRole('link', { name: '查看上次发型：纹理短碎发' })).toBeVisible()
  await expect(page.getByText('上次发型 · 纹理短碎发')).toBeVisible()
  await expect(page.getByText('下次可以复刻：把细节带给理发师确认。')).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('home-history-390x844.png'), fullPage: true })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.screenshot({ path: testInfo.outputPath('home-history-1440x900.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })

  await page.getByRole('link', { name: '查看上次发型：纹理短碎发' }).click()
  await page.getByRole('link', { name: '编辑记录' }).click()
  await expect(page.getByText('已保留：剪后照片')).toBeVisible()
  await page.getByLabel('满意度').selectOption('2')
  await page.getByLabel('别再这样').check()
  await page.getByLabel('避雷规则 1').fill('两侧不要推白')
  await page.getByRole('button', { name: '保存修改' }).click()

  await expect(page.getByText('这次记为避雷')).toBeVisible()
  await expect(page.getByText('两侧不要推白', { exact: true })).toBeVisible()
  await expect(page.getByRole('img', { name: '纹理短碎发的剪后照片' })).toBeVisible()

  await page.getByRole('link', { name: '返回档案' }).click()
  await expect(page.getByText('还没有标准发型。')).toHaveCount(0)
  await expect(page.getByText('两侧不要推白', { exact: true })).toBeVisible()
  await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: '首页' }).click()
  await expect(page.getByText('下次先避开：两侧不要推白')).toBeVisible()
  await page.getByRole('link', { name: '查看上次发型：纹理短碎发' }).click()

  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: '删除记录' }).click()
  await expect(page).toHaveURL(/\/archive$/)
  await expect(page.getByRole('heading', { level: 2, name: '小林的发型档案' })).toBeVisible()
  await expect(page.getByRole('link', { name: '记录这次理发' })).toBeVisible()
  await expect(page.getByText('还没有剪后记录。记录至少一张照片和满意度，之后才能形成复刻或避雷提醒。')).toHaveCount(0)
  await expect(page.getByRole('link', { name: /夏末短发计划/ })).toBeVisible()

  for (const viewport of [
    { width: 360, height: 800 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
    { width: 1280, height: 900 },
  ]) {
    await page.setViewportSize(viewport)
    const layout = await page.evaluate(() => {
      const browser = globalThis as unknown as {
        document: {
          documentElement: { scrollWidth: number }
          querySelectorAll(selector: string): Iterable<{
            getBoundingClientRect(): { height: number, width: number }
          }>
        }
        innerWidth: number
      }
      const targetHeights = [...browser.document.querySelectorAll('a, button')]
        .map((target) => ({
          box: target.getBoundingClientRect(),
          label: (target as unknown as { textContent: string | null }).textContent?.trim() ?? '',
        }))
        .filter(({ box: { height, width } }) => height > 0 && width > 0)
        .sort((left, right) => left.box.height - right.box.height)
      return {
        hasHorizontalOverflow: browser.document.documentElement.scrollWidth > browser.innerWidth,
        minimumTargetHeight: targetHeights[0]?.box.height ?? 0,
        minimumTargetLabel: targetHeights[0]?.label ?? '',
      }
    })
    expect(layout.hasHorizontalOverflow).toBe(false)
    expect(Math.round(layout.minimumTargetHeight), layout.minimumTargetLabel)
      .toBeGreaterThanOrEqual(45)
  }
})

test('mixes prepared, past-record, and demo candidates without sending private bytes', async ({
  baseURL,
  page,
}, testInfo) => {
  test.setTimeout(60_000)
  const requests: { url: string, method: string, body: Buffer | null }[] = []
  page.on('request', (request) => {
    requests.push({
      url: request.url(),
      method: request.method(),
      body: request.postDataBuffer(),
    })
  })
  const sourceJpeg = await createOrientationSixJpeg(page)

  await page.goto('/archive/profile')
  await page.getByLabel('称呼').fill('阿青')
  await openProfileStep(page, 2)
  await page.getByLabel('发质').selectOption('wavy')
  await page.getByLabel('发丝粗细').selectOption('fine')
  await page.getByLabel('发量').selectOption('medium')
  await page.getByLabel('日常打理分钟').fill('8')
  await page.getByLabel('洗发频率').selectOption('every_other_day')
  await page.getByRole('button', { name: '保存档案' }).click()

  await page.getByRole('link', { name: '记录这次理发' }).click()
  await page.getByText('日期、名称和满意度', { exact: true }).click()
  await page.getByLabel('理发日期').fill('2026-08-19')
  await page.getByLabel('发型名').fill('清爽短碎发')
  await page.getByLabel('满意度').selectOption('5')
  await page.getByLabel('剪后照片').setInputFiles({
    name: 'record-private.jpg',
    mimeType: 'image/jpeg',
    buffer: sourceJpeg,
  })
  await page.getByLabel('就这样').check()
  await page.getByRole('button', { name: '保存剪后记录' }).click()

  await page.getByRole('link', { name: '返回档案' }).click()
  await page.getByRole('link', { name: '准备下次怎么剪' }).click()
  await page.getByLabel('本地参考图').setInputFiles({
    name: 'candidate-private.jpg',
    mimeType: 'image/jpeg',
    buffer: sourceJpeg,
  })
  await expect(page.getByText(/40 × 80/)).toBeVisible()
  await page.getByText('继续添加或更换候选').click()
  await page.getByRole('button', { name: '加入历史候选：清爽短碎发' }).click()
  await page.getByText('继续添加或更换候选').click()
  await page.getByRole('button', { name: '加入候选：齐颌短鲍伯' }).click()
  await openPlanDetails(page)
  await page.getByLabel('计划标题').fill('三路真实候选')
  await page.screenshot({ path: testInfo.outputPath('mixed-source-form-390x844.png'), fullPage: true })
  await page.getByRole('button', { name: '保存计划' }).click()

  await expect(page.getByRole('heading', { level: 1, name: '三路真实候选' })).toBeVisible()
  await expect(page.getByRole('img', { name: '我的参考图 1本地候选图' })).toBeVisible()
  await expect(page.getByRole('img', { name: '清爽短碎发本地候选图' })).toBeVisible()
  await expect(page.getByRole('img', { name: '齐颌短鲍伯预制示例' })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('mixed-candidates-390x844.png'), fullPage: true })

  await page.reload()
  await expect(page.getByRole('img', { name: '我的参考图 1本地候选图' })).toBeVisible()
  await expect(page.getByRole('img', { name: '清爽短碎发本地候选图' })).toBeVisible()
  await page.getByRole('link', { name: '准备给理发师看的内容' }).click()
  await page.getByLabel('目标候选：我的参考图 1').check()
  await page.getByText('需要修改时展开').click()
  await page.getByLabel('整体').fill('整体保留轻盈轮廓')
  await page.getByLabel('顶部').fill('顶部保留支撑')
  await page.getByLabel('刘海').fill('刘海自然露额')
  await page.getByLabel('两侧').fill('两侧贴合但不推白')
  await page.getByLabel('鬓角').fill('鬓角保留自然尖角')
  await page.getByLabel('后脑').fill('后脑连接自然')
  await page.getByLabel('最在意 1', { exact: true }).fill('两侧不要炸')
  await page.getByLabel('绝对不要 1', { exact: true }).fill('不要推白')
  await page.getByRole('button', { name: '保存沟通卡' }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出 PNG' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/^咋剪发-.*\.png$/)
  await page.getByLabel('目标候选：清爽短碎发').check()
  const pastDownloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出 PNG' }).click()
  const pastDownload = await pastDownloadPromise
  expect(pastDownload.suggestedFilename()).toMatch(/^咋剪发-.*\.png$/)

  const databaseName = databaseNames.get(testInfo.testId)
  expect(databaseName).toBeTruthy()
  const stored = await page.evaluate(async (name) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    try {
      const rows = await new Promise<Array<{
        order: number
        source: string
        referenceId?: string
        pastRecordId?: string
        referenceImage?: Blob
        referenceImageWidth?: number
        referenceImageHeight?: number
      }>>((resolve, reject) => {
        const request = database.transaction('candidates', 'readonly')
          .objectStore('candidates').getAll()
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      return Promise.all(rows.sort((left, right) => left.order - right.order).map(async (row) => ({
        source: row.source,
        referenceId: row.referenceId,
        pastRecordId: row.pastRecordId,
        width: row.referenceImageWidth,
        height: row.referenceImageHeight,
        bytes: row.referenceImage
          ? [...new Uint8Array(await row.referenceImage.arrayBuffer())]
          : [],
      })))
    } finally {
      database.close()
    }
  }, databaseName ?? '')
  expect(stored.map(({ source }) => source)).toEqual([
    'user_reference',
    'past_record',
    'demo_ai',
  ])
  expect(stored[0]).toMatchObject({ width: 40, height: 80 })
  expect(stored[0]?.referenceId).toMatch(/^local-[0-9a-f]{64}$/)
  expect(stored[1]?.pastRecordId).toBeTruthy()
  expect(stored[1]?.bytes.length).toBeGreaterThan(0)
  expect(Buffer.from(stored[0]?.bytes ?? []).includes(Buffer.from(PRIVATE_SOURCE_MARKER))).toBe(false)
  expect(Buffer.from(stored[1]?.bytes ?? []).includes(Buffer.from(PRIVATE_SOURCE_MARKER))).toBe(false)

  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto(page.url().replace(/\/brief$/, ''))
  await expect(page.getByRole('heading', { level: 1, name: '三路真实候选' })).toBeVisible()
  await page.waitForTimeout(250)
  await page.screenshot({ path: testInfo.outputPath('mixed-candidates-desktop.png'), fullPage: true })

  const externalRequests = requests.filter(({ url }) => {
    const parsed = new URL(url)
    return ['http:', 'https:'].includes(parsed.protocol)
      && parsed.origin !== new URL(baseURL as string).origin
  })
  expect(externalRequests).toEqual([])
  expect(requests.filter(({ method }) => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)))
    .toEqual([])
  expect(requests.some(({ body }) => body?.includes(Buffer.from(PRIVATE_SOURCE_MARKER)))).toBe(false)
  for (const candidate of stored.filter(({ bytes }) => bytes.length > 0)) {
    expect(requests.some(({ body }) => body?.includes(Buffer.from(candidate.bytes)))).toBe(false)
  }
})

test('prepares an orientation-6 JPEG locally before saving and never sends source bytes', async ({
  baseURL,
  page,
}, testInfo) => {
  const requests: { url: string, body: Buffer | null }[] = []
  page.on('request', (request) => {
    requests.push({ url: request.url(), body: request.postDataBuffer() })
  })
  await page.goto('/archive')
  const sourceJpeg = await createOrientationSixJpeg(page)
  expect(sourceJpeg.includes(Buffer.from('Exif\0\0', 'binary'))).toBe(true)
  expect(sourceJpeg.includes(Buffer.from(PRIVATE_SOURCE_MARKER))).toBe(true)

  await page.getByRole('link', { name: '建立档案' }).click()
  await page.getByLabel('称呼').fill('本地图片测试')
  await openProfileStep(page, 2)
  await page.getByLabel('发质').selectOption('straight')
  await page.getByLabel('发丝粗细').selectOption('medium')
  await page.getByLabel('发量').selectOption('medium')
  await page.getByLabel('日常打理分钟').fill('5')
  await page.getByLabel('洗发频率').selectOption('daily')
  await page.getByRole('button', { name: '保存档案' }).click()
  await page.getByRole('link', { name: '记录这次理发' }).click()
  await page.getByText('日期、名称和满意度', { exact: true }).click()
  await page.getByLabel('理发日期').fill('2026-08-10')
  await page.getByLabel('发型名').fill('方向纠正测试')
  await page.getByLabel('剪后照片').setInputFiles({
    name: '私密原图-tony.jpg',
    mimeType: 'image/jpeg',
    buffer: sourceJpeg,
  })

  await expect(page.getByText(/已在本地处理：40 × 80/)).toBeVisible()
  const preparedPreview = page.getByRole('img', { name: '剪后处理后预览' })
  await expect(preparedPreview).toBeVisible()
  await expect.poll(() => preparedPreview.evaluate((image) => ({
    width: (image as HTMLImageElement).naturalWidth,
    height: (image as HTMLImageElement).naturalHeight,
  }))).toEqual({ width: 40, height: 80 })
  await expect(page.getByText(/不会上传/)).toBeVisible()
  for (const viewport of [
    { width: 360, height: 800 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
    { width: 1280, height: 900 },
  ]) {
    await page.setViewportSize(viewport)
    const layout = await page.evaluate(() => {
      const targets = [...document.querySelectorAll('a, button')]
        .map((target) => ({
          box: target.getBoundingClientRect(),
          label: target.textContent?.trim() ?? '',
          className: target.className,
        }))
        .filter(({ box: { height, width } }) => height > 0 && width > 0)
        .sort((left, right) => left.box.height - right.box.height)
      return {
        hasHorizontalOverflow: document.documentElement.scrollWidth > innerWidth,
        minimumTargetHeight: targets[0]?.box.height ?? 0,
        minimumTarget: `${targets[0]?.label ?? ''} (${targets[0]?.className ?? ''})`,
      }
    })
    expect(layout.hasHorizontalOverflow).toBe(false)
    expect(Math.round(layout.minimumTargetHeight), layout.minimumTarget)
      .toBeGreaterThanOrEqual(45)
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: testInfo.outputPath('m3a-processing-form-390x844.png'), fullPage: true })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const transitionSeconds = await page.getByRole('button', { name: '保存剪后记录' }).evaluate(
    (button) => Number.parseFloat(getComputedStyle(button).transitionDuration) || 0,
  )
  expect(transitionSeconds).toBeLessThanOrEqual(0.001)
  await page.emulateMedia({ reducedMotion: 'no-preference' })

  await page.getByLabel('满意度').selectOption('5')
  await page.getByLabel('就这样').check()
  await page.getByRole('button', { name: '保存剪后记录' }).click()
  await expect(page.getByRole('heading', { level: 1, name: '方向纠正测试' })).toBeVisible()

  const databaseName = databaseNames.get(testInfo.testId)
  expect(databaseName).toBeTruthy()
  const photo = await page.evaluate(async (name) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    try {
      const row = await new Promise<{
        image: Blob
        width?: number
        height?: number
        bytes?: number
        processedAt?: string
      }>((resolve, reject) => {
        const request = database.transaction('photos', 'readonly').objectStore('photos').getAll()
        request.onsuccess = () => resolve(request.result[0])
        request.onerror = () => reject(request.error)
      })
      const bytes = new Uint8Array(await row.image.arrayBuffer())
      const bitmap = await createImageBitmap(row.image)
      const result = {
        type: row.image.type,
        size: row.image.size,
        width: row.width,
        height: row.height,
        bytes: row.bytes,
        processedAt: row.processedAt,
        bitmapWidth: bitmap.width,
        bitmapHeight: bitmap.height,
        byteText: new TextDecoder('latin1').decode(bytes),
      }
      bitmap.close()
      return result
    } finally {
      database.close()
    }
  }, databaseName as string)

  expect(['image/webp', 'image/jpeg']).toContain(photo.type)
  expect(photo.size).toBeLessThanOrEqual(1_500_000)
  expect(photo).toMatchObject({
    width: 40,
    height: 80,
    bytes: photo.size,
    bitmapWidth: 40,
    bitmapHeight: 80,
  })
  expect(photo.processedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  expect(photo.byteText).not.toContain('Exif')
  expect(photo.byteText).not.toContain('EXIF')
  expect(photo.byteText).not.toContain(PRIVATE_SOURCE_MARKER)

  await page.reload()
  const savedImage = page.getByRole('img', { name: '方向纠正测试的剪后照片' })
  await expect(savedImage).toBeVisible()
  const displayed = await savedImage.evaluate((image) => {
    const photo = image as HTMLImageElement
    const canvas = document.createElement('canvas')
    canvas.width = photo.naturalWidth
    canvas.height = photo.naturalHeight
    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error('Display verification canvas unavailable')
    }
    context.drawImage(photo, 0, 0)
    return {
      width: photo.naturalWidth,
      height: photo.naturalHeight,
      top: [...context.getImageData(20, 20, 1, 1).data],
      bottom: [...context.getImageData(20, 60, 1, 1).data],
    }
  })
  expect(displayed).toMatchObject({ width: 40, height: 80 })
  expect(displayed.top[0]).toBeGreaterThan(displayed.top[2] ?? 0)
  expect(displayed.bottom[2]).toBeGreaterThan(displayed.bottom[0] ?? 0)
  await page.screenshot({ path: testInfo.outputPath('m3a-local-image-390x844.png'), fullPage: true })

  const externalRequests = requests.filter(({ url }) => {
    const parsed = new URL(url)
    return ['http:', 'https:'].includes(parsed.protocol)
      && parsed.origin !== new URL(baseURL as string).origin
  })
  expect(externalRequests).toEqual([])
  expect(requests.some(({ body }) => body?.includes(Buffer.from(PRIVATE_SOURCE_MARKER)))).toBe(false)
})

test('builds a personal photo passport and keeps the haircut record mobile-first', async ({ page }, testInfo) => {
  await page.goto('/archive/profile')
  await page.getByLabel('称呼').fill('小林')
  await openProfileStep(page, 1)
  await page.getByLabel('性别（用于筛选，可不透露）').selectOption('woman')
  await page.getByLabel('更喜欢的呈现感觉').selectOption('androgynous')
  await openProfileStep(page, 2)
  await page.getByLabel('发质').selectOption('straight')
  await page.getByLabel('发丝粗细').selectOption('fine')
  await page.getByLabel('发量').selectOption('medium')
  await page.getByLabel('日常打理分钟').fill('5')
  await page.getByLabel('洗发频率').selectOption('every_other_day')
  await page.locator('.profile-photo-slot input[type="file"]').first().setInputFiles(
    path.resolve('public/demo/persona-ran-sidepart.webp'),
  )
  await expect(page.getByRole('img', { name: '我的头发正面照片' })).toBeVisible()
  await waitForSettledRoute(page)
  await page.screenshot({ path: testInfo.outputPath('profile-passport-390x844.png'), fullPage: true })
  await page.getByRole('button', { name: '保存档案' }).click()

  await expect(page.getByRole('heading', { level: 2, name: '小林的发型档案' })).toBeVisible()
  await expect(page.getByRole('img', { name: '我的头发正面照片' })).toBeVisible()
  await expect(page.getByText('性别：女')).toBeVisible()
  await expect(page.getByText('更喜欢中性呈现')).toBeVisible()
  await expect(page.getByText('已保存正面照；以后可以再补侧面、后脑。')).toBeVisible()
  await expect(page.getByRole('group', { name: '小林的头发照片墙' })).toBeVisible()
  await waitForSettledRoute(page)
  await page.screenshot({ path: testInfo.outputPath('archive-photo-wall-390x844.png'), fullPage: true })

  await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: '找发型' }).click()
  await expect(page.getByText(/已根据 小林 的发质、偏好和打理时间在本机排序/)).toBeVisible()
  await expect(page.locator('.hairstyle-tile__match').first()).toContainText('为你推荐：')
  await waitForSettledRoute(page)
  await page.screenshot({ path: testInfo.outputPath('personalized-library-390x844.png'), fullPage: true })

  await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: '档案' }).click()
  await page.getByRole('link', { name: '记录这次理发' }).click()
  await expect(page.locator('.record-photos input[type="file"]')).toHaveCount(2)
  await expect(page.getByText('剪前照片', { exact: true })).toBeVisible()
  await expect(page.getByText('剪后照片', { exact: true })).toBeVisible()
  await expect(page.getByText('理发中照片')).toHaveCount(0)
  await expect(page.getByText('洗后照片')).toHaveCount(0)
  await expect(page.getByText('第 7 天照片')).toHaveCount(0)
  await expect(page.getByLabel('店铺位置（可选）')).toBeHidden()
  await page.getByText('在哪剪的（可选）', { exact: true }).click()
  await expect(page.getByLabel('店铺位置（可选）')).toBeVisible()
  await expect(page.getByText('更多记录（可选）', { exact: true })).toBeVisible()
  await expect(page.getByLabel('满意度')).toHaveValue('')
  await expect(page.getByLabel('就这样')).not.toBeChecked()
  await expect(page.getByLabel('有一点要改')).not.toBeChecked()
  await expect(page.getByLabel('别再这样')).not.toBeChecked()
  await expect(page.getByLabel('就这样').locator('..')).toHaveAttribute('data-tactile', 'true')
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await waitForSettledRoute(page)
  await page.screenshot({ path: testInfo.outputPath('record-before-after-390x844.png'), fullPage: true })

  await page.goto('/archive')
  for (const width of [360, 430]) {
    await page.setViewportSize({ width, height: 844 })
    await waitForSettledRoute(page)
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const navigation = page.getByRole('navigation', { name: '主导航' })
    await expect(navigation).toBeVisible()
    const navigationBox = await navigation.boundingBox()
    expect(navigationBox?.y).toBeGreaterThanOrEqual(0)
    expect((navigationBox?.y ?? 0) + (navigationBox?.height ?? 0)).toBeLessThanOrEqual(844)
    await page.screenshot({
      path: testInfo.outputPath(`archive-photo-wall-${width}x844.png`),
      fullPage: false,
    })
  }
})
