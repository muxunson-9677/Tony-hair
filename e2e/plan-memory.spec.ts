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

interface RecordSeed {
  readonly date?: string
  readonly styleName: string
  readonly outcome: 'repeat' | 'adjust' | 'avoid'
  readonly notes?: readonly string[]
}

const saveRecord = async (page: Page, seed: RecordSeed) => {
  await page.goto('/archive/records/new')
  await page.getByText('日期、名称和满意度', { exact: true }).click()
  if (seed.date) {
    await page.getByLabel('理发日期').fill(seed.date)
  }
  await page.getByLabel('发型名').fill(seed.styleName)
  await page.getByLabel('剪后照片').setInputFiles(path.resolve('public/demo/persona-ran-sidepart.webp'))
  if (seed.outcome === 'repeat') {
    await page.getByLabel('就这样').check()
  } else if (seed.outcome === 'adjust') {
    await page.getByLabel('有一点要改').check()
    for (const [index, note] of (seed.notes ?? []).entries()) {
      await page.getByLabel(`下次调整 ${index + 1}`).fill(note)
    }
  } else {
    await page.getByLabel('别再这样').check()
    for (const [index, note] of (seed.notes ?? []).entries()) {
      await page.getByLabel(`避雷规则 ${index + 1}`).fill(note)
    }
  }
  await page.getByRole('button', { name: '保存剪后记录' }).click()
  await expect(page.getByRole('heading', { level: 1, name: seed.styleName })).toBeVisible()
}

test.beforeEach(async ({ page }, testInfo) => {
  const databaseName = `zajianfa-memory-e2e-${testInfo.workerIndex}-${Date.now()}-${Math.random().toString(36).slice(2)}`
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

test('inherits memories into a plan, keeps the snapshot stable, and feeds the Tony card', async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000)
  await createProfile(page, '阿珂')

  await saveRecord(page, { date: '2026-08-01', styleName: '清爽短发', outcome: 'repeat' })
  await expect(page.getByText('Tony 记住了：这次的成功剪法已存档，下次一句话复刻。')).toBeVisible()
  await page.reload()
  await expect(page.getByText('Tony 记住了：这次的成功剪法已存档，下次一句话复刻。')).toHaveCount(0)

  await saveRecord(page, { styleName: '夏日碎发', outcome: 'adjust', notes: ['两侧留长一点'] })
  await expect(page.getByText('Tony 记住了：下次会带上你刚写的调整。')).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('attribution-adjust-390x844.png'), fullPage: true })

  await page.goto('/archive/plans/new')
  await expect(page.getByRole('heading', { name: '本次已带入' })).toBeVisible()
  await expect(page.getByText('Tony 从你的剪后记录里带来了这些经验。保存前都可以改，不会改动原记录。')).toBeVisible()
  await expect(page.getByRole('textbox', { name: '保持经验 1' })).toHaveValue('两侧留长一点')
  await expect(page.getByRole('textbox', { name: '保持经验 2' })).toHaveValue('整体照上次的「清爽短发」复刻')
  await expect(page.getByText('下次微调')).toBeVisible()
  await expect(page.getByText('成功经验')).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('plan-form-memories-390x844.png'), fullPage: true })

  await page.getByRole('textbox', { name: '保持经验 1' }).fill('两侧保留 6mm 以上')
  await page.getByRole('button', { name: '删除保持经验 2' }).click()
  await expect(page.getByRole('textbox', { name: '保持经验 2' })).toHaveCount(0)

  await openPlanDetails(page)
  await page.getByLabel('计划标题').fill('记忆继承计划')
  await page.getByRole('button', { name: '加入候选：齐颌短鲍伯' }).click()
  await page.getByText('继续添加或更换候选').click()
  await page.getByRole('button', { name: '加入候选：纹理短碎发' }).click()
  await page.getByRole('button', { name: '保存计划' }).click()

  await expect(page.getByRole('heading', { level: 1, name: '记忆继承计划' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '本次已带入' })).toBeVisible()
  await expect(page.getByText('两侧保留 6mm 以上')).toBeVisible()
  await expect(page.getByText(/来自 \d{4}-\d{2}-\d{2} · 夏日碎发/)).toBeVisible()
  await expect(page.getByText('整体照上次的「清爽短发」复刻')).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('plan-detail-memories-390x844.png'), fullPage: true })

  await page.reload()
  await expect(page.getByText('两侧保留 6mm 以上')).toBeVisible()
  await expect(page.getByText('整体照上次的「清爽短发」复刻')).toHaveCount(0)

  await page.goto('/')
  await expect(page.getByTestId('home-days-since')).toHaveText(/距离上次理发 \d+ 天/)
  await expect(page.getByTestId('home-memory-link')).toHaveText(/已带上 1 条你的经验/)
  await page.screenshot({ path: testInfo.outputPath('home-memory-390x844.png'), fullPage: true })
  await page.getByTestId('home-memory-link').click()
  await expect(page.getByRole('heading', { level: 1, name: '记忆继承计划' })).toBeVisible()

  await page.getByRole('link', { name: '准备给理发师看的内容' }).click()
  await expect(page.getByRole('heading', { level: 1, name: '创建Tony卡' })).toBeVisible()
  await page.getByText('需要修改时展开').click()
  await expect(page.getByLabel('最在意 1', { exact: true })).toHaveValue('两侧保留 6mm 以上')
  const priorityValues = await page.locator('.brief-list-editor input').evaluateAll(
    (inputs) => inputs.map((input) => (input as HTMLInputElement).value),
  )
  expect(priorityValues).not.toContain('整体照上次的「清爽短发」复刻')
  await page.getByLabel('目标候选：齐颌短鲍伯').check()
  await page.getByRole('button', { name: '保存Tony卡' }).click()
  await expect(page.getByText('Tony卡已保存在当前设备，到店直接打开。')).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('tony-card-saved-390x844.png'), fullPage: true })

  await page.goto('/archive')
  await page.getByRole('link', { name: /夏日碎发/ }).click()
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: '删除记录' }).click()
  await expect(page).toHaveURL(/\/archive$/)

  await page.getByRole('link', { name: /记忆继承计划的候选缩略图/ }).click()
  await expect(page.getByText('两侧保留 6mm 以上')).toBeVisible()
  await expect(page.getByText(/原记录已删除，保留当时快照/)).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('plan-detail-source-deleted-390x844.png'), fullPage: true })
})

