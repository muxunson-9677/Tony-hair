/// <reference lib="dom" />

import { expect, test } from '@playwright/test'

const TEST_DB_SESSION_KEY = '__zajianfa_e2e_archive_db__'

const waitForSettledRoute = async (page: import('@playwright/test').Page) => {
  await expect(page.locator('.route-enter-active, .route-leave-active')).toHaveCount(0)
}

const SHOT_DIR = 'docs/superpowers/reports/assets/2026-08-13-visual-overhaul'

test('captures the visual overhaul tour at 390px', async ({ context, page }) => {
  test.setTimeout(120_000)
  const databaseName = `zajianfa-tour-${Date.now()}-${crypto.randomUUID()}`
  await page.addInitScript(
    ({ key, name }) => sessionStorage.setItem(key, name),
    { key: TEST_DB_SESSION_KEY, name: databaseName },
  )
  const shot = async (name: string) => {
    await waitForSettledRoute(page)
    await page.screenshot({ path: `${SHOT_DIR}/${name}.png`, fullPage: true })
  }

  try {
    await page.goto('/')
    await expect(page.getByRole('link', { name: '先认识一下我的头发' })).toBeVisible()
    await shot('01-home-new-user')

    await page.goto('/try')
    await expect(page.getByRole('heading', { name: '示例方向对比' })).toBeVisible()
    await shot('02-try-demo')

    await page.goto('/archive')
    await expect(page.getByText('这台设备还没有发型档案')).toBeVisible()
    await shot('03-archive-empty')

    await page.goto('/archive/profile')
    await page.getByLabel('称呼').fill('小林')
    await shot('04-profile-step1')

    const steps = page.locator('.profile-setup-step')
    await steps.nth(1).locator('summary').click()
    await page.getByRole('radio', { name: /柔和一点/ }).check()
    await shot('05-profile-step2-feel')

    await steps.nth(2).locator('summary').click()
    await page.getByRole('radio', { name: /有点弯/ }).check()
    await page.getByRole('radio', { name: /发丝细/ }).check()
    await page.getByRole('radio', { name: /发量正常/ }).check()
    await page.getByRole('radio', { name: /隔天洗/ }).check()
    await page.getByRole('radio', { name: /10 分钟左右/ }).check()
    await shot('06-profile-step3-tiles')
    const closeup = async (legend: string, name: string) => {
      const group = page.getByRole('group', { name: legend })
      await group.scrollIntoViewIfNeeded()
      await group.screenshot({ path: `${SHOT_DIR}/${name}.png` })
    }
    await closeup('想要哪种感觉的发型？', '06a-tiles-feel')
    await closeup('你的头发平时是什么样？', '06b-tiles-texture')
    await closeup('头发整体多不多？', '06c-tiles-density')
    await closeup('多久洗一次头？', '06d-tiles-wash')
    await closeup('每天愿意花多久打理头发？', '06e-tiles-time')

    await page.getByRole('button', { name: '保存档案' }).click()
    await expect(page).toHaveURL(/\/archive$/)
    await expect(page.getByRole('heading', { level: 2, name: '小林的发型档案' })).toBeVisible()
    await shot('07-archive-summary')

    await page.goto('/')
    await expect(page.getByTestId('home-primary-action')).toBeVisible()
    await shot('08-home-with-profile')

    await page.goto('/styles')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await shot('09-style-library')

    await page.goto('/archive/plans/new')
    await page.locator('.plan-setup-details summary').click()
    await page.getByLabel('计划标题').fill('夏末短发计划')
    await page.getByLabel('计划日期').fill('2026-08-22')
    await page.getByLabel('计划状态').selectOption('ready')
    await page.getByRole('button', { name: '加入候选：齐颌短鲍伯' }).click()
    await page.getByText('继续添加或更换候选').click()
    await page.getByRole('button', { name: '加入候选：纹理短碎发' }).click()
    await page.getByRole('button', { name: '保存计划' }).click()
    await expect(page.getByRole('heading', { level: 1, name: '夏末短发计划' })).toBeVisible()
    await shot('10-plan-detail')

    await page.getByRole('link', { name: '准备给理发师看的内容' }).click()
    await page.getByLabel('目标候选：齐颌短鲍伯').check()
    await page.getByRole('button', { name: '保存Tony卡' }).click()
    await expect(page.getByRole('link', { name: '到店打开' })).toBeVisible()
    await shot('11-tony-card-preview')

    await page.getByRole('link', { name: '到店打开' }).click()
    await expect(page).toHaveURL(/\/brief\/show$/)
    await shot('12-tony-card-show')
  } finally {
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
})
