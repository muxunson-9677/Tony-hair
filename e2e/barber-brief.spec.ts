import { stat } from 'node:fs/promises'

import { expect, test, type BrowserContext, type Page } from '@playwright/test'

const TEST_DB_SESSION_KEY = '__zajianfa_e2e_archive_db__'

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

const cleanupDatabase = async (
  context: BrowserContext,
  page: Page,
  databaseName: string,
) => {
  if (!page.isClosed()) {
    await page.close()
  }
  const cleanupPage = await context.newPage()
  await cleanupPage.goto('/')
  await cleanupPage.evaluate(async (name) => {
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
    await new Promise<void>((resolve, reject) => {
      const request = browser.indexedDB.deleteDatabase(name)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
      request.onblocked = () => reject(new Error(`Database cleanup blocked: ${name}`))
    })
  }, databaseName)
  await cleanupPage.close()
}

test('creates, refreshes, exports, prints, edits, and deletes a barber brief without deleting its plan', async ({
  baseURL,
  context,
  page,
}, testInfo) => {
  test.setTimeout(60_000)
  const databaseName = `zajianfa-brief-e2e-${testInfo.workerIndex}-${Date.now()}-${crypto.randomUUID()}`
  const externalRequests: string[] = []
  page.on('request', (request) => {
    if (new URL(request.url()).origin !== new URL(baseURL as string).origin) {
      externalRequests.push(request.url())
    }
  })
  await page.addInitScript(
    ({ key, name }) => sessionStorage.setItem(key, name),
    { key: TEST_DB_SESSION_KEY, name: databaseName },
  )

  try {
    await page.goto('/archive')
    await page.getByRole('link', { name: '建立档案' }).click()
    await page.getByLabel('称呼').fill('小林')
    await openProfileDetails(page)
    await page.getByLabel('发质').selectOption('wavy')
    await page.getByLabel('发丝粗细').selectOption('fine')
    await page.getByLabel('发量').selectOption('medium')
    await page.getByLabel('日常打理分钟').fill('12')
    await page.getByLabel('洗发频率').selectOption('every_other_day')
    await page.getByRole('button', { name: '保存档案' }).click()

    await page.getByRole('link', { name: '准备下次怎么剪' }).click()
    await openPlanDetails(page)
    await page.getByLabel('计划标题').fill('夏末短发计划')
    await page.getByLabel('计划日期').fill('2026-08-22')
    await page.getByLabel('计划状态').selectOption('ready')
    await page.getByRole('button', { name: '加入候选：齐颌短鲍伯' }).click()
    await page.getByText('继续添加或更换候选').click()
    await page.getByRole('button', { name: '加入候选：纹理短碎发' }).click()
    await page.getByRole('button', { name: '保存计划' }).click()

    await expect(page.getByRole('link', { name: '准备给理发师看的内容' })).toBeVisible({ timeout: 5_000 })
    await page.getByRole('link', { name: '准备给理发师看的内容' }).click()
    await expect(page.getByRole('heading', { level: 1, name: '创建Tony卡' })).toBeVisible()
    await page.getByLabel('目标候选：纹理短碎发').check()
    await page.getByText('需要修改时展开').click()
    await page.getByLabel('整体').fill('整体保持轻盈轮廓')
    await page.getByLabel('顶部').fill('顶部保留自然支撑')
    await page.getByLabel('刘海').fill('刘海轻薄并自然露额')
    await page.getByLabel('两侧').fill('两侧贴合但不要推白')
    await page.getByLabel('鬓角').fill('鬓角保留自然尖角')
    await page.getByLabel('后脑').fill('后脑连接自然')
    await page.getByLabel('最在意 1', { exact: true }).fill('两侧不要炸')
    await page.getByLabel('绝对不要 1', { exact: true }).fill('不要推白')
    await page.getByLabel('整体').scrollIntoViewIfNeeded()
    await page.screenshot({ path: testInfo.outputPath('brief-editor-390x844.png') })
    await page.getByRole('button', { name: '保存Tony卡' }).click()

    await expect(page.getByRole('heading', { level: 1, name: '编辑Tony卡' })).toBeVisible()
    await page.reload()
    await page.getByText('需要修改时展开').click()
    await expect(page.getByLabel('整体')).toHaveValue('整体保持轻盈轮廓')
    const refreshedPreview = page.getByRole('region', { name: 'Tony卡预览' })
    await expect(refreshedPreview).toContainText('请现场确认')
    await refreshedPreview.scrollIntoViewIfNeeded()
    await page.screenshot({ path: testInfo.outputPath('brief-preview-390x844.png') })

    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: '导出 PNG' }).click()
    const download = await downloadPromise
    const exportedPath = testInfo.outputPath('barber-brief-export.png')
    await download.saveAs(exportedPath)
    expect(download.suggestedFilename()).toMatch(/^Tony宝-.*\.png$/)
    expect((await stat(exportedPath)).size).toBeGreaterThan(0)

    await page.evaluate(() => {
      const browser = globalThis as unknown as {
        print: () => void
        sessionStorage: { setItem(key: string, value: string): void }
      }
      browser.print = () => browser.sessionStorage.setItem('__brief_print_called__', 'true')
    })
    await page.getByRole('button', { name: '打印Tony卡' }).click()
    expect(await page.evaluate(() => {
      const browser = globalThis as unknown as {
        sessionStorage: { getItem(key: string): string | null }
      }
      return browser.sessionStorage.getItem('__brief_print_called__')
    })).toBe('true')
    await page.emulateMedia({ media: 'print' })
    await expect(page.getByRole('navigation', { name: '主导航' })).toBeHidden()
    await expect(page.locator('.brief-screen-only')).toBeHidden()
    await expect(page.getByRole('region', { name: 'Tony卡预览' })).toBeVisible()
    await page.emulateMedia({ media: 'screen' })

    await page.getByLabel('整体').fill('编辑后的整体要求')
    await page.getByRole('button', { name: '保存修改' }).click()
    await expect(page.getByRole('region', { name: 'Tony卡预览' })).toContainText('编辑后的整体要求')

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
              className: string
              textContent: string | null
            }>
          }
          innerWidth: number
        }
        return {
          hasHorizontalOverflow: browser.document.documentElement.scrollWidth > browser.innerWidth,
          minimumTarget: [...browser.document.querySelectorAll('a, button')]
            .map((target) => ({
              height: (target as HTMLElement).offsetHeight,
              width: target.getBoundingClientRect().width,
              label: target.textContent?.trim() ?? '',
              className: target.className,
            }))
            .filter(({ height, width }) => height > 0 && width > 0)
            .sort((left, right) => left.height - right.height)[0],
        }
      })
      expect(layout.hasHorizontalOverflow).toBe(false)
      expect(layout.minimumTarget.height, `${layout.minimumTarget.label} (${layout.minimumTarget.className})`)
        .toBeGreaterThanOrEqual(45)
    }

    page.once('dialog', (dialog) => dialog.accept())
    await page.getByRole('button', { name: '删除Tony卡' }).click()
    await expect(page.getByRole('heading', { level: 1, name: '夏末短发计划' })).toBeVisible()
    await expect(page.getByRole('link', { name: '准备给理发师看的内容' })).toBeVisible()
    await expect(page.getByRole('img', { name: /纹理短碎发/ })).toBeVisible()
    expect(externalRequests).toEqual([])
  } finally {
    await cleanupDatabase(context, page, databaseName)
  }
})
