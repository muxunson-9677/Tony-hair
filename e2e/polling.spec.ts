import { expect, test, type BrowserContext, type Page, type TestInfo } from '@playwright/test'

const pollId = 'public_poll_id_1234567890'
const optionIds = [
  '123e4567-e89b-42d3-a456-426614174000',
  '223e4567-e89b-42d3-a456-426614174000',
]

const publicPoll = {
  pollId,
  title: '帮我选：夏末短发计划',
  expiresAt: '2026-08-17T04:00:00.000Z',
  viewerHasVoted: false,
  options: [
    {
      id: optionIds[0],
      label: '齐颌短鲍伯',
      disclosure: 'demo',
      imageUrl: '/demo/persona-lin-bob.webp',
    },
    {
      id: optionIds[1],
      label: '纹理短碎发',
      disclosure: 'demo',
      imageUrl: '/demo/persona-ran-crop.webp',
    },
  ],
}

const createArchivePlan = async (page: Page) => {
  await page.goto('/archive')
  await page.getByRole('link', { name: '建立档案' }).click()
  await page.getByLabel('称呼').fill('小林')
  await page.getByLabel('发质').selectOption('wavy')
  await page.getByLabel('发丝粗细').selectOption('fine')
  await page.getByLabel('发量').selectOption('medium')
  await page.getByLabel('日常打理分钟').fill('8')
  await page.getByLabel('洗发频率').selectOption('every_other_day')
  await page.getByRole('button', { name: '保存档案' }).click()
  await page.getByRole('link', { name: '新建发型计划' }).click()
  await page.getByLabel('计划标题').fill('夏末短发计划')
  await page.getByLabel('计划日期').fill('2026-08-22')
  await page.getByLabel('计划状态').selectOption('ready')
  await page.getByRole('button', { name: '加入候选：齐颌短鲍伯' }).click()
  await page.getByRole('button', { name: '加入候选：纹理短碎发' }).click()
  await page.getByRole('button', { name: '保存计划' }).click()
  await page.getByRole('link', { name: '发起好友投票' }).click()
}

const expectPublicPollVisualReady = async (page: Page) => {
  await expect(page.locator('.route-enter-active')).toHaveCount(0)
  await expect(page.locator('.app-shell')).toHaveClass(/app-shell--wide/u)
  await expect.poll(async () => page.locator('.public-poll-view').evaluate((view) => {
    const header = view.querySelector('.public-poll-header')
    const viewStyle = getComputedStyle(view)
    const headerStyle = header ? getComputedStyle(header) : null
    return {
      opacity: viewStyle.opacity,
      background: headerStyle?.backgroundColor,
      color: headerStyle?.color,
    }
  })).toEqual({
    opacity: '1',
    background: 'rgb(23, 21, 18)',
    color: 'rgb(243, 239, 229)',
  })
}

