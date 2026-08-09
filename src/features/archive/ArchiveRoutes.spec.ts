/// <reference types="node" />

import { File as NodeFile } from 'node:buffer'

import { fireEvent, render, screen, waitFor, within } from '@testing-library/vue'
import { createPinia } from 'pinia'
import { createMemoryHistory } from 'vue-router'
import { afterAll, afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import App from '../../App.vue'
import { createAppRouter } from '../../router'
import { ArchiveStorageError } from './ArchiveRepository'
import { defaultArchiveDb, defaultArchiveRepository } from './archiveStore'
import * as briefExport from './briefExport'
import type {
  BarberBrief,
  Candidate,
  HairProfile,
  HaircutPhoto,
  HaircutPlan,
  HaircutRecord,
} from './types'

const localPhoto = new NodeFile(['styled-photo'], 'styled.webp', {
  type: 'image/webp',
}) as unknown as File

const existingProfile: HairProfile = {
  id: 'profile-for-routes',
  name: '阿青',
  hairTexture: 'wavy',
  strandThickness: 'fine',
  density: 'medium',
  stylingMinutes: 8,
  washFrequency: 'every_other_day',
  preferenceNotes: '不要贴头皮',
  createdAt: '2026-08-10T00:00:00.000Z',
  updatedAt: '2026-08-10T00:00:00.000Z',
}

async function renderAt(path: string) {
  const router = createAppRouter(createMemoryHistory())
  await router.push(path)
  await router.isReady()
  render(App, {
    global: {
      plugins: [createPinia(), router],
    },
  })
  return router
}

describe('archive routes and forms', () => {
  beforeEach(async () => {
    defaultArchiveDb.close()
    await defaultArchiveDb.delete()
    await defaultArchiveDb.open()
  })

  afterAll(() => defaultArchiveDb.close())
  afterEach(() => vi.restoreAllMocks())

  test('registers every archive route and keeps the archive tab current on inner pages', async () => {
    const router = createAppRouter(createMemoryHistory())
    expect(router.getRoutes().map(({ path }) => path)).toEqual(expect.arrayContaining([
      '/archive',
      '/archive/profile',
      '/archive/plans/new',
      '/archive/plans/:id',
      '/archive/plans/:id/edit',
      '/archive/plans/:id/brief',
      '/archive/records/new',
      '/archive/records/:id',
      '/archive/records/:id/edit',
    ]))

    await renderAt('/archive/profile')
    expect(await screen.findByRole('heading', { level: 1, name: '建立发型档案' })).toBeTruthy()
    expect(screen.getByRole('link', { name: '返回档案' }).getAttribute('href')).toBe('/archive')
    expect(screen.getByRole('link', { name: '档案' }).getAttribute('aria-current')).toBe('page')
    await waitFor(() => expect(document.title).toBe('建立发型档案｜咋剪发'))
  })

  test('shows a storage load error before the missing-profile plan state', async () => {
    vi.spyOn(defaultArchiveRepository, 'listProfiles').mockRejectedValueOnce(
      new ArchiveStorageError('unavailable', new Error('technical')),
    )

    await renderAt('/archive/plans/new')

    expect((await screen.findByRole('alert')).textContent).toMatch(/不可用|无痕/)
    expect(screen.queryByText('请先建立发型档案')).toBeNull()
  })

  test('gives the plan-detail loading failure a real h1 and matching accessible label', async () => {
    vi.spyOn(defaultArchiveRepository, 'listProfiles').mockRejectedValueOnce(
      new ArchiveStorageError('unavailable', new Error('technical')),
    )

    await renderAt('/archive/plans/missing')

    const heading = await screen.findByRole('heading', { level: 1, name: '暂时无法读取计划' })
    expect(heading.id).toBe('plan-detail-state-title')
    expect(heading.closest('section')?.getAttribute('aria-labelledby')).toBe(heading.id)
  })

  test('gives brief loading and missing states real h1 headings', async () => {
    vi.spyOn(defaultArchiveRepository, 'listProfiles').mockRejectedValueOnce(
      new ArchiveStorageError('unavailable', new Error('technical')),
    )
    await renderAt('/archive/plans/missing/brief')
    const errorHeading = await screen.findByRole('heading', {
      level: 1,
      name: '暂时无法读取沟通卡',
    })
    expect(errorHeading.closest('section')?.getAttribute('aria-labelledby')).toBe(errorHeading.id)

    await defaultArchiveRepository.createProfile(existingProfile)
    await renderAt('/archive/plans/missing/brief')
    expect(await screen.findByRole('heading', { level: 1, name: '没有找到这个计划' })).toBeTruthy()
  })

  test('creates, updates, and explicitly deletes the real device profile', async () => {
    const router = await renderAt('/archive')

    expect(await screen.findByText('这台设备还没有发型档案')).toBeTruthy()
    expect(screen.getByText(/只保存在当前设备/)).toBeTruthy()
    await fireEvent.click(screen.getByRole('link', { name: '建立档案' }))
    await waitFor(() => expect(router.currentRoute.value.path).toBe('/archive/profile'))

    expect(await screen.findByText('成年人及授权提醒')).toBeTruthy()
    expect(screen.getByText(/已获照片本人明确授权/)).toBeTruthy()
    expect(screen.getByText(/清理浏览器数据/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /上传/ })).toBeNull()
    expect(document.querySelector('input[type="file"]')).toBeNull()

    await fireEvent.update(screen.getByLabelText('称呼'), '小林')
    await fireEvent.update(screen.getByLabelText('发质'), 'wavy')
    await fireEvent.update(screen.getByLabelText('发丝粗细'), 'fine')
    await fireEvent.update(screen.getByLabelText('发量'), 'medium')
    await fireEvent.update(screen.getByLabelText('日常打理分钟'), '12')
    await fireEvent.update(screen.getByLabelText('洗发频率'), 'every_other_day')
    await fireEvent.update(screen.getByLabelText('偏好备注'), '希望露耳，但两侧不要推白')
    await fireEvent.click(screen.getByRole('button', { name: '保存档案' }))

    await waitFor(() => expect(router.currentRoute.value.path).toBe('/archive'))
    expect(await screen.findByRole('heading', { level: 2, name: '小林的发型档案' })).toBeTruthy()
    expect(screen.getByText('微卷 · 细 · 发量适中')).toBeTruthy()
    expect(screen.getByRole('heading', { name: '最近剪后记录' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: '还没有沟通卡' })).toBeTruthy()
    expect(screen.getByText('还没有剪后记录。记录至少一张照片和满意度，之后才能形成复刻或避雷提醒。')).toBeTruthy()

    await fireEvent.click(screen.getByRole('link', { name: '编辑档案' }))
    await fireEvent.update(await screen.findByLabelText('称呼'), '林同学')
    await fireEvent.click(screen.getByRole('button', { name: '保存修改' }))
    expect(await screen.findByRole('heading', { level: 2, name: '林同学的发型档案' })).toBeTruthy()

    const confirmDelete = vi.spyOn(window, 'confirm').mockReturnValue(true)
    await fireEvent.click(screen.getByRole('link', { name: '编辑档案' }))
    await fireEvent.click(await screen.findByRole('button', { name: '删除档案及其内容' }))

    expect(confirmDelete).toHaveBeenCalledWith(expect.stringMatching(/同时删除.*计划.*历史/))
    expect(await screen.findByText('这台设备还没有发型档案')).toBeTruthy()
  })

  test('saves two unique demo candidates, shows the detail, edits, and deletes only the plan', async () => {
    await defaultArchiveRepository.createProfile(existingProfile)
    const router = await renderAt('/archive/plans/new')

    expect(await screen.findByRole('heading', { level: 1, name: '新建发型计划' })).toBeTruthy()
    expect(await screen.findByText(/示例体验/)).toBeTruthy()
    expect(screen.getByText(/非用户生成/)).toBeTruthy()
    expect(screen.getByText(/自己的参考图.*本地图片处理阶段开放/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /历史记录/ })).toBeNull()
    expect(document.querySelector('input[type="file"]')).toBeNull()

    await fireEvent.update(screen.getByLabelText('计划标题'), '夏末短发计划')
    await fireEvent.update(screen.getByLabelText('计划日期'), '2026-08-22')
    await fireEvent.update(screen.getByLabelText('计划状态'), 'ready')
    await fireEvent.click(screen.getByRole('button', { name: '加入候选：齐颌短鲍伯' }))
    await fireEvent.click(screen.getByRole('button', { name: '加入候选：纹理短碎发' }))

    const selected = screen.getByRole('region', { name: '已选候选' })
    expect(within(selected).getAllByRole('img')).toHaveLength(2)
    expect(screen.getByText('已选择 2 / 4')).toBeTruthy()
    await fireEvent.click(screen.getByRole('button', { name: '保存计划' }))

    await waitFor(() => expect(router.currentRoute.value.path).toMatch(/^\/archive\/plans\//))
    expect(await screen.findByRole('heading', { level: 1, name: '夏末短发计划' })).toBeTruthy()
    expect(screen.getAllByText('示例体验 · 非用户生成').length).toBeGreaterThan(0)
    expect(screen.getByRole('img', { name: /齐颌短鲍伯/ })).toBeTruthy()
    expect(screen.getByRole('img', { name: /纹理短碎发/ })).toBeTruthy()

    await fireEvent.click(screen.getByRole('link', { name: '编辑计划' }))
    await fireEvent.update(await screen.findByLabelText('计划标题'), '更新后的夏末计划')
    expect(await screen.findByText('已选择 2 / 4')).toBeTruthy()
    await fireEvent.click(screen.getByRole('button', { name: '保存修改' }))
    expect(await screen.findByRole('heading', { level: 1, name: '更新后的夏末计划' })).toBeTruthy()

    const confirmDelete = vi.spyOn(window, 'confirm').mockReturnValue(true)
    await fireEvent.click(screen.getByRole('button', { name: '删除计划' }))
    expect(confirmDelete).toHaveBeenCalledWith(expect.stringMatching(/删除.*计划/))
    expect(await screen.findByRole('heading', { level: 2, name: '阿青的发型档案' })).toBeTruthy()
    expect(screen.getByText(/还没有发型计划/)).toBeTruthy()
  })

  test('creates, reloads, previews, prints, reports export failure, edits, and deletes only a brief', async () => {
    await defaultArchiveRepository.createProfile(existingProfile)
    const plan: HaircutPlan = {
      id: 'brief-plan',
      profileId: existingProfile.id,
      title: '夏末短发计划',
      date: '2026-08-22',
      status: 'ready',
      createdAt: '2026-08-10T01:00:00.000Z',
      updatedAt: '2026-08-10T01:00:00.000Z',
    }
    const candidates: Candidate[] = [
      {
        id: 'brief-candidate-1',
        planId: plan.id,
        order: 1,
        name: '齐颌短鲍伯',
        notes: '保留耳前重量',
        source: 'demo_ai',
        demoImagePath: '/demo/persona-lin-bob.webp',
      },
      {
        id: 'brief-candidate-2',
        planId: plan.id,
        order: 2,
        name: '纹理短碎发',
        notes: '顺着自然卷向剪',
        source: 'demo_ai',
        demoImagePath: '/demo/persona-ran-crop.webp',
      },
    ]
    await defaultArchiveRepository.savePlanWithCandidates(plan, candidates)
    const router = await renderAt(`/archive/plans/${plan.id}`)

    expect(await screen.findByRole('link', { name: '创建沟通卡' })).toBeTruthy()
    await fireEvent.click(screen.getByRole('link', { name: '创建沟通卡' }))
    expect(await screen.findByRole('heading', { level: 1, name: '创建理发师沟通卡' })).toBeTruthy()
    expect(screen.getByRole('link', { name: '返回计划' }).getAttribute('href')).toBe(`/archive/plans/${plan.id}`)
    expect(screen.getByRole('link', { name: '档案' }).getAttribute('aria-current')).toBe('page')

    const targetRadio = screen.getByLabelText('目标候选：纹理短碎发') as HTMLInputElement
    await fireEvent.click(targetRadio)
    expect(targetRadio.checked).toBe(true)
    const plainText = '<img src=x onerror=alert(1)>整体保持轻盈'
    await fireEvent.update(screen.getByLabelText('整体'), plainText)
    await fireEvent.update(screen.getByLabelText('顶部'), '顶部保留自然支撑')
    await fireEvent.update(screen.getByLabelText('刘海'), '刘海轻薄并自然露额')
    await fireEvent.update(screen.getByLabelText('两侧'), '两侧贴合但不要推白')
    await fireEvent.update(screen.getByLabelText('鬓角'), '鬓角保留自然尖角')
    await fireEvent.update(screen.getByLabelText('后脑'), '后脑连接自然')
    await fireEvent.update(screen.getByLabelText('最在意 1'), '两侧不要炸')
    await fireEvent.click(screen.getByRole('button', { name: '添加最在意' }))
    await fireEvent.update(screen.getByLabelText('最在意 2'), '顶部不要塌')
    await fireEvent.click(screen.getByRole('button', { name: '添加最在意' }))
    await fireEvent.update(screen.getByLabelText('最在意 3'), '保留自然发流')
    expect((screen.getByRole('button', { name: '添加最在意' }) as HTMLButtonElement).disabled).toBe(true)
    await fireEvent.click(screen.getByRole('button', { name: '删除最在意 2' }))
    expect(screen.queryByLabelText('最在意 3')).toBeNull()
    await fireEvent.update(screen.getByLabelText('绝对不要 1'), '不要推白')
    await fireEvent.click(screen.getByRole('button', { name: '保存沟通卡' }))

    expect(await screen.findByRole('heading', { level: 1, name: '编辑理发师沟通卡' })).toBeTruthy()
    expect((await defaultArchiveRepository.getBrief(plan.id))?.targetCandidateId).toBe('brief-candidate-2')
    const preview = screen.getByRole('region', { name: '理发师沟通卡预览' })
    expect(within(preview).getByText(plainText)).toBeTruthy()
    expect(await within(preview).findByRole('img', { name: /纹理短碎发/ })).toBeTruthy()
    expect(preview.querySelector('img[src="x"]')).toBeNull()
    expect(preview.querySelector('[onerror]')).toBeNull()

    await router.push('/archive')
    expect(await screen.findByRole('heading', { name: '已保存 1 张沟通卡' })).toBeTruthy()
    expect(screen.getByRole('link', { name: /夏末短发计划.*纹理短碎发/ })).toBeTruthy()
    await router.push(`/archive/plans/${plan.id}`)
    expect(await screen.findByRole('link', { name: '查看沟通卡' })).toBeTruthy()
    await router.push(`/archive/plans/${plan.id}/brief`)
    expect(await screen.findByDisplayValue(plainText)).toBeTruthy()

    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined)
    await fireEvent.click(screen.getByRole('button', { name: '打印沟通卡' }))
    expect(print).toHaveBeenCalledOnce()

    vi.spyOn(briefExport, 'exportBriefPng').mockRejectedValueOnce(new Error('canvas blocked'))
    await fireEvent.click(screen.getByRole('button', { name: '导出 PNG' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/导出失败/)
    expect(screen.queryByText(/已导出/)).toBeNull()

    vi.spyOn(defaultArchiveRepository, 'saveBrief').mockRejectedValueOnce(
      new ArchiveStorageError('unavailable', new Error('technical')),
    )
    await fireEvent.update(screen.getByLabelText('整体'), '不应持久化的修改')
    await fireEvent.click(screen.getByRole('button', { name: '保存修改' }))
    const editHeading = await screen.findByRole('heading', { level: 1, name: '编辑理发师沟通卡' })
    expect(editHeading.closest('section')?.getAttribute('aria-labelledby')).toBe(editHeading.id)

    await fireEvent.update(screen.getByLabelText('整体'), '编辑后的整体要求')
    await fireEvent.click(screen.getByRole('button', { name: '保存修改' }))
    expect(within(screen.getByRole('region', { name: '理发师沟通卡预览' })).getByText('编辑后的整体要求')).toBeTruthy()
    await waitFor(async () => {
      expect((await defaultArchiveRepository.getBrief(plan.id))?.overall).toBe('编辑后的整体要求')
    })

    const confirmDelete = vi.spyOn(window, 'confirm').mockReturnValue(true)
    await fireEvent.click(screen.getByRole('button', { name: '删除沟通卡' }))
    expect(confirmDelete).toHaveBeenCalled()
    await waitFor(() => expect(router.currentRoute.value.path).toBe(`/archive/plans/${plan.id}`))
    expect(await defaultArchiveRepository.getBrief(plan.id)).toBeUndefined()
    expect(await defaultArchiveRepository.getPlan(plan.id)).toBeDefined()
  })

  test('shows a legacy brief instead of claiming it does not exist', async () => {
    await defaultArchiveRepository.createProfile(existingProfile)
    const plan: HaircutPlan = {
      id: 'legacy-brief-plan',
      profileId: existingProfile.id,
      title: '旧版计划',
      date: '2025-08-01',
      status: 'ready',
      createdAt: '2025-08-01T00:00:00.000Z',
      updatedAt: '2025-08-01T00:00:00.000Z',
    }
    await defaultArchiveRepository.savePlanWithCandidates(plan, [1, 2].map((order) => ({
      id: `legacy-brief-candidate-${order}`,
      planId: plan.id,
      order,
      name: `旧候选 ${order}`,
      notes: '',
      source: 'demo_ai' as const,
      demoImagePath: order === 1
        ? '/demo/persona-lin-bob.webp'
        : '/demo/persona-ran-crop.webp',
    })))
    await defaultArchiveDb.briefs.add({
      id: 'legacy-brief',
      profileId: existingProfile.id,
      planId: plan.id,
      overall: '旧版整体要求',
      top: '旧版顶部要求',
      fringe: '旧版刘海要求',
      sides: '旧版两侧要求',
      sideburns: '旧版鬓角要求',
      back: '旧版后脑要求',
      topPriorities: ['旧版最在意'],
      absoluteAvoids: ['旧版绝对不要'],
    } as unknown as BarberBrief)

    const router = await renderAt('/archive')
    const legacyBriefLink = await screen.findByRole('link', {
      name: '旧版计划 · 旧版未记录目标候选 · 查看沟通卡',
    })
    expect(within(legacyBriefLink).getByText('旧版未记录目标候选')).toBeTruthy()
    expect(within(legacyBriefLink).queryByText('旧候选 1')).toBeNull()

    await router.push(`/archive/plans/${plan.id}/brief`)
    expect(await screen.findByRole('heading', { level: 1, name: '编辑理发师沟通卡' })).toBeTruthy()
    expect(screen.getByText('旧版沟通卡未记录目标候选，已预选计划中的第一项；保存后才会更新。')).toBeTruthy()
    expect(await screen.findByDisplayValue('旧版整体要求')).toBeTruthy()
    expect((await screen.findAllByText('旧版整体要求')).length).toBeGreaterThan(0)
    expect(screen.queryByText(/没有.*沟通卡/)).toBeNull()
  })

  test('keeps legacy-source and completed plans read-only instead of replacing their candidates', async () => {
    await defaultArchiveRepository.createProfile(existingProfile)
    const legacyPlan: HaircutPlan = {
      id: 'legacy-plan',
      profileId: existingProfile.id,
      title: '旧参考图计划',
      date: '2025-08-01',
      status: 'draft',
      createdAt: '2025-08-01T00:00:00.000Z',
      updatedAt: '2025-08-01T00:00:00.000Z',
    }
    const legacyCandidates: Candidate[] = [1, 2].map((order) => ({
      id: `legacy-candidate-${order}`,
      planId: legacyPlan.id,
      order,
      name: `旧参考 ${order}`,
      notes: '',
      source: 'user_reference',
    }))
    await defaultArchiveRepository.savePlanWithCandidates(legacyPlan, legacyCandidates)
    const completedPlan: HaircutPlan = {
      ...legacyPlan,
      id: 'completed-plan',
      title: '已完成计划',
      status: 'completed',
    }
    await defaultArchiveRepository.savePlanWithCandidates(completedPlan, [
      {
        id: 'completed-candidate-1',
        planId: completedPlan.id,
        order: 1,
        name: '齐颌短鲍伯',
        notes: '',
        source: 'demo_ai',
        demoImagePath: '/demo/persona-lin-bob.webp',
      },
      {
        id: 'completed-candidate-2',
        planId: completedPlan.id,
        order: 2,
        name: '纹理短碎发',
        notes: '',
        source: 'demo_ai',
        demoImagePath: '/demo/persona-ran-crop.webp',
      },
    ])
    const router = await renderAt(`/archive/plans/${legacyPlan.id}`)

    expect(await screen.findByText('旧来源候选或已完成计划暂时只读')).toBeTruthy()
    expect(screen.queryByRole('link', { name: '编辑计划' })).toBeNull()
    await router.push(`/archive/plans/${legacyPlan.id}/edit`)
    expect(await screen.findByRole('heading', { level: 2, name: '此计划暂时只读' })).toBeTruthy()
    expect(screen.getByText(/避免编辑时丢失来源/)).toBeTruthy()
    expect(await defaultArchiveRepository.listCandidates(legacyPlan.id)).toEqual(legacyCandidates)

    await router.push(`/archive/plans/${completedPlan.id}/edit`)
    expect(await screen.findByText(/不会把它降级为草稿/)).toBeTruthy()
    expect((await defaultArchiveRepository.getPlan(completedPlan.id))?.status).toBe('completed')
  })

  test('defaults a new record to the local calendar day near midnight', async () => {
    await defaultArchiveRepository.createProfile(existingProfile)
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 10, 3, 7))

    try {
      await renderAt('/archive/records/new')
      await vi.waitFor(() => {
        expect((screen.getByLabelText('理发日期') as HTMLInputElement).value).toBe('2026-08-10')
      })
    } finally {
      vi.useRealTimers()
    }
  })

  test('keeps every legacy photo in an unreplaced stage while editing text', async () => {
    await defaultArchiveRepository.createProfile(existingProfile)
    const record: HaircutRecord = {
      id: 'record-with-legacy-photos',
      profileId: existingProfile.id,
      date: '2026-08-20',
      status: 'completed',
      satisfaction: 4,
      styleName: '旧版短发',
      outcome: 'repeat',
      createdAt: '2026-08-20T10:00:00.000Z',
      updatedAt: '2026-08-20T10:00:00.000Z',
    }
    await defaultArchiveRepository.saveRecordWithPhotos(record, [
      {
        id: 'legacy-styled-1',
        recordId: record.id,
        stage: 'styled',
        image: new NodeFile(['legacy-one'], 'legacy-one.webp', { type: 'image/webp' }) as unknown as File,
        capturedAt: '2026-08-20T10:00:00.000Z',
      },
      {
        id: 'legacy-styled-2',
        recordId: record.id,
        stage: 'styled',
        image: new NodeFile(['legacy-two'], 'legacy-two.webp', { type: 'image/webp' }) as unknown as File,
        capturedAt: '2026-08-20T11:00:00.000Z',
      },
    ])

    const router = await renderAt(`/archive/records/${record.id}/edit`)
    expect(await screen.findByText('已保留：已造型照片')).toBeTruthy()
    await fireEvent.update(screen.getByLabelText('备注'), '只修改文字')
    await fireEvent.click(screen.getByRole('button', { name: '保存修改' }))
    await waitFor(() => expect(router.currentRoute.value.path).toBe(`/archive/records/${record.id}`))

    const savedPhotos = await defaultArchiveRepository.listPhotos(record.id)
    expect(savedPhotos.map(({ id }) => id)).toEqual(['legacy-styled-1', 'legacy-styled-2'])
    expect(await Promise.all(savedPhotos.map(({ image }) => image.text()))).toEqual([
      'legacy-one',
      'legacy-two',
    ])
  })

  test('validates the record form, converts yuan to cents, and preserves an unreplaced photo on edit', async () => {
    await defaultArchiveRepository.createProfile(existingProfile)
    const router = await renderAt('/archive/records/new')

    expect(await screen.findByRole('heading', { level: 1, name: '记录这次理发' })).toBeTruthy()
    await screen.findByLabelText('理发日期')
    expect(document.querySelectorAll('input[type="file"]')).toHaveLength(6)
    await fireEvent.update(screen.getByLabelText('理发日期'), '2026-08-20')
    await fireEvent.update(screen.getByLabelText('发型名'), '纹理短碎发')
    await fireEvent.update(screen.getByLabelText('价格（元）'), '128.555')
    await fireEvent.update(screen.getByLabelText('满意度'), '5')
    await fireEvent.click(screen.getByRole('button', { name: '保存剪后记录' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/价格.*两位小数/)
    expect(await defaultArchiveRepository.listRecords(existingProfile.id)).toEqual([])

    await fireEvent.update(screen.getByLabelText('价格（元）'), '128.50')
    await fireEvent.click(screen.getByRole('button', { name: '保存剪后记录' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/至少.*一张照片/)
    await fireEvent.update(screen.getByLabelText('店铺'), '巷口理发店')
    await fireEvent.update(screen.getByLabelText('理发师'), 'Tony')
    await fireEvent.update(screen.getByLabelText('服务'), '洗剪吹')
    await fireEvent.update(screen.getByLabelText('耗时（分钟）'), '75')
    await fireEvent.update(screen.getByLabelText('备注'), '顶部保留自然纹理')
    const styledPhotoInput = screen.getByLabelText('已造型照片') as HTMLInputElement
    Object.defineProperty(styledPhotoInput, 'files', {
      configurable: true,
      value: [localPhoto],
    })
    await fireEvent(styledPhotoInput, new Event('change', { bubbles: true }))
    await fireEvent.click(screen.getByLabelText('避雷'))
    await fireEvent.update(screen.getByLabelText('避雷规则 1'), '   ')
    await fireEvent.click(screen.getByRole('button', { name: '保存剪后记录' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/1 到 3 条非空规则/)
    expect(await defaultArchiveRepository.listRecords(existingProfile.id)).toEqual([])
    await fireEvent.click(screen.getByLabelText('复刻'))
    await fireEvent.click(screen.getByRole('button', { name: '保存剪后记录' }))

    await waitFor(() => expect(router.currentRoute.value.path).not.toBe('/archive/records/new'))
    const record = (await defaultArchiveRepository.listRecords(existingProfile.id))[0]
    expect(record).toMatchObject({
      styleName: '纹理短碎发',
      priceCents: 12850,
      durationMinutes: 75,
      outcome: 'repeat',
    })
    expect((await defaultArchiveRepository.listPhotos(record?.id ?? ''))[0]?.stage).toBe('styled')
    expect(await screen.findByText('¥128.50')).toBeTruthy()
    expect(screen.getByText('5 / 5')).toBeTruthy()
    expect(screen.getByText('已存为标准发型')).toBeTruthy()

    await fireEvent.click(screen.getByRole('link', { name: '编辑记录' }))
    expect(await screen.findByText('已保留：已造型照片')).toBeTruthy()
    await fireEvent.update(screen.getByLabelText('满意度'), '2')
    await fireEvent.click(screen.getByLabelText('避雷'))
    await fireEvent.update(screen.getByLabelText('避雷规则 1'), '两侧不要推白')
    await fireEvent.click(screen.getByRole('button', { name: '保存修改' }))

    expect(await screen.findByText('这次记为避雷')).toBeTruthy()
    expect(screen.getByText('两侧不要推白')).toBeTruthy()
    expect(await (await defaultArchiveRepository.listPhotos(record?.id ?? ''))[0]?.image.text()).toBe('styled-photo')
    expect(await defaultArchiveRepository.listStandardStylesByProfile(existingProfile.id)).toEqual([])
    expect(await defaultArchiveRepository.listAvoidRulesByProfile(existingProfile.id)).toMatchObject([
      { text: '两侧不要推白', active: true },
    ])
  })

  test('shows a real recent record on archive and home, then deletes only that record', async () => {
    await defaultArchiveRepository.createProfile(existingProfile)
    const plan: HaircutPlan = {
      id: 'record-plan',
      profileId: existingProfile.id,
      title: '保留的计划',
      date: '2026-08-18',
      status: 'ready',
      createdAt: '2026-08-18T00:00:00.000Z',
      updatedAt: '2026-08-18T00:00:00.000Z',
    }
    await defaultArchiveRepository.savePlanWithCandidates(plan, [1, 2].map((order) => ({
      id: `record-plan-candidate-${order}`,
      planId: plan.id,
      order,
      name: `候选 ${order}`,
      notes: '',
      source: 'demo_ai' as const,
      demoImagePath: order === 1
        ? '/demo/persona-lin-bob.webp'
        : '/demo/persona-ran-crop.webp',
    })))
    const record: HaircutRecord = {
      id: 'real-record',
      profileId: existingProfile.id,
      planId: plan.id,
      date: '2026-08-20',
      status: 'completed',
      satisfaction: 5,
      styleName: '清爽短碎发',
      outcome: 'repeat',
      createdAt: '2026-08-20T10:00:00.000Z',
      updatedAt: '2026-08-20T10:00:00.000Z',
    }
    const photo: HaircutPhoto = {
      id: 'real-photo',
      recordId: record.id,
      stage: 'styled',
      image: localPhoto,
      capturedAt: '2026-08-20T10:00:00.000Z',
    }
    await defaultArchiveRepository.saveRecordWithPhotos(record, [photo])

    const router = await renderAt('/archive')
    expect(await screen.findByRole('link', { name: /清爽短碎发/ })).toBeTruthy()
    expect(screen.getByRole('heading', { name: '标准发型' })).toBeTruthy()
    expect(screen.getAllByText('清爽短碎发').length).toBeGreaterThan(0)
    expect(screen.getByText('还没有避雷规则。')).toBeTruthy()

    await router.push('/')
    expect(await screen.findByText('上次发型 · 清爽短碎发')).toBeTruthy()
    expect(screen.getByText('满意度 5 / 5')).toBeTruthy()
    expect(screen.getByText(/下次可以复刻/)).toBeTruthy()
    expect(screen.getByRole('img', { name: /清爽短碎发.*已造型/ })).toBeTruthy()
    expect(URL.revokeObjectURL).toHaveBeenCalled()
    const revocationsAfterArchive = vi.mocked(URL.revokeObjectURL).mock.calls.length

    await router.push(`/archive/records/${record.id}`)
    await screen.findByRole('heading', { level: 1, name: '清爽短碎发' })
    expect(vi.mocked(URL.revokeObjectURL).mock.calls.length).toBeGreaterThan(revocationsAfterArchive)
    const revocationsAfterHome = vi.mocked(URL.revokeObjectURL).mock.calls.length
    const confirmDelete = vi.spyOn(window, 'confirm').mockReturnValue(true)
    await fireEvent.click(await screen.findByRole('button', { name: '删除记录' }))
    expect(confirmDelete).toHaveBeenCalledWith(expect.stringMatching(/档案和计划会保留/))
    expect(await screen.findByText('还没有剪后记录。记录至少一张照片和满意度，之后才能形成复刻或避雷提醒。')).toBeTruthy()
    expect(vi.mocked(URL.revokeObjectURL).mock.calls.length).toBeGreaterThan(revocationsAfterHome)
    expect(await defaultArchiveRepository.getProfile(existingProfile.id)).toBeDefined()
    expect(await defaultArchiveRepository.getPlan(plan.id)).toBeDefined()
  })

  test('shows a home storage error before either empty or historical content', async () => {
    vi.spyOn(defaultArchiveRepository, 'listProfiles').mockRejectedValueOnce(
      new ArchiveStorageError('unavailable', new Error('technical')),
    )

    await renderAt('/')

    expect((await screen.findByRole('alert')).textContent).toMatch(/不可用|无痕/)
    expect(screen.queryByRole('link', { name: '查看短发示例并进入试发型' })).toBeNull()
    expect(screen.queryByText(/上次发型/)).toBeNull()
  })
})
