import { stat } from 'node:fs/promises'
import path from 'node:path'

import { expect, test, type Page, type TestInfo } from '@playwright/test'

const TEST_DB_SESSION_KEY = '__zajianfa_e2e_archive_db__'
const databaseNames = new Map<string, string>()

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

const createProfile = async (page: Page, name: string) => {
  await page.goto('/archive/profile')
  await page.getByLabel('称呼').fill(name)
  await openProfileStep(page, 2)
  await page.getByRole('radio', { name: /有点弯/ }).check()
  await page.getByRole('radio', { name: /发丝细/ }).check()
  await page.getByRole('radio', { name: /发量正常/ }).check()
  await page.getByRole('radio', { name: /10 分钟左右/ }).check()
  await page.getByRole('radio', { name: /隔天洗/ }).check()
  await page.getByRole('button', { name: '保存档案' }).click()
  await expect(page).toHaveURL(/\/archive$/)
}

const captureTraffic = (page: Page, origin: string) => {
  const external: string[] = []
  const writes: string[] = []
  page.on('request', (request) => {
    const parsed = new URL(request.url())
    if (['http:', 'https:'].includes(parsed.protocol) && parsed.origin !== origin) {
      external.push(request.url())
    }
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())) {
      writes.push(`${request.method()} ${request.url()}`)
    }
  })
  return { external, writes }
}

const createAvoidRecordWithPhotos = async (page: Page, styleName: string) => {
  await page.goto('/archive/records/new')
  await page.getByText('日期、名称和满意度', { exact: true }).click()
  await page.getByLabel('发型名').fill(styleName)
  await page.getByLabel('剪前照片').setInputFiles(path.resolve('public/demo/persona-lin-base.webp'))
  await page.getByLabel('剪后照片').setInputFiles(path.resolve('public/demo/persona-ran-sidepart.webp'))
  await expect(page.getByText(/已在本地处理/).nth(1)).toBeVisible()
  await page.getByLabel('别再这样').check()
  await page.getByLabel('避雷规则 1').fill('两侧不要推白')

  // 加一个区域标注，让避雷图带打标圆点。
  await page.getByRole('button', { name: '在剪后照片上点选问题位置' })
    .click({ position: { x: 120, y: 180 } })
  const panel = page.getByRole('group', { name: '新标注' })
  await panel.getByRole('button', { name: '两侧', exact: true }).click()
  await panel.getByRole('button', { name: '太短', exact: true }).click()
  await panel.getByRole('button', { name: '添加标注' }).click()

  await page.getByRole('button', { name: '保存剪后记录' }).click()
  await expect(page.getByRole('heading', { level: 1, name: styleName })).toBeVisible()
}

const generateAndExport = async (
  page: Page,
  testInfo: TestInfo,
  kind: string,
  options: { expectMasked?: boolean } = {},
) => {
  const card = page.locator(`[data-share-kind="${kind}"]`)
  await card.getByRole('button', { name: /生成图片|重新生成/ }).click()
  await expect(card.locator('.share-card__preview img')).toBeVisible({ timeout: 60_000 })
  if (options.expectMasked) {
    await expect(card.getByText('已自动遮住脸部')).toBeVisible()
  }
  await card.scrollIntoViewIfNeeded()
  await page.screenshot({ path: testInfo.outputPath(`share-${kind}-preview-390x844.png`) })

  const downloadPromise = page.waitForEvent('download')
  await card.getByRole('button', { name: '分享 / 保存图片' }).click()
  const download = await downloadPromise
  const artifact = testInfo.outputPath(`share-${kind}.png`)
  await download.saveAs(artifact)
  expect(download.suggestedFilename()).toMatch(/^Tony宝-.*\.png$/)
  expect((await stat(artifact)).size).toBeGreaterThan(0)
  await expect(card.getByText('PNG 已开始下载。')).toBeVisible()
}

test.beforeEach(async ({ page }, testInfo) => {
  const databaseName = `zajianfa-share-e2e-${testInfo.workerIndex}-${Date.now()}-${Math.random().toString(36).slice(2)}`
  databaseNames.set(testInfo.testId, databaseName)
  await page.addInitScript(
    ({ key, name }) => sessionStorage.setItem(key, name),
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
      const request = indexedDB.deleteDatabase(name)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
      request.onblocked = () => reject(new Error(`Database cleanup blocked: ${name}`))
    })
  }, databaseName)
  await cleanupPage.close()
})

test('record flow: compare, review and avoid cards generate with auto masks and export locally', async ({
  baseURL,
  page,
}, testInfo) => {
  test.setTimeout(180_000)
  const traffic = captureTraffic(page, new URL(baseURL as string).origin)
  await createProfile(page, '阿享')
  await createAvoidRecordWithPhotos(page, '翻车短发')

  // 入口 1：保存成功归因提示区。
  await expect(page.getByRole('link', { name: '去做分享图' })).toBeVisible()
  // 入口 2：记录详情操作区。
  await page.getByRole('link', { name: '分享这次理发' }).click()
  await expect(page.getByRole('heading', { level: 1, name: '分享工作室' })).toBeVisible()
  await expect(page.getByText('图片在本机生成，不会上传')).toBeVisible()

  await expect(page.locator('[data-share-kind="compare"]')).toBeVisible()
  await expect(page.locator('[data-share-kind="review"]')).toBeVisible()
  await expect(page.locator('[data-share-kind="avoid"]')).toBeVisible()
  await expect(page.getByText('将自动为人脸打上遮罩').first()).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('share-studio-record-390x844.png'), fullPage: true })

  await generateAndExport(page, testInfo, 'compare', { expectMasked: true })
  await generateAndExport(page, testInfo, 'review', { expectMasked: true })
  await generateAndExport(page, testInfo, 'avoid', { expectMasked: true })

  expect(traffic.external).toEqual([])
  expect(traffic.writes).toEqual([])
})