test('shows the avoid overflow entry and persists a two-step swap', async ({ page }, testInfo) => {
  test.setTimeout(90_000)
  await createProfile(page, '阿雷')

  await saveRecord(page, {
    date: '2026-08-03',
    styleName: '翻车一号',
    outcome: 'avoid',
    notes: ['避雷一', '避雷二', '避雷三'],
  })
  await saveRecord(page, { date: '2026-08-04', styleName: '翻车二号', outcome: 'avoid', notes: ['避雷四'] })
  await expect(page.getByText('这次的雷 Tony 记住了，下次替你挡。')).toBeVisible()

  await page.goto('/archive/plans/new')
  await expect(page.getByRole('heading', { name: '这次一定避开' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: /避开经验 \d/ })).toHaveCount(3)
  const overflowToggle = page.getByText(/还有 1 条避雷没带入，查看/)
  await expect(overflowToggle).toBeVisible()
  await overflowToggle.click()

  const overflowText = (await page.locator('.plan-memory-overflow li b').first().textContent())?.trim()
  expect(overflowText).toBeTruthy()
  const firstAvoidText = await page.getByRole('textbox', { name: '避开经验 1' }).inputValue()
  await page.screenshot({ path: testInfo.outputPath('avoid-overflow-open-390x844.png'), fullPage: true })

  await page.getByRole('button', { name: `换入：${overflowText}` }).click()
  await expect(page.getByText('点选下面要被替换的那条避雷')).toBeVisible()
  await page.getByRole('button', { name: `换成这条：${firstAvoidText}` }).click()
  await expect(page.getByRole('textbox', { name: '避开经验 1' })).toHaveValue(overflowText as string)
  await expect(page.locator('.plan-memory-overflow li b').first()).toHaveText(firstAvoidText)

  await openPlanDetails(page)
  await page.getByLabel('计划标题').fill('避雷换入计划')
  await page.getByRole('button', { name: '加入候选：齐颌短鲍伯' }).click()
  await page.getByText('继续添加或更换候选').click()
  await page.getByRole('button', { name: '加入候选：纹理短碎发' }).click()
  await page.getByRole('button', { name: '保存计划' }).click()

  await expect(page.getByRole('heading', { level: 1, name: '避雷换入计划' })).toBeVisible()
  await expect(page.getByText(overflowText as string)).toBeVisible()
  await expect(page.getByText(firstAvoidText, { exact: true })).toHaveCount(0)

  await page.reload()
  await expect(page.getByText(overflowText as string)).toBeVisible()
  await expect(page.getByText(firstAvoidText, { exact: true })).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('avoid-swap-persisted-390x844.png'), fullPage: true })
})