const createLifecycleApi = () => {
  const uploadIds: string[] = []
  const uploadedBodies: Buffer[] = []
  const assets = new Map<string, string>()
  let uploadAttempts = 0
  let viewerHasVoted = false
  let revoked = false
  let managementToken = ''

  const install = async (context: BrowserContext) => {
    await context.route('**/mediapipe/models/**', async (route) => route.abort())
    await context.route('**/api/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const method = request.method()

    if (url.pathname === '/api/access/verify' && method === 'POST') {
      expect(request.postDataJSON()).toEqual({ code: 'demo-code' })
      await route.fulfill({ status: 200, json: { expiresAt: '2026-08-10T06:00:00.000Z' } })
      return
    }

    if (url.pathname === '/api/uploads/masked' && method === 'POST') {
      uploadAttempts += 1
      const uploadId = request.headers()['x-upload-id'] ?? ''
      const body = request.postDataBuffer() ?? Buffer.alloc(0)
      uploadIds.push(uploadId)
      uploadedBodies.push(body)
      expect(uploadId.length).toBeGreaterThanOrEqual(20)
      expect(request.headers()['content-type']).toMatch(/^image\/(webp|jpeg)$/u)
      expect(body.byteLength).toBeGreaterThan(100)
      expect(body.byteLength).toBeLessThanOrEqual(1_500_000)
      if (uploadAttempts === 1) {
        await route.fulfill({
          status: 503,
          json: { error: { code: 'BLOB_UNAVAILABLE', message: 'upload unavailable' } },
        })
        return
      }
      const wasExisting = assets.has(uploadId)
      const assetId = assets.get(uploadId) ?? optionIds[assets.size]!
      assets.set(uploadId, assetId)
      await route.fulfill({
        status: 201,
        json: {
          uploadId,
          assetId,
          url: `/masked/${assetId}.webp`,
          bytes: body.byteLength,
          contentType: request.headers()['content-type'],
          idempotent: wasExisting,
        },
      })
      return
    }

    if (url.pathname === '/api/polls' && method === 'POST') {
      managementToken = request.headers()['x-poll-management-token'] ?? ''
      const body = request.postDataJSON() as {
        clientRequestId: string
        title: string
        options: { assetId: string; label: string; disclosure: string }[]
      }
      expect(managementToken.length).toBeGreaterThanOrEqual(40)
      expect(JSON.stringify(body)).not.toContain(managementToken)
      expect(body.clientRequestId.length).toBeGreaterThanOrEqual(20)
      expect(body.title).toBe(publicPoll.title)
      expect(body.options.map(({ disclosure }) => disclosure)).toEqual(['demo', 'demo'])
      expect(body.options.map(({ assetId }) => assetId).sort()).toEqual([...optionIds].sort())
      await route.fulfill({
        status: 201,
        json: { pollId, expiresAt: publicPoll.expiresAt, idempotent: false },
      })
      return
    }

    if (url.pathname === `/api/polls/${pollId}/results` && method === 'GET') {
      expect(request.headers()['x-poll-management-token']).toBe(managementToken)
      await route.fulfill({
        status: 200,
        json: {
          total: viewerHasVoted ? 1 : 0,
          none: 0,
          options: optionIds.map((optionId, index) => ({
            optionId,
            votes: viewerHasVoted && index === 0 ? 1 : 0,
          })),
          comments: viewerHasVoted
            ? [{ comment: '第一张更利落', createdAt: '2026-08-10T05:00:00.000Z' }]
            : [],
        },
      })
      return
    }

    if (url.pathname === `/api/polls/${pollId}/votes` && method === 'POST') {
      expect(request.postDataJSON()).toEqual({ optionId: optionIds[0], comment: '第一张更利落' })
      if (viewerHasVoted) {
        await route.fulfill({ status: 409, json: { error: { code: 'ALREADY_VOTED' } } })
      } else {
        viewerHasVoted = true
        await route.fulfill({ status: 201, json: { accepted: true } })
      }
      return
    }

    if (url.pathname === `/api/polls/${pollId}` && method === 'DELETE') {
      expect(request.headers()['x-poll-management-token']).toBe(managementToken)
      revoked = true
      await route.fulfill({ status: 204 })
      return
    }

    if (url.pathname === `/api/polls/${pollId}` && method === 'GET') {
      if (revoked) {
        await route.fulfill({ status: 410, json: { error: { code: 'POLL_GONE' } } })
      } else {
        await route.fulfill({ status: 200, json: { ...publicPoll, viewerHasVoted } })
      }
      return
    }

      await route.fulfill({ status: 404, json: { error: { code: 'NOT_MOCKED' } } })
    })
  }

  return { install, uploadIds, uploadedBodies }
}

test('completes create, failed-upload recovery, cross-context friend vote, results, and revoke', async ({ browser, context, page }, testInfo) => {
  test.slow()
  const network = createLifecycleApi()
  await network.install(context)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 390, height: 844 })
  await createArchivePlan(page)

  await expect(page.getByRole('navigation', { name: '主导航' })).toBeHidden()
  await page.getByLabel('体验码').fill('demo-code')
  await page.getByRole('button', { name: '验证体验码' }).click()
  await page.getByRole('checkbox', { name: /已满 18 岁/ }).check()
  await page.getByRole('button', { name: '开始逐张遮罩' }).click()

  for (const position of ['01 / 02', '02 / 02']) {
    await expect(page.getByText(position)).toBeVisible()
    const exportButton = page.getByRole('button', { name: '导出单层遮罩图' })
    await expect(exportButton).toBeVisible()
    await exportButton.click()
  }

  await expect(page.getByRole('button', { name: '上传并创建投票' })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('poll-create-ready-390x844.png'), fullPage: true })
  await page.getByRole('button', { name: '上传并创建投票' }).click()
  await expect(page.getByText('遮罩图上传失败，本地图片和上传标识已保留，可以安全重试。')).toBeVisible()
  await expect(page.getByText('可重试')).toBeVisible()
  await page.getByRole('button', { name: '上传并创建投票' }).click()

  await expect(page.getByRole('heading', { name: '把选择交给朋友' })).toBeVisible()
  expect(network.uploadIds[0]).toBe(network.uploadIds[1])
  expect(network.uploadedBodies[0]?.equals(network.uploadedBodies[1]!)).toBe(true)
  const manageLink = page.getByRole('link', { name: '查看结果并管理' })
  await manageLink.click()
  await expect(page.getByText('0 票')).toBeVisible()

  const friendContext = await browser.newContext()
  await network.install(friendContext)
  expect(await friendContext.cookies()).toEqual([])
  const friend = await friendContext.newPage()
  await friend.emulateMedia({ reducedMotion: 'reduce' })
  await friend.setViewportSize({ width: 390, height: 844 })
  await friend.goto(`/polls/${pollId}/manage`)
  await expect(friend.getByRole('heading', { name: '只能在创建投票的这台设备管理' })).toBeVisible()
  await friend.goto(`/p/${pollId}`)
  await expect(friend.getByRole('navigation', { name: '主导航' })).toBeHidden()
  await friend.getByRole('img', { name: '齐颌短鲍伯候选图' }).click()
  await expect(friend.getByRole('radio', { name: /齐颌短鲍伯/ })).toBeChecked()
  await friend.getByPlaceholder('一句话说说原因').fill('第一张更利落')
  await friend.screenshot({ path: testInfo.outputPath('poll-friend-vote-390x844.png'), fullPage: true })
  await friend.getByRole('button', { name: '提交这一票' }).click()
  await expect(friend.getByRole('heading', { name: '这一票已计入' })).toBeVisible()

  await page.setViewportSize({ width: 1280, height: 900 })
  await page.reload()
  await expect(page.getByText('1 票')).toBeVisible()
  await expect(page.getByText('第一张更利落')).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('poll-results-1280x900.png'), fullPage: true })
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: '撤销并删除投票' }).click()
  await expect(page.getByRole('heading', { name: '投票已撤销，分享图正在删除' })).toBeVisible()

  await friend.reload()
  await expect(friend.getByRole('heading', { name: '投票已结束' })).toBeVisible()
  await friendContext.close()
})

