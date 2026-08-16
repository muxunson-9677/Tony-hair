import { expect, test } from '@playwright/test'

test('switches a demo adult and one of their two hairstyle options', async ({ page }) => {
  await page.goto('/try')

  await expect(page.getByText('预先制作的合成人物素材，不会处理你的照片')).toBeVisible()

  const resultImage = page.getByTestId('try-result-image')
  await expect(resultImage).toHaveAttribute('src', '/demo/persona-lin-bob.webp')

  await page.getByRole('button', { name: '选择人物：乔衡' }).click()
  await page.getByRole('button', { name: '选择方案：清爽渐层' }).click()

  await expect(resultImage).toHaveAttribute('src', '/demo/persona-qiao-taper.webp')
  await expect(resultImage).toHaveAttribute('alt', /乔衡的清爽渐层/)
  await expect(page.getByText('需理发师现场确认')).toBeVisible()
  await expect(page.getByLabel('示例体验说明')).toBeInViewport()
})