test('keeps the legacy avoid fallback for plans without snapshots and honours deletions on new plans', async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000)
  await createProfile(page, '阿旧')

  await saveRecord(page, { date: '2026-08-01', styleName: '清爽短发', outcome: 'repeat' })
  await saveRecord(page, {
    date: '2026-08-02',
    styleName: '翻车寸头',
    outcome: 'avoid',
    notes: ['两侧不要推白'],
  })

  // 旧计划路径：删除全部建议，保存后计划没有任何记忆快照。
  await page.goto('/archive/plans/new')
  await expect(page.getByRole('heading', { name: '本次已带入' })).toBeVisible()
  await page.getByRole('button', { name: '删除保持经验 1' }).click()
  await page.getByRole('button', { name: '删除避开经验 1' }).click()
  await expect(page.getByRole('heading', { name: '本次已带入' })).toHaveCount(0)

  await openPlanDetails(page)
  await page.getByLabel('计划标题').fill('旧式计划')
  await page.getByRole('button', { name: '加入历史候选：清爽短发' }).click()
  await page.getByText('继续添加或更换候选').click()
  await page.getByRole('button', { name: '加入历史候选：翻车寸头' }).click()
  await page.getByRole('button', { name: '保存计划' }).click()
  await expect(page.getByRole('heading', { level: 1, name: '旧式计划' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '本次已带入' })).toHaveCount(0)

  await page.getByRole('link', { name: '准备给理发师看的内容' }).click()
  await page.getByText('需要修改时展开').click()
  await expect(page.getByLabel('绝对不要 1', { exact: true })).toHaveValue('两侧不要推白')
  await page.screenshot({ path: testInfo.outputPath('legacy-fallback-brief-390x844.png'), fullPage: true })

  // 新计划路径：保留一条保持经验、删除避雷，Tony卡不得再合并全局避雷。
  await page.goto('/archive/plans/new')
  await expect(page.getByRole('textbox', { name: '避开经验 1' })).toHaveValue('两侧不要推白')
  await page.getByRole('button', { name: '删除避开经验 1' }).click()
  await expect(page.getByRole('textbox', { name: '保持经验 1' })).toHaveValue('整体照上次的「清爽短发」复刻')

  await openPlanDetails(page)
  await page.getByLabel('计划标题').fill('新式计划')
  await page.getByRole('button', { name: '加入历史候选：清爽短发' }).click()
  await page.getByText('继续添加或更换候选').click()
  await page.getByRole('button', { name: '加入历史候选：翻车寸头' }).click()
  await page.getByRole('button', { name: '保存计划' }).click()
  await expect(page.getByRole('heading', { level: 1, name: '新式计划' })).toBeVisible()

  await page.getByRole('link', { name: '准备给理发师看的内容' }).click()
  await page.getByText('需要修改时展开').click()
  await expect(page.getByLabel('最在意 1', { exact: true })).toHaveValue('整体照上次的「清爽短发」复刻')
  const avoidValues = await page.locator('.brief-list-editor--avoid input').evaluateAll(
    (inputs) => inputs.map((input) => (input as HTMLInputElement).value),
  )
  expect(avoidValues).not.toContain('两侧不要推白')
  await page.screenshot({ path: testInfo.outputPath('new-plan-brief-no-avoid-390x844.png'), fullPage: true })
})
