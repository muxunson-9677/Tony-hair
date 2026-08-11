import { expect, test } from '@playwright/test'

test('uses the confirmed light mobile system and gives controls physical feedback', async ({ page }) => {
  await page.goto('/styles')

  await expect(page.locator('.app-shell')).toHaveAttribute('data-visual-system', 'apple-light')
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(246, 247, 249)')

  const favorite = page.getByRole('button', { name: '收藏：齐颌短鲍伯' })
  await expect(page.locator('.route-enter-active')).toHaveCount(0)
  await favorite.hover()
  await page.mouse.down()
  await expect(favorite).toHaveAttribute('data-pressing', 'true')
  await page.mouse.up()
  await expect(favorite).not.toHaveAttribute('data-pressing', 'true')
})

test('lets a finger directly drag the mobile filter rail without blocking vertical intent', async ({ page }) => {
  await page.goto('/styles')
  await page.getByRole('button', { name: '筛选条件（0）' }).click()

  const rail = page.locator('[data-drag-rail]').first()
  await expect(rail).toBeVisible()
  const metrics = await rail.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }))
  expect(metrics.scrollWidth).toBeGreaterThan(metrics.clientWidth)

  const box = await rail.boundingBox()
  expect(box).not.toBeNull()
  await page.mouse.move(box!.x + box!.width - 10, box!.y + box!.height / 2)
  await page.mouse.down()
  await page.mouse.move(box!.x + 20, box!.y + box!.height / 2, { steps: 5 })
  await page.mouse.up()

  await expect.poll(() => rail.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0)
})

test('keeps glass limited to mobile controls and exposes solid fallbacks', async ({ page }) => {
  await page.goto('/styles/catalog/lin-bob')

  const dock = page.locator('.style-action-dock')
  await expect(dock).toBeVisible()
  await expect(dock).toHaveCSS('position', 'fixed')
  await expect(page.locator('.style-detail-copy')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(page.locator('.route-enter-active')).toHaveCount(0)
})
