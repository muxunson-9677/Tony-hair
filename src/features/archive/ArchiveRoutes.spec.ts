import { fireEvent, render, screen, waitFor, within } from '@testing-library/vue'
import { createPinia } from 'pinia'
import { createMemoryHistory } from 'vue-router'
import { afterAll, afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import App from '../../App.vue'
import { createAppRouter } from '../../router'
import { ArchiveStorageError } from './ArchiveRepository'
import { defaultArchiveDb, defaultArchiveRepository } from './archiveStore'
import type { Candidate, HairProfile, HaircutPlan } from './types'

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
    expect(screen.getByRole('heading', { name: '剪后记录暂不展示' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: '沟通卡暂不展示' })).toBeTruthy()
    expect(screen.queryByText('还没有剪后记录')).toBeNull()

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
})
