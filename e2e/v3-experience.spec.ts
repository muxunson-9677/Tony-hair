/// <reference lib="dom" />

import { expect, test } from '@playwright/test'

const TEST_DB_SESSION_KEY = '__zajianfa_e2e_archive_db__'

const waitForSettledRoute = async (page: import('@playwright/test').Page) => {
  await expect(page.locator('.route-enter-active, .route-leave-active')).toHaveCount(0)
}

test('completes the V3 choose, compare, barber, and adjustment journey on a phone', async ({ context, page }, testInfo) => {
  test.setTimeout(60_000)
  const databaseName = `zajianfa-v3-${Date.now()}-${crypto.randomUUID()}`
  await page.addInitScript(
    ({ key, name }) => sessionStorage.setItem(key, name),
    { key: TEST_DB_SESSION_KEY, name: databaseName },
  )

  try {
    await page.goto('/')
    await expect(page.getByRole('link', { name: '先认识一下我的头发' })).toBeVisible()
    await expect(page.getByRole('link', { name: /先看一个对比示例/ })).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath('v3-home-new-390x844.png'), fullPage: true })

    await page.getByRole('link', { name: '先认识一下我的头发' }).click()
    await page.getByLabel('称呼').fill('林夏')
    await expect(page.getByText('先保存，其他以后再补')).toBeVisible()
    await expect(page.getByRole('group', { name: '你的头发平时是什么样？' })).toBeHidden()
    await page.screenshot({ path: testInfo.outputPath('v3-profile-minimum-390x844.png'), fullPage: true })
    await page.getByRole('button', { name: '保存档案' }).click()

    await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: '首页' }).click()
    await page.getByTestId('home-primary-action').click()
    await expect(page.getByRole('group', { name: '这次最想解决什么？' })).toBeVisible()
    await page.getByRole('button', { name: '每天少打理' }).click()
    await page.getByRole('button', { name: '5 分钟以内' }).click()
    await page.getByRole('button', { name: '有变化，但别太冒险' }).click()
    await expect(page.getByRole('heading', { name: '先比较这三个方向' })).toBeVisible()
    await expect(page.getByText('最稳妥')).toBeVisible()
    await expect(page.getByText('最符合目标')).toBeVisible()
    await expect(page.getByText('最值得尝试')).toBeVisible()
    const recommendedNames = await page.locator('.guided-direction-list h3').allTextContents()
    expect(recommendedNames).toHaveLength(3)
    expect(new Set(recommendedNames).size).toBe(3)
    for (const viewport of [360, 390, 430]) {
      await page.setViewportSize({ width: viewport, height: 844 })
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await expect.poll(() => page.getByRole('button', { name: '一起比较这 3 个方向' }).evaluate(
        (button) => Math.round(button.getBoundingClientRect().height),
      )).toBeGreaterThanOrEqual(45)
    }
    await page.setViewportSize({ width: 390, height: 844 })
    await page.screenshot({ path: testInfo.outputPath('v3-guided-directions-390x844.png'), fullPage: true })
    await page.getByRole('button', { name: '一起比较这 3 个方向' }).click()
    await expect(page.getByText('已选择 3 / 4')).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath('v3-guided-plan-390x844.png'), fullPage: true })
    await page.getByRole('button', { name: '保存计划' }).click()

    await expect(page.getByText('现在能不能剪')).toHaveCount(3)
    await expect(page.getByText('每天打理')).toHaveCount(3)
    await expect(page.getByText('变化程度')).toHaveCount(3)
    await expect(page.getByText('最大风险')).toHaveCount(3)
    await expect(page.locator('.route-enter-active')).toHaveCount(0)
    await expect.poll(() => page.locator('.candidate-detail-list').evaluate((list) => {
      const listWidth = Math.round(list.getBoundingClientRect().width)
      return [...list.children].every(
        (item) => Math.round(item.getBoundingClientRect().width) === listWidth,
      ) && document.documentElement.scrollWidth <= innerWidth
    })).toBe(true)
    await page.screenshot({ path: testInfo.outputPath('v3-compare-390x844.png'), fullPage: true })

    await page.getByRole('link', { name: '准备给理发师看的内容' }).click()
    await page.getByLabel(`目标候选：${recommendedNames[0]}`).check()
    await page.getByLabel('备选方案').selectOption({ label: recommendedNames[1] })
    await page.getByRole('button', { name: '保存Tony卡' }).click()
    await expect(page.getByText(`备选 · ${recommendedNames[1]}`)).toBeVisible()
    await page.getByRole('link', { name: '到店打开' }).click()
    await expect(page).toHaveURL(/\/brief\/show$/)
    await expect(page.getByRole('navigation', { name: '主导航' })).toHaveCount(0)
    await expect(page.getByRole('navigation', { name: '理发现场操作' })).toBeVisible()
    await expect(page.getByRole('button', { name: '保存修改' })).toHaveCount(0)
    await expect(page.getByText(`备选 · ${recommendedNames[1]}`)).toBeVisible()
    await expect(page.getByRole('heading', { name: '最在意' })).toBeVisible()
    await expect(page.getByRole('heading', { name: '绝对不要' })).toBeVisible()
    await expect(page.getByText('查看顶部、刘海和侧后细节')).toBeVisible()
    await expect(page.locator('.brief-barber-details')).not.toHaveAttribute('open', '')
    await waitForSettledRoute(page)
    await page.screenshot({ path: testInfo.outputPath('v3-barber-390x844.png'), fullPage: true })

    await page.goto('/archive/records/new')
    await page.getByText('日期、名称和满意度', { exact: true }).click()
    await page.getByLabel('理发日期').fill('2026-08-12')
    await page.getByLabel('发型名').fill('第一次验证短发')
    await page.getByLabel('剪后照片').setInputFiles('public/demo/persona-ran-sidepart.webp')
    await page.getByLabel('有一点要改').check()
    await page.getByLabel('下次调整 1').fill('两侧再保留半厘米')
    await page.getByText('在哪剪的（可选）', { exact: true }).click()
    await page.getByLabel('店铺位置（可选）').fill('上海市静安区南京西路')
    await waitForSettledRoute(page)
    await page.screenshot({ path: testInfo.outputPath('v3-record-adjust-390x844.png'), fullPage: true })
    await page.getByRole('button', { name: '保存剪后记录' }).click()
    await expect(page.getByText('下次我会记得这些调整')).toBeVisible()
    await expect(page.getByText('两侧再保留半厘米')).toBeVisible()
  } finally {
    if (!page.isClosed()) {
      await page.close()
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
  }
})
