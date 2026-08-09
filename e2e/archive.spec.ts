import { expect, test } from '@playwright/test'

const TEST_DB_SESSION_KEY = '__zajianfa_e2e_archive_db__'
const databaseNames = new Map<string, string>()

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

test('persists a profile and two-demo plan through refresh, then edits and deletes only the plan', async ({
  page,
}, testInfo) => {

  await page.goto('/archive')
  await expect(page.getByText('这台设备还没有发型档案')).toBeVisible()
  await page.getByRole('link', { name: '建立档案' }).click()

  await page.getByLabel('称呼').fill('小林')
  await page.getByLabel('发质').selectOption('wavy')
  await page.getByLabel('发丝粗细').selectOption('fine')
  await page.getByLabel('发量').selectOption('medium')
  await page.getByLabel('日常打理分钟').fill('12')
  await page.getByLabel('洗发频率').selectOption('every_other_day')
  await page.getByLabel('偏好备注').fill('希望露耳，但两侧不要推白')
  await page.getByRole('button', { name: '保存档案' }).click()

  await expect(page).toHaveURL(/\/archive$/)
  await expect(page.getByRole('heading', { level: 2, name: '小林的发型档案' })).toBeVisible()
  await page.getByRole('link', { name: '新建发型计划' }).click()

  await page.getByLabel('计划标题').fill('夏末短发计划')
  await page.getByLabel('计划日期').fill('2026-08-22')
  await page.getByLabel('计划状态').selectOption('ready')
  await page.getByRole('button', { name: '加入候选：齐颌短鲍伯' }).click()
  await page.getByRole('button', { name: '加入候选：纹理短碎发' }).click()
  await expect(page.getByText('已选择 2 / 4')).toBeVisible()
  await page.getByRole('button', { name: '保存计划' }).click()

  await expect(page.getByRole('heading', { level: 1, name: '夏末短发计划' })).toBeVisible()
  await expect(page.getByRole('img', { name: /齐颌短鲍伯/ })).toBeVisible()
  await expect(page.getByRole('img', { name: /纹理短碎发/ })).toBeVisible()
  await expect(page.getByText('示例体验 · 非用户生成').first()).toBeVisible()

  await page.getByRole('link', { name: '返回档案' }).click()
  await expect(page.getByRole('heading', { level: 2, name: '小林的发型档案' })).toBeVisible()
  await page.screenshot({
    path: testInfo.outputPath('archive-390x844.png'),
  })
  await page.getByRole('link', { name: /夏末短发计划/ }).click()

  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: '夏末短发计划' })).toBeVisible()
  await expect(page.getByRole('img', { name: /齐颌短鲍伯/ })).toBeVisible()
  await expect(page.getByRole('img', { name: /纹理短碎发/ })).toBeVisible()

  await page.getByRole('link', { name: '编辑计划' }).click()
  await page.getByLabel('计划标题').fill('更新后的夏末计划')
  await page.getByRole('button', { name: '保存修改' }).click()
  await expect(page.getByRole('heading', { level: 1, name: '更新后的夏末计划' })).toBeVisible()

  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: '删除计划' }).click()
  await expect(page).toHaveURL(/\/archive$/)
  await expect(page.getByRole('heading', { level: 2, name: '小林的发型档案' })).toBeVisible()
  await expect(page.getByText('还没有发型计划')).toBeVisible()

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
        .map((target) => target.getBoundingClientRect())
        .filter(({ height, width }) => height > 0 && width > 0)
        .map(({ height }) => height)
      return {
        hasHorizontalOverflow: browser.document.documentElement.scrollWidth > browser.innerWidth,
        minimumTargetHeight: Math.min(...targetHeights),
      }
    })
    expect(layout.hasHorizontalOverflow).toBe(false)
    expect(layout.minimumTargetHeight).toBeGreaterThanOrEqual(44)
  }

})
