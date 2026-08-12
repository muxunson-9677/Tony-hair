import path from 'node:path'

import { expect, test, type Page } from '@playwright/test'

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
  await page.getByLabel('发质').selectOption('wavy')
  await page.getByLabel('发丝粗细').selectOption('fine')
  await page.getByLabel('发量').selectOption('medium')
  await page.getByLabel('日常打理分钟').fill('8')
  await page.getByLabel('洗发频率').selectOption('every_other_day')
  await page.getByRole('button', { name: '保存档案' }).click()
  await expect(page).toHaveURL(/\/archive$/)
}

const startAvoidRecord = async (page: Page, styleName: string, rule: string) => {
  await page.goto('/archive/records/new')
  await page.getByText('日期、名称和满意度', { exact: true }).click()
  await page.getByLabel('发型名').fill(styleName)
  await page.getByLabel('剪后照片').setInputFiles(path.resolve('public/demo/persona-ran-sidepart.webp'))
  await expect(page.getByText(/已在本地处理/)).toBeVisible()
  await page.getByLabel('别再这样').check()
  await page.getByLabel('避雷规则 1').fill(rule)
}

const addRegionMark = async (
  page: Page,
  region: string,
  issue: string,
  note?: string,
) => {
  await page.getByRole('button', { name: '在剪后照片上点选问题位置' })
    .click({ position: { x: 120, y: 180 } })
  const panel = page.getByRole('group', { name: '新标注' })
  await expect(panel).toBeVisible()
  await panel.getByRole('button', { name: region, exact: true }).click()
  await panel.getByRole('button', { name: issue, exact: true }).click()
  if (note !== undefined) {
    await panel.getByLabel('一句话说明').fill(note)
  }
  await panel.getByRole('button', { name: '添加标注' }).click()
  await expect(panel).toBeHidden()
}

test.beforeEach(async ({ page }, testInfo) => {
  const databaseName = `zajianfa-marks-e2e-${testInfo.workerIndex}-${Date.now()}-${Math.random().toString(36).slice(2)}`
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

test('marks regions on the after photo with 45px targets and archives the triptych', async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000)
  await createProfile(page, '阿标')

  await startAvoidRecord(page, '翻车短发', '两侧不要推白')
  await expect(page.getByRole('heading', { name: '哪里出了问题？（可选）' })).toBeVisible()

  await addRegionMark(page, '两侧', '太短')
  await addRegionMark(page, '鬓角', '自定义', '剃成直角了')
  await expect(page.getByText('两侧 · 太短')).toBeVisible()
  await expect(page.getByText('鬓角 · 剃成直角了')).toBeVisible()

  // 红线：打标触控目标 ≥45px。
  const dotBox = await page.locator('.region-annotator__dot').first().boundingBox()
  expect(dotBox?.width ?? 0).toBeGreaterThanOrEqual(45)
  expect(dotBox?.height ?? 0).toBeGreaterThanOrEqual(45)
  const removeBox = await page.getByRole('button', { name: /删除标注 1/ }).boundingBox()
  expect(removeBox?.height ?? 0).toBeGreaterThanOrEqual(45)
  await page.screenshot({ path: testInfo.outputPath('record-form-marks-390x844.png'), fullPage: true })

  await page.getByRole('button', { name: '保存剪后记录' }).click()
  await expect(page.getByRole('heading', { level: 1, name: '翻车短发' })).toBeVisible()

  // 三图并排存档：目标图占位（未关联计划）、剪后图、标注图 + 图例。
  await expect(page.getByRole('heading', { name: '当时想剪的 · 实际剪成的 · 哪里出了问题' })).toBeVisible()
  await expect(page.getByText('没有关联目标图')).toBeVisible()
  await expect(page.locator('.record-triptych__annotated img')).toBeVisible()
  await expect(page.locator('.record-triptych__annotated .region-annotator__dot')).toHaveCount(2)
  const legend = page.getByRole('list', { name: '问题区域清单' })
  await expect(legend.getByText('两侧 · 太短')).toBeVisible()
  await expect(legend.getByText('鬓角 · 剃成直角了')).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('record-detail-triptych-390x844.png'), fullPage: true })

  // 编辑后标注仍在。
  await page.getByRole('link', { name: '编辑记录' }).click()
  await expect(page.getByText('两侧 · 太短')).toBeVisible()
})

