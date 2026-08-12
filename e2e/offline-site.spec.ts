import { expect, test, type BrowserContext, type Page } from '@playwright/test'

const TEST_DB_SESSION_KEY = '__zajianfa_e2e_archive_db__'
const WECHAT_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 MicroMessenger/8.0.49(0x18003129)'

const openProfileDetails = async (page: Page) => {
  const details = page.locator('.profile-setup-step').nth(2)
  if (await details.getAttribute('open') === null) {
    await details.locator('summary').click()
  }
}

const openPlanDetails = async (page: Page) => {
  const details = page.locator('.plan-setup-details')
  if (await details.getAttribute('open') === null) {
    await details.locator('summary').click()
  }
}

const useIsolatedDatabase = async (page: Page, testId: string, workerIndex: number) => {
  const databaseName = `zajianfa-offline-e2e-${workerIndex}-${Date.now()}-${Math.random().toString(36).slice(2)}`
  await page.addInitScript(
    ({ key, name }) => sessionStorage.setItem(key, name),
    { key: TEST_DB_SESSION_KEY, name: databaseName },
  )
  return databaseName
}

const cleanupDatabase = async (context: BrowserContext, page: Page, databaseName: string) => {
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

const createSavedBrief = async (page: Page) => {
  await page.goto('/archive')
  await page.getByRole('link', { name: '建立档案' }).click()
  await page.getByLabel('称呼').fill('小离')
  await openProfileDetails(page)
  await page.getByLabel('发质').selectOption('wavy')
  await page.getByLabel('发丝粗细').selectOption('fine')
  await page.getByLabel('发量').selectOption('medium')
  await page.getByLabel('日常打理分钟').fill('10')
  await page.getByLabel('洗发频率').selectOption('every_other_day')
  await page.getByRole('button', { name: '保存档案' }).click()

  await page.getByRole('link', { name: '准备下次怎么剪' }).click()
  await openPlanDetails(page)
  await page.getByLabel('计划标题').fill('到店断网计划')
  await page.getByRole('button', { name: '加入候选：齐颌短鲍伯' }).click()
  await page.getByText('继续添加或更换候选').click()
  await page.getByRole('button', { name: '加入候选：纹理短碎发' }).click()
  await page.getByRole('button', { name: '保存计划' }).click()

  await page.getByRole('link', { name: '准备给理发师看的内容' }).click()
  await page.getByLabel('目标候选：齐颌短鲍伯').check()
  await page.getByRole('button', { name: '保存Tony卡' }).click()
  await expect(page.getByText('Tony卡已保存在当前设备，到店直接打开。')).toBeVisible()

  const planId = /\/archive\/plans\/([^/]+)\/brief/.exec(page.url())?.[1]
  expect(planId).toBeTruthy()
  return planId as string
}

test('reopens the barber card fully offline and stays readable in landscape', async ({
  context,
  page,
}, testInfo) => {
  test.setTimeout(120_000)
  const databaseName = await useIsolatedDatabase(page, testInfo.testId, testInfo.workerIndex)
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: {
        request: async () => {
          ;(window as unknown as { __wakeLockRequests: number }).__wakeLockRequests
            = ((window as unknown as { __wakeLockRequests?: number }).__wakeLockRequests ?? 0) + 1
          return { release: async () => {} }
        },
      },
    })
  })

  try {
    const planId = await createSavedBrief(page)

    // 等待 SW 激活且外壳缓存完成：就绪指示必须真实变绿。
    await expect(async () => {
      await page.reload()
      await expect(page.getByTestId('offline-readiness').first()).toHaveText(
        /已准备好，到店断网也能打开/,
        { timeout: 3_000 },
      )
    }).toPass({ timeout: 45_000 })

    await page.getByRole('link', { name: '到店打开' }).click()
    await expect(page).toHaveURL(/\/brief\/show$/)
    await expect(page.getByTestId('wake-lock-status')).toHaveText('✓ 屏幕保持常亮中')
    expect(await page.evaluate(() => (window as unknown as { __wakeLockRequests?: number }).__wakeLockRequests)).toBeGreaterThan(0)

    // 断网重开现场页：Tony卡必须完整可见。
    await context.setOffline(true)
    await page.reload()
    await expect(page.getByRole('navigation', { name: '理发现场操作' })).toBeVisible()
    await expect(page.getByRole('img', { name: '齐颌短鲍伯目标参考图' })).toBeVisible()
    await expect(page.getByRole('heading', { name: '最在意' })).toBeVisible()
    await expect(page.getByRole('heading', { name: '绝对不要' })).toBeVisible()
    await expect(page.getByText('目标方案 · 齐颌短鲍伯')).toBeVisible()
    await expect(page.locator('.brief-barber-details')).not.toHaveAttribute('open', '')
    await page.screenshot({ path: testInfo.outputPath('offline-barber-390x844.png'), fullPage: true })

    // 断网直接打开深链也要能进现场页。
    await page.goto(`/archive/plans/${planId}/brief/show`)
    await expect(page.getByRole('img', { name: '齐颌短鲍伯目标参考图' })).toBeVisible()

    // 横屏可读：图左信息右，无横向溢出。
    await page.setViewportSize({ width: 844, height: 390 })
    await expect(page.getByRole('img', { name: '齐颌短鲍伯目标参考图' })).toBeVisible()
    await expect(page.getByRole('heading', { name: '最在意' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath('offline-barber-landscape-844x390.png'), fullPage: true })

    await context.setOffline(false)
  } finally {
    await context.setOffline(false)
    await cleanupDatabase(context, page, databaseName)
  }
})

test('degrades honestly: no service worker means no offline promise, no wake lock means a hint', async ({
  context,
  page,
}, testInfo) => {
  test.setTimeout(90_000)
  const databaseName = await useIsolatedDatabase(page, testInfo.testId, testInfo.workerIndex)
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, get: () => undefined })
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: undefined })
  })

  try {
    await createSavedBrief(page)
    await expect(page.getByTestId('offline-readiness').first()).toHaveText(
      '这个浏览器不支持离线缓存，建议导出 PNG 备用',
    )

    await page.getByRole('link', { name: '到店打开' }).click()
    await expect(page.getByTestId('wake-lock-status')).toHaveText(
      '这台设备不能自动常亮，建议先调长自动锁屏时间',
    )
    await page.screenshot({ path: testInfo.outputPath('offline-degraded-390x844.png'), fullPage: true })
  } finally {
    await cleanupDatabase(context, page, databaseName)
  }
})

test.describe('WeChat built-in browser', () => {
  test.use({ userAgent: WECHAT_UA })

  test('pushes the PNG export fallback instead of promising offline', async ({
    context,
    page,
  }, testInfo) => {
    test.setTimeout(90_000)
    const databaseName = await useIsolatedDatabase(page, testInfo.testId, testInfo.workerIndex)
    try {
      await createSavedBrief(page)
      await expect(page.getByTestId('offline-readiness').first()).toHaveText(
        '微信内浏览器离线不可靠，请先导出 PNG 存进相册',
      )
      await expect(page.getByRole('button', { name: '导出 PNG' })).toBeVisible()

      await page.getByRole('link', { name: '到店打开' }).click()
      await expect(page.getByTestId('offline-readiness')).toHaveText(
        '微信内浏览器离线不可靠，请先导出 PNG 存进相册',
      )
      await expect(page.getByRole('button', { name: '保存图片备用' })).toBeVisible()
      await page.screenshot({ path: testInfo.outputPath('offline-wechat-390x844.png'), fullPage: true })
    } finally {
      await cleanupDatabase(context, page, databaseName)
    }
  })
})
