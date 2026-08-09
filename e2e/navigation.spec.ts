import { expect, test } from '@playwright/test'

test('navigates through the four primary destinations', async ({ page }) => {
  await page.goto('/')

  const destinations = [
    { label: '首页', path: '/', heading: '咋剪发' },
    { label: '试发型', path: '/try', heading: '试发型' },
    { label: '档案', path: '/archive', heading: '档案' },
    { label: '我的', path: '/me', heading: '我的' },
  ] as const

  for (const destination of destinations) {
    const link = page.getByRole('link', { name: destination.label, exact: true })

    await link.click()
    await expect(page).toHaveURL(new RegExp(`${destination.path === '/' ? '/$' : `${destination.path}$`}`))
    await expect(page.getByRole('heading', { level: 1, name: destination.heading })).toBeVisible()
    await expect(link).toHaveAttribute('aria-current', 'page')
  }
})

test('serves an unknown deep link and returns home', async ({ page }) => {
  await page.goto('/missing/deep-link')

  await expect(page).toHaveTitle('页面没找到｜咋剪发')
  await expect(page.getByRole('heading', { level: 1, name: '页面没找到' })).toBeVisible()

  await page.getByRole('link', { name: '返回首页' }).click()

  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('heading', { level: 1, name: '咋剪发' })).toBeVisible()
})