test('feeds marks into plan memory and warns only on exact structured conflicts', async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000)
  await createProfile(page, '阿雷')

  await startAvoidRecord(page, '翻车两侧', '别铲太狠')
  await addRegionMark(page, '两侧', '太短')
  await page.getByRole('button', { name: '保存剪后记录' }).click()
  await expect(page.getByRole('heading', { level: 1, name: '翻车两侧' })).toBeVisible()

  await page.goto('/archive/plans/new')
  // 区域级条目走记忆通道，来源可查。
  await expect(page.getByRole('textbox', { name: '避开经验 1' }))
    .toHaveValue('两侧：上次剪太短，这次保留长度')
  await expect(page.getByText(/\d{4}-\d{2}-\d{2} · 翻车两侧/).first()).toBeVisible()

  await page.getByText('本次区域要求（可选）').click()
  const sidesGroup = page.getByRole('group', { name: '两侧的本次要求' })
  const chipBox = await sidesGroup.getByRole('button', { name: '剪更短·铲短' }).boundingBox()
  expect(chipBox?.height ?? 0).toBeGreaterThanOrEqual(45)

  // 正例：同区域同问题类型 → 提示两条来源。
  await sidesGroup.getByRole('button', { name: '剪更短·铲短' }).click()
  const conflict = page.locator('.region-requests__conflicts')
  await expect(conflict).toBeVisible()
  await expect(conflict).toContainText('两侧：上次（')
  await expect(conflict).toContainText('标了「太短」，这次又要求「剪更短·铲短」')
  await expect(conflict.getByRole('link', { name: '查看当时的记录' })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('plan-form-conflict-390x844.png'), fullPage: true })

  // 反例 1：换到不同区域 → 不提示。
  await sidesGroup.getByRole('button', { name: '剪更短·铲短' }).click()
  await expect(conflict).toBeHidden()
  await page.getByRole('group', { name: '顶部的本次要求' })
    .getByRole('button', { name: '剪更短·铲短' }).click()
  await expect(conflict).toBeHidden()

  // 反例 2：同区域但非矛盾方向 → 不提示。
  await sidesGroup.getByRole('button', { name: '保留长度' }).click()
  await expect(conflict).toBeHidden()

  await openPlanDetails(page)
  await page.getByLabel('计划标题').fill('避雷验证计划')
  await page.getByRole('button', { name: '加入候选：齐颌短鲍伯' }).click()
  await page.getByText('继续添加或更换候选').click()
  await page.getByRole('button', { name: '加入候选：纹理短碎发' }).click()
  await page.getByRole('button', { name: '保存计划' }).click()

  await expect(page.getByRole('heading', { level: 1, name: '避雷验证计划' })).toBeVisible()
  const requestsSection = page.locator('.plan-region-requests')
  await expect(requestsSection.getByRole('heading', { name: '本次区域要求' })).toBeVisible()
  await expect(requestsSection).toContainText('顶部')
  await expect(requestsSection).toContainText('两侧')
  await expect(requestsSection).toContainText('保留长度')
  await page.screenshot({ path: testInfo.outputPath('plan-detail-region-requests-390x844.png'), fullPage: true })
})

test('marking stays optional: an avoid record saves without any region mark', async ({ page }) => {
  test.setTimeout(60_000)
  await createProfile(page, '阿速')

  await startAvoidRecord(page, '快速复盘', '别再打薄')
  await expect(page.getByRole('heading', { name: '哪里出了问题？（可选）' })).toBeVisible()
  await page.getByRole('button', { name: '保存剪后记录' }).click()
  await expect(page.getByRole('heading', { level: 1, name: '快速复盘' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '当时想剪的 · 实际剪成的 · 哪里出了问题' })).toHaveCount(0)
})