test('plan flow: brief and choose cards generate from the Tony card entry and export locally', async ({
  baseURL,
  page,
}, testInfo) => {
  test.setTimeout(180_000)
  const traffic = captureTraffic(page, new URL(baseURL as string).origin)
  await createProfile(page, '阿卡')

  await page.getByRole('link', { name: '准备下次怎么剪' }).click()
  await openPlanDetails(page)
  await page.getByLabel('计划标题').fill('分享验证计划')
  await page.getByLabel('计划日期').fill('2026-08-22')
  await page.getByRole('button', { name: '加入候选：齐颌短鲍伯' }).click()
  await page.getByText('继续添加或更换候选').click()
  await page.getByRole('button', { name: '加入候选：纹理短碎发' }).click()
  await page.getByRole('button', { name: '保存计划' }).click()

  await page.getByRole('link', { name: '准备给理发师看的内容' }).click()
  await page.getByLabel('目标候选：纹理短碎发').check()
  await page.getByText('需要修改时展开').click()
  await page.getByLabel('最在意 1', { exact: true }).fill('两侧不要炸')
  await page.getByLabel('绝对不要 1', { exact: true }).fill('不要推白')
  await page.getByRole('button', { name: '保存Tony卡' }).click()
  await expect(page.getByRole('heading', { level: 1, name: '编辑Tony卡' })).toBeVisible()

  // 入口 3：Tony卡页脚。
  await page.getByRole('link', { name: '分享Tony卡' }).click()
  await expect(page.getByRole('heading', { level: 1, name: '分享工作室' })).toBeVisible()
  await expect(page.locator('[data-share-kind="brief"]')).toBeVisible()
  await expect(page.locator('[data-share-kind="choose"]')).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('share-studio-plan-390x844.png'), fullPage: true })

  await generateAndExport(page, testInfo, 'brief')
  await generateAndExport(page, testInfo, 'choose')

  // 帮我选：只产图，站内无任何投票交互。
  await expect(page.getByText(/投票/)).toHaveCount(0)

  expect(traffic.external).toEqual([])
  expect(traffic.writes).toEqual([])
})

test('multi-face photos are hard-blocked with a reason instead of a share image', async ({
  page,
}) => {
  test.setTimeout(180_000)
  await createProfile(page, '阿拦')

  // 先进入页面构造双人脸样张（与隐私遮罩 e2e 相同做法）。
  await page.goto('/')
  const twoFaceBytes = await page.evaluate(async () => {
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
  })

  await page.goto('/archive/records/new')
  await page.getByText('日期、名称和满意度', { exact: true }).click()
  await page.getByLabel('发型名').fill('合照测试')
  await page.getByLabel('剪后照片').setInputFiles({
    name: 'two-faces.webp',
    mimeType: 'image/webp',
    buffer: Buffer.from(twoFaceBytes),
  })
  await expect(page.getByText(/已在本地处理/)).toBeVisible()
  await page.getByLabel('有一点要改').check()
  await page.getByLabel('下次调整 1').fill('下次别带朋友入镜')
  await page.getByRole('button', { name: '保存剪后记录' }).click()
  await expect(page.getByRole('heading', { level: 1, name: '合照测试' })).toBeVisible()

  await page.getByRole('link', { name: '分享这次理发' }).click()
  const reviewCard = page.locator('[data-share-kind="review"]')
  await reviewCard.getByRole('button', { name: '生成图片' }).click()
  await expect(reviewCard.getByText('照片里有多张人脸，为保护隐私暂不支持分享这张'))
    .toBeVisible({ timeout: 60_000 })
  await expect(reviewCard.locator('.share-card__preview img')).toHaveCount(0)
  await expect(reviewCard.getByRole('button', { name: /生成/ })).toHaveCount(0)
})

test('avoid card renders under 3 seconds with a warm detector on 4x throttled CPU', async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000)
  await createProfile(page, '阿速')
  await createAvoidRecordWithPhotos(page, '性能样张')

  await page.getByRole('link', { name: '分享这次理发' }).click()
  await expect(page.getByRole('heading', { level: 1, name: '分享工作室' })).toBeVisible()

  // 预热：复盘图先触发人脸检测（结果按照片缓存，符合设计的一次推理策略）。
  const reviewCard = page.locator('[data-share-kind="review"]')
  await reviewCard.getByRole('button', { name: '生成图片' }).click()
  await expect(reviewCard.locator('.share-card__preview img')).toBeVisible({ timeout: 120_000 })

  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  try {
    const avoidCard = page.locator('[data-share-kind="avoid"]')
    const startedAt = Date.now()
    await avoidCard.getByRole('button', { name: '生成图片' }).click()
    await expect(avoidCard.locator('.share-card__preview img')).toBeVisible({ timeout: 10_000 })
    const elapsedMs = Date.now() - startedAt
    testInfo.annotations.push({ type: 'avoid-card-generation-ms', description: String(elapsedMs) })
    expect(elapsedMs).toBeLessThan(3_000)
  } finally {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
    await cdp.detach()
  }
})

test('the home page carries no share studio entry', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('link', { name: /分享/ })).toHaveCount(0)
  await expect(page.locator('a[href*="/archive/share"]')).toHaveCount(0)
})