test('renders duplicate, expired-or-revoked, and offline public states without a nav', async ({ context }) => {
  await context.route(`**/api/polls/${pollId}`, async (route) => {
    await route.fulfill({ status: 200, json: { ...publicPoll, viewerHasVoted: true } })
  })
  const duplicate = await context.newPage()
  await duplicate.goto(`/p/${pollId}`)
  await expect(duplicate.getByRole('heading', { name: '这个浏览器已经投过了' })).toBeVisible()
  await expect(duplicate.getByRole('navigation', { name: '主导航' })).toBeHidden()
  await duplicate.close()

  const goneId = 'gone_poll_id_1234567890'
  await context.route(`**/api/polls/${goneId}`, async (route) => {
    await route.fulfill({ status: 410, json: { error: { code: 'POLL_GONE' } } })
  })
  const gone = await context.newPage()
  await gone.goto(`/p/${goneId}`)
  await expect(gone.getByRole('heading', { name: '投票已结束' })).toBeVisible()
  await gone.close()

  const offlineId = 'offline_poll_id_1234567890'
  await context.route(`**/api/polls/${offlineId}`, async (route) => route.abort())
  const offline = await context.newPage()
  await offline.goto(`/p/${offlineId}`)
  await expect(offline.getByRole('heading', { name: '网络不可用，尚未计票' })).toBeVisible()
  await offline.close()
})

test.describe('polling visual shell', () => {
  test.beforeEach(async ({ page }) => {
    await page.route(/\/api\/polls\//u, async (route) => {
      await route.fulfill({ status: 200, json: publicPoll })
    })
  })

  test('uses a real two-column decision surface on desktop', async ({ page }, testInfo: TestInfo) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto(`/p/${pollId}`)
    await expect(page.getByRole('heading', { name: publicPoll.title })).toBeVisible()
    await expectPublicPollVisualReady(page)

    const shellWidth = await page.locator('.app-shell').evaluate((element) => element.getBoundingClientRect().width)
    const optionColumns = await page.locator('.public-poll-options').evaluate((element) => (
      getComputedStyle(element).gridTemplateColumns.split(' ').length
    ))
    expect(shellWidth).toBeGreaterThan(800)
    expect(optionColumns).toBe(2)
    await page.screenshot({ path: testInfo.outputPath('poll-public-1280x900.png'), fullPage: true })
  })

  test('keeps the primary decision controls inside a 390px viewport', async ({ page }, testInfo: TestInfo) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`/p/${pollId}`)
    await expect(page.getByRole('button', { name: '提交这一票' })).toBeVisible()
    await expectPublicPollVisualReady(page)

    const metrics = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      buttonHeight: document.querySelector('button')?.getBoundingClientRect().height ?? 0,
    }))
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth)
    expect(metrics.buttonHeight).toBeGreaterThanOrEqual(45)
    await page.screenshot({ path: testInfo.outputPath('poll-public-390x844.png'), fullPage: true })
  })
})
