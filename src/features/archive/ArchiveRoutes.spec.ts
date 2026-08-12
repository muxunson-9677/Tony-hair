/// <reference types="node" />

import { Blob as NodeBlob, File as NodeFile } from 'node:buffer'

import { fireEvent, render, screen, waitFor, within } from '@testing-library/vue'
import { createPinia } from 'pinia'
import { createMemoryHistory } from 'vue-router'
import { afterAll, afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import App from '../../App.vue'
import { createAppRouter } from '../../router'
import { ArchiveStorageError } from './ArchiveRepository'
import { defaultArchiveDb, defaultArchiveRepository } from './archiveStore'
import * as briefExport from './briefExport'
import * as localImages from '../images/prepareLocalImage'
import { defaultHairstyleLibraryRepository } from '../hairstyle-library/libraryStore'
import type { PrivateHairstyleReference } from '../hairstyle-library/types'
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

const privateReference = (
  id: string,
  name: string,
  content = id,
): PrivateHairstyleReference => {
  const image = new NodeBlob([content], { type: 'image/webp' }) as unknown as Blob
  return {
    id,
    fingerprint: `fingerprint-${id}`,
    name,
    notes: `${name}的私人备注`,
    tags: ['私人参考'],
    image,
    width: 900,
    height: 1200,
    bytes: image.size,
    processedAt: '2026-08-10T01:00:00.000Z',
    createdAt: '2026-08-10T01:00:00.000Z',
    updatedAt: '2026-08-10T01:00:00.000Z',
  }
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

async function chooseRepeatDecision() {
  await fireEvent.update(screen.getByLabelText('满意度'), '5')
  await fireEvent.click(screen.getByLabelText('就这样'))
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
    expect(screen.queryByRole('navigation', { name: '主导航' })).toBeNull()
    expect(document.querySelector('#main-content')?.classList.contains('app-main--without-nav')).toBe(true)
    await waitFor(() => expect(document.title).toBe('建立发型档案｜Tony宝'))
  })

  test('shows a storage load error before the missing-profile plan state', async () => {
    vi.spyOn(defaultArchiveRepository, 'listProfiles').mockRejectedValueOnce(
      new ArchiveStorageError('unavailable', new Error('technical')),
    )

    await renderAt('/archive/plans/new')

    expect((await screen.findByRole('alert')).textContent).toMatch(/不可用|无痕/)
    expect(screen.queryByText('请先建立发型档案')).toBeNull()
  })

  test('does not invent hair facts before a new user has answered', async () => {
    await renderAt('/archive/profile')

    expect((await screen.findByLabelText('发质') as HTMLSelectElement).value).toBe('unsure')
    expect((screen.getByLabelText('发丝粗细') as HTMLSelectElement).value).toBe('unsure')
    expect((screen.getByLabelText('发量') as HTMLSelectElement).value).toBe('unsure')
    expect((screen.getByLabelText('洗发频率') as HTMLSelectElement).value).toBe('unsure')
    expect((screen.getByLabelText('日常打理分钟') as HTMLInputElement).value).toBe('')
  })

  test('reveals profile setup in three calm stages instead of one long form', async () => {
    await renderAt('/archive/profile')
    await screen.findByLabelText('称呼')

    const steps = document.querySelectorAll<HTMLDetailsElement>('.profile-setup-step')
    expect(steps).toHaveLength(3)
    expect(Array.from(steps, (step) => step.open)).toEqual([true, false, false])
    expect(Array.from(steps, (step) => step.querySelector('summary')?.getAttribute('data-tactile'))).toEqual(['true', 'true', 'true'])
    expect(screen.getByText('先放一张现在的头发照片')).toBeTruthy()
    expect(screen.getByText('再告诉我你想呈现的感觉')).toBeTruthy()
    expect(screen.getByText('最后补充你确定的头发条件')).toBeTruthy()
    const firstStep = steps[0]
    expect(firstStep && within(firstStep).getByText('先保存，其他以后再补').closest('button')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: '保存档案' })).toHaveLength(1)
  })

  test('does not stack empty database sections after the first profile is created', async () => {
    await defaultArchiveRepository.createProfile(existingProfile)

    await renderAt('/archive')

    expect(await screen.findByRole('region', { name: '下一步' })).toBeTruthy()
    expect(screen.getByRole('link', { name: '准备下次怎么剪' }).getAttribute('data-tactile')).toBe('true')
    expect(screen.getByRole('link', { name: '记录这次理发' }).getAttribute('data-tactile')).toBe('true')
    expect(screen.queryByRole('heading', { name: '还没有Tony卡' })).toBeNull()
    expect(screen.queryByRole('heading', { name: '标准发型' })).toBeNull()
    expect(screen.queryByRole('heading', { name: '避雷规则' })).toBeNull()
    expect(screen.queryByText(/还没有剪后记录/)).toBeNull()
  })

  test('turns stored profile facts and photos into a personal archive summary', async () => {
    const profilePhoto = new NodeBlob(['front-photo'], { type: 'image/webp' }) as unknown as Blob
    await defaultArchiveRepository.createProfile({
      ...existingProfile,
      hairTexture: 'straight',
      genderIdentity: 'woman',
      presentationPreference: 'androgynous',
      profilePhotos: [{
        id: 'profile-front',
        angle: 'front',
        image: profilePhoto,
        width: 900,
        height: 1200,
        bytes: profilePhoto.size,
        processedAt: '2026-08-12T00:00:00.000Z',
      }],
    })

    await renderAt('/archive')

    const wall = await screen.findByRole('group', { name: '阿青的头发照片墙' })
    expect(within(wall).getByRole('img', { name: '我的头发正面照片' })).toBeTruthy()
    expect(within(wall).getByText('正面')).toBeTruthy()
    expect(screen.getByText('性别：女')).toBeTruthy()
    expect(screen.getByText('更喜欢中性呈现')).toBeTruthy()
    expect(screen.getByText('已保存正面照；以后可以再补侧面、后脑。')).toBeTruthy()
    expect(screen.getByText('直发 · 细发丝 · 发量适中')).toBeTruthy()
  })

  test('gives a photo-less legacy profile one clear personalisation action', async () => {
    await defaultArchiveRepository.createProfile(existingProfile)

    await renderAt('/archive')

    expect(await screen.findByText('先补一张正面照，让档案一眼就是你的。')).toBeTruthy()
    expect(screen.getByRole('link', { name: '添加我的头发照片' }).getAttribute('href'))
      .toBe('/archive/profile')
  })

  test('returns through a canonical add pointer after creating a profile without creating a half-plan', async () => {
    const router = await renderAt('/archive/plans/new?add=catalog:lin-bob')

    await waitFor(() => expect(router.currentRoute.value.path).toBe('/archive/profile'))
    expect(router.currentRoute.value.query.next)
      .toBe('/archive/plans/new?add=catalog:lin-bob')
    expect(await defaultArchiveDb.plans.count()).toBe(0)

    await fireEvent.update(await screen.findByLabelText('称呼'), '小林')
    await fireEvent.click(screen.getByRole('button', { name: '保存档案' }))

    await waitFor(() => {
      expect(router.currentRoute.value.path).toBe('/archive/plans/new')
      expect(router.currentRoute.value.query.add).toBeUndefined()
    })
    const selected = await screen.findByRole('region', { name: '已选候选' })
    expect(within(selected).getByText('齐颌短鲍伯')).toBeTruthy()
    expect(within(selected).getByText('已选择 1 / 4')).toBeTruthy()
    expect(await defaultArchiveDb.plans.count()).toBe(0)
  })

  test('falls back to the archive when the canonical profile return target changes during save', async () => {
    let releaseSave!: () => void
    const savePending = new Promise<void>((resolve) => {
      releaseSave = resolve
    })
    const createProfile = vi.spyOn(defaultArchiveRepository, 'createProfile')
      .mockImplementation(async (profile) => {
        await savePending
        return profile.id
      })
    const firstReturn = '/archive/plans/new?add=catalog:lin-bob'
    const secondReturn = '/archive/plans/new?add=catalog:qiao-ivy'
    const router = await renderAt(
      `/archive/profile?next=${encodeURIComponent(firstReturn)}`,
    )

    await fireEvent.update(await screen.findByLabelText('称呼'), '小林')
    await fireEvent.click(screen.getByRole('button', { name: '保存档案' }))
    await waitFor(() => expect(createProfile).toHaveBeenCalledOnce())
    await router.replace(`/archive/profile?next=${encodeURIComponent(secondReturn)}`)
    releaseSave()

    await waitFor(() => expect(router.currentRoute.value.fullPath).toBe('/archive'))
  })

  test('does not hijack a newer route when profile creation finishes after unmount', async () => {
    let releaseSave!: () => void
    const savePending = new Promise<void>((resolve) => {
      releaseSave = resolve
    })
    const createProfile = vi.spyOn(defaultArchiveRepository, 'createProfile')
      .mockImplementation(async (profile) => {
        await savePending
        return profile.id
      })
    const returnPath = '/archive/plans/new?add=catalog:lin-bob'
    const router = await renderAt(
      `/archive/profile?next=${encodeURIComponent(returnPath)}`,
    )

    await fireEvent.update(await screen.findByLabelText('称呼'), '小林')
    await fireEvent.click(screen.getByRole('button', { name: '保存档案' }))
    await waitFor(() => expect(createProfile).toHaveBeenCalledOnce())
    await router.push('/styles')
    releaseSave()
    await createProfile.mock.results[0]?.value
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(router.currentRoute.value.path).toBe('/styles')
  })

  test('rejects a next value that was double encoded before Vue decoded the route query', async () => {
    const canonical = '/archive/plans/new?add=catalog:lin-bob'
    await renderAt(
      `/archive/profile?next=${encodeURIComponent(encodeURIComponent(canonical))}`,
    )

    expect((await screen.findByRole('link', { name: '返回档案' })).getAttribute('href'))
      .toBe('/archive')
  })

  test('does not consume an add pointer when the hairstyle library hydration fails', async () => {
    await defaultArchiveRepository.createProfile(existingProfile)
    vi.spyOn(defaultHairstyleLibraryRepository, 'listPrivateReferences')
      .mockRejectedValueOnce(new Error('library unavailable'))
    const router = await renderAt('/archive/plans/new?add=catalog:lin-bob')

    expect((await screen.findByRole('alert')).textContent).toMatch(/发型库.*无法读取/)
    expect(router.currentRoute.value.query.add).toBe('catalog:lin-bob')
    expect(await defaultArchiveDb.plans.count()).toBe(0)
  })

  test('rejects a missing private pointer before asking a user without a profile to continue', async () => {
    const router = await renderAt('/archive/plans/new?add=private_reference:missing')

    expect((await screen.findByRole('alert')).textContent).toMatch(/找不到|已删除/)
    await waitFor(() => expect(router.currentRoute.value.fullPath).toBe('/archive/plans/new'))
    expect(await defaultArchiveDb.plans.count()).toBe(0)
  })

  test('consumes only the newest add pointer when an older library load finishes late', async () => {
    await defaultArchiveRepository.createProfile(existingProfile)
    const slowReference = privateReference('slow-reference', '慢请求参考')
    const fastReference = privateReference('fast-reference', '新请求参考')
    let releaseReferences!: (references: PrivateHairstyleReference[]) => void
    const referencesPending = new Promise<PrivateHairstyleReference[]>((resolve) => {
      releaseReferences = resolve
    })
    const listReferences = vi.spyOn(defaultHairstyleLibraryRepository, 'listPrivateReferences')
      .mockReturnValueOnce(referencesPending)
    const router = await renderAt(
      '/archive/plans/new?add=private_reference:slow-reference',
    )
    await waitFor(() => expect(listReferences).toHaveBeenCalledOnce())

    await router.push('/archive/plans/new?add=private_reference:fast-reference')
    releaseReferences([slowReference, fastReference])

    const selected = await screen.findByRole('region', { name: '已选候选' })
    expect(within(selected).getByText('新请求参考')).toBeTruthy()
    expect(within(selected).queryByText('慢请求参考')).toBeNull()
    await waitFor(() => expect(router.currentRoute.value.query.add).toBeUndefined())
    expect(vi.mocked(URL.createObjectURL).mock.calls.some(
      ([blob]) => blob === slowReference.image,
    )).toBe(false)
    const latestPreviewCall = vi.mocked(URL.createObjectURL).mock.calls
      .map(([blob], index) => ({ blob, index }))
      .filter(({ blob }) => blob === fastReference.image)
      .at(-1)
    const latestPreviewUrl = latestPreviewCall
      ? vi.mocked(URL.createObjectURL).mock.results[latestPreviewCall.index]?.value
      : undefined
    expect(latestPreviewUrl).toMatch(/^blob:test-/)
    await router.push('/archive')
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(latestPreviewUrl)
    expect(await defaultArchiveDb.plans.count()).toBe(0)
  })

  test('does not consume or preview a private add pointer after the plan form unmounts', async () => {
    await defaultArchiveRepository.createProfile(existingProfile)
    const lateReference = privateReference('late-reference', '迟到的私人参考')
    let releaseReferences!: (references: PrivateHairstyleReference[]) => void
    const referencesPending = new Promise<PrivateHairstyleReference[]>((resolve) => {
      releaseReferences = resolve
    })
    const listReferences = vi.spyOn(defaultHairstyleLibraryRepository, 'listPrivateReferences')
      .mockReturnValueOnce(referencesPending)
    const router = await renderAt(
      '/archive/plans/new?add=private_reference:late-reference',
    )
    await waitFor(() => expect(listReferences).toHaveBeenCalledOnce())

    await router.push('/archive')
    releaseReferences([lateReference])
    await waitFor(() => expect(router.currentRoute.value.path).toBe('/archive'))

    expect(vi.mocked(URL.createObjectURL).mock.calls.some(
      ([blob]) => blob === lateReference.image,
    )).toBe(false)
    expect(await defaultArchiveDb.plans.count()).toBe(0)
  })

  test('rejects missing or noncanonical add pointers honestly and removes the consumed query', async () => {
    await defaultArchiveRepository.createProfile(existingProfile)
    const router = await renderAt('/archive/plans/new?add=private_reference:missing')

    expect((await screen.findByRole('alert')).textContent).toMatch(/找不到|已删除/)
    await waitFor(() => expect(router.currentRoute.value.query.add).toBeUndefined())

    await router.push('/archive/plans/new?add=catalog:lin-bob&unexpected=1')
    expect((await screen.findByRole('alert')).textContent).toMatch(/无效|过期/)
    await waitFor(() => expect(router.currentRoute.value.query.add).toBeUndefined())
    expect(router.currentRoute.value.query.unexpected).toBeUndefined()
    expect(await defaultArchiveDb.plans.count()).toBe(0)
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

  test.each([
    '/archive/plans/slow-unmount-plan',
    '/archive/plans/slow-unmount-plan/brief',
  ])('does not create candidate Object URLs after %s unmounts during archive load', async (path) => {
    await defaultArchiveRepository.createProfile(existingProfile)
    const localSnapshot = new NodeBlob(['slow-unmount-snapshot'], {
      type: 'image/webp',
    }) as unknown as Blob
    const slowPlan: HaircutPlan = {
      id: 'slow-unmount-plan',
      profileId: existingProfile.id,
      title: '迟到加载计划',
      date: '2026-08-22',
      mode: 'exploration',
      status: 'draft',
      createdAt: '2026-08-10T02:00:00.000Z',
      updatedAt: '2026-08-10T02:00:00.000Z',
    }
    await defaultArchiveRepository.savePlanWithCandidates(slowPlan, [{
      id: 'slow-unmount-private',
      planId: slowPlan.id,
      order: 1,
      name: '本地快照',
      notes: '',
      source: 'user_reference',
      referenceId: 'slow-unmount-reference',
      referenceImage: localSnapshot,
      referenceImageWidth: 900,
      referenceImageHeight: 1200,
      referenceImageBytes: localSnapshot.size,
      referenceImageProcessedAt: '2026-08-10T02:00:00.000Z',
    }, {
      id: 'slow-unmount-demo',
      planId: slowPlan.id,
      order: 2,
      name: '齐颌短鲍伯',
      notes: '',
      source: 'demo_ai',
      demoImagePath: '/demo/persona-lin-bob.webp',
    }])
    const storedCandidates = await defaultArchiveRepository.listCandidates(slowPlan.id)
    let releaseProfiles!: () => void
    const profilesPending = new Promise<HairProfile[]>((resolve) => {
      releaseProfiles = () => resolve([existingProfile])
    })
    const listProfiles = vi.spyOn(defaultArchiveRepository, 'listProfiles')
      .mockReturnValueOnce(profilesPending)
    let releaseCandidates!: () => void
    const candidatesPending = new Promise<Candidate[]>((resolve) => {
      releaseCandidates = () => resolve(storedCandidates)
    })
    const listCandidates = vi.spyOn(defaultArchiveRepository, 'listCandidates')
      .mockReturnValueOnce(candidatesPending)
    const router = await renderAt(path)
    await waitFor(() => expect(listProfiles).toHaveBeenCalledOnce())

    await router.push('/styles')
    releaseProfiles()
    await waitFor(() => expect(listCandidates).toHaveBeenCalledWith(slowPlan.id))
    releaseCandidates()
    await candidatesPending
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })

  test('keeps an empty repeat plan editable so the user can repair its StandardStyle selection', async () => {
    await defaultArchiveRepository.createProfile(existingProfile)
    const emptyRepeatPlan: HaircutPlan = {
      id: 'empty-repeat-plan',
      profileId: existingProfile.id,
      title: '待选择标准发型',
      date: '2026-08-22',
      mode: 'repeat',
      status: 'draft',
      createdAt: '2026-08-10T02:00:00.000Z',
      updatedAt: '2026-08-10T02:00:00.000Z',
    }
    await defaultArchiveDb.plans.add(emptyRepeatPlan)

    await renderAt(`/archive/plans/${emptyRepeatPlan.id}`)

    expect(await screen.findByRole('link', { name: '调整这次剪法' })).toBeTruthy()
  })

  test('gives brief loading and missing states real h1 headings', async () => {
    vi.spyOn(defaultArchiveRepository, 'listProfiles').mockRejectedValueOnce(
      new ArchiveStorageError('unavailable', new Error('technical')),
    )
    await renderAt('/archive/plans/missing/brief')
    const errorHeading = await screen.findByRole('heading', {
      level: 1,
      name: '暂时无法读取Tony卡',
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
    expect(document.querySelectorAll('input[type="file"]')).toHaveLength(3)

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
    expect(screen.getByText('微卷 · 细发丝 · 发量适中')).toBeTruthy()
    expect(screen.getByRole('region', { name: '下一步' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: '最近剪后记录' })).toBeNull()
    expect(screen.queryByRole('heading', { name: '还没有Tony卡' })).toBeNull()

    await fireEvent.click(screen.getByRole('link', { name: '编辑档案' }))
    await fireEvent.update(await screen.findByLabelText('称呼'), '林同学')
    await fireEvent.click(screen.getByRole('button', { name: '保存修改' }))
    expect(await screen.findByRole('heading', { level: 2, name: '林同学的发型档案' })).toBeTruthy()

    const confirmDelete = vi.spyOn(window, 'confirm').mockReturnValue(true)
    await fireEvent.click(screen.getByRole('link', { name: '编辑档案' }))
    await fireEvent.click(await screen.findByRole('button', { name: '删除档案及其内容' }))

    await waitFor(() => expect(confirmDelete).toHaveBeenCalledWith(expect.stringMatching(/同时删除.*计划.*历史/)))
    expect(await screen.findByText('这台设备还没有发型档案')).toBeTruthy()
  })

  test('saves two unique demo candidates, shows the detail, edits, and deletes only the plan', async () => {
    await defaultArchiveRepository.createProfile(existingProfile)
    const router = await renderAt('/archive/plans/new')

    expect(await screen.findByRole('heading', { level: 1, name: '准备下次怎么剪' })).toBeTruthy()
    expect(await screen.findByText(/示例体验/)).toBeTruthy()
    expect(screen.getByText(/非用户生成/)).toBeTruthy()
    expect(screen.getByLabelText('本地参考图')).toBeTruthy()
    expect(screen.getByRole('heading', { name: '从剪后记录复刻' })).toBeTruthy()
    expect(screen.getByText('还没有带照片的剪后记录。')).toBeTruthy()

    await fireEvent.update(screen.getByLabelText('计划标题'), '夏末短发计划')
    await fireEvent.update(screen.getByLabelText('计划日期'), '2026-08-22')
    await fireEvent.update(screen.getByLabelText('计划状态'), 'ready')
    await fireEvent.click(screen.getByRole('button', { name: '加入候选：齐颌短鲍伯' }))
    await fireEvent.click(screen.getByRole('button', { name: '加入候选：纹理短碎发' }))

    const selected = screen.getByRole('region', { name: '已选候选' })
    expect(within(selected).getAllByRole('img')).toHaveLength(2)
    expect(screen.getByText('已选择 2 / 4')).toBeTruthy()
    await fireEvent.click(screen.getByRole('button', { name: '保存计划' }))

    await waitFor(() => expect(router.currentRoute.value.path).not.toBe('/archive/plans/new'))
    expect((await defaultArchiveRepository.getPlan(
      router.currentRoute.value.params.id as string,
    ))?.mode).toBe('exploration')
    expect(await screen.findByRole('heading', { level: 1, name: '夏末短发计划' })).toBeTruthy()
    expect(screen.getAllByText('示例体验 · 非用户生成').length).toBeGreaterThan(0)
    expect(screen.getByRole('img', { name: /齐颌短鲍伯/ })).toBeTruthy()
    expect(screen.getByRole('img', { name: /纹理短碎发/ })).toBeTruthy()
    expect(screen.queryByRole('link', { name: '发起好友投票' })).toBeNull()

    await fireEvent.click(screen.getByRole('link', { name: '调整这次剪法' }))
    await fireEvent.update(await screen.findByLabelText('计划标题'), '更新后的夏末计划')
    expect(await screen.findByText('已选择 2 / 4')).toBeTruthy()
    await fireEvent.click(screen.getByRole('button', { name: '保存修改' }))
    expect(await screen.findByRole('heading', { level: 1, name: '更新后的夏末计划' })).toBeTruthy()

    const confirmDelete = vi.spyOn(window, 'confirm').mockReturnValue(true)
    await fireEvent.click(screen.getByRole('button', { name: '删除计划' }))
    await waitFor(() => expect(confirmDelete).toHaveBeenCalledWith(expect.stringMatching(/删除.*计划/)))
    expect(await screen.findByRole('heading', { level: 2, name: '阿青的发型档案' })).toBeTruthy()
    expect(screen.getByRole('region', { name: '下一步' })).toBeTruthy()
    expect(screen.queryByText(/还没有发型计划/)).toBeNull()
  })

  test('offers an explicit exploration fallback when no active standard style exists', async () => {
    await defaultArchiveRepository.createProfile(existingProfile)
    const router = await renderAt('/archive/plans/new')

    await fireEvent.click(await screen.findByLabelText(/复刻标准发型/))
    expect(await screen.findByRole('heading', { name: '还没有可复刻的标准发型' })).toBeTruthy()
    expect(router.currentRoute.value.path).toBe('/archive/plans/new')
    expect(screen.queryByRole('heading', { name: '选择预制短发' })).toBeNull()

    await fireEvent.click(screen.getByRole('button', { name: '转为探索计划' }))
    expect(await screen.findByRole('heading', { name: '选择预制短发' })).toBeTruthy()
    expect(router.currentRoute.value.path).toBe('/archive/plans/new')
  })

  test('creates a one-snapshot repeat plan and keeps its detail, brief, and export after source deletion', async () => {
    await defaultArchiveRepository.createProfile(existingProfile)
    const snapshotBlob = new NodeBlob(['repeat-snapshot'], {
      type: 'image/webp',
    }) as unknown as Blob
    const record: HaircutRecord = {
      id: 'repeat-source-record',
      profileId: existingProfile.id,
      date: '2026-08-19',
      status: 'completed',
      satisfaction: 5,
      styleName: '可复刻短碎发',
      outcome: 'repeat',
      createdAt: '2026-08-19T10:00:00.000Z',
      updatedAt: '2026-08-19T10:00:00.000Z',
    }
    await defaultArchiveRepository.saveRecordWithPhotos(record, [{
      id: 'repeat-source-photo',
      recordId: record.id,
      stage: 'after',
      image: snapshotBlob,
      capturedAt: record.updatedAt,
      width: 900,
      height: 1200,
      bytes: snapshotBlob.size,
      processedAt: record.updatedAt,
    }])
    const router = await renderAt('/archive/plans/new')

    await fireEvent.click(await screen.findByLabelText(/复刻标准发型/))
    await fireEvent.click(screen.getByRole('button', { name: '选择标准发型：可复刻短碎发' }))
    expect(screen.getByText('已选择 1 / 1')).toBeTruthy()
    await fireEvent.update(screen.getByLabelText('计划标题'), '照上次再剪')
    await fireEvent.click(screen.getByRole('button', { name: '保存计划' }))

    await waitFor(() => expect(router.currentRoute.value.name).toBe('archive-plan-detail'))
    const planId = router.currentRoute.value.params.id as string
    expect(await defaultArchiveRepository.getPlan(planId)).toMatchObject({ mode: 'repeat' })
    const [savedSnapshot] = await defaultArchiveRepository.listCandidates(planId)
    expect(savedSnapshot).toMatchObject({ source: 'past_record', pastRecordId: record.id })
    expect(await savedSnapshot?.referenceImage?.text()).toBe('repeat-snapshot')

    await defaultArchiveRepository.deleteRecord(record.id)
    await router.push('/archive')
    await router.push(`/archive/plans/${planId}`)
    expect(await screen.findByRole('heading', { level: 1, name: '照上次再剪' })).toBeTruthy()
    expect(await screen.findByRole('img', { name: /可复刻短碎发.*本地候选图/ })).toBeTruthy()
    expect(screen.getByRole('link', { name: '调整这次剪法' })).toBeTruthy()

    const exportPng = vi.spyOn(briefExport, 'exportBriefPng').mockResolvedValue({
      blob: new NodeBlob(['png'], { type: 'image/png' }) as unknown as Blob,
      filename: 'repeat-brief.png',
      width: 1440,
      height: 2200,
    })
    await router.push(`/archive/plans/${planId}/brief`)
    expect(await screen.findByRole('heading', { level: 1, name: '创建Tony卡' })).toBeTruthy()
    await fireEvent.update(screen.getByLabelText('整体'), '按快照复刻整体轮廓')
    await fireEvent.update(screen.getByLabelText('顶部'), '保留顶部长度')
    await fireEvent.update(screen.getByLabelText('刘海'), '自然向前')
    await fireEvent.update(screen.getByLabelText('两侧'), '不要推白')
    await fireEvent.update(screen.getByLabelText('鬓角'), '保留自然尖角')
    await fireEvent.update(screen.getByLabelText('后脑'), '贴合收干净')
    await fireEvent.update(screen.getByLabelText('最在意 1'), '轮廓一致')
    await fireEvent.update(screen.getByLabelText('绝对不要 1'), '不要打薄')
    await fireEvent.click(screen.getByRole('button', { name: '保存Tony卡' }))
    expect(await screen.findByText('Tony卡已保存在当前设备，到店直接打开。')).toBeTruthy()
    expect(await defaultArchiveRepository.getBrief(planId)).toMatchObject({
      targetCandidateId: savedSnapshot?.id,
    })
    await fireEvent.click(screen.getByRole('button', { name: '导出 PNG' }))
    const exported = exportPng.mock.calls[0]?.[0].imageSource
    expect(typeof exported).not.toBe('string')
    expect(await (exported as Blob).text()).toBe('repeat-snapshot')
  })

  test('keeps a private-reference snapshot usable in plan detail, brief, and export after deleting its library source', async () => {
    await defaultArchiveRepository.createProfile(existingProfile)
    const privateImage = new NodeBlob(['private-plan-snapshot'], {
      type: 'image/webp',
    }) as unknown as Blob
    const savedReference = await defaultHairstyleLibraryRepository.savePrivateReference({
      name: '我的层次短发参考',
      notes: '顶部保留层次，两侧不要推白。',
      tags: ['层次', '短发'],
      image: privateImage,
      width: 900,
      height: 1200,
      bytes: privateImage.size,
      processedAt: '2026-08-20T09:30:00.000Z',
    })
    const router = await renderAt(
      `/archive/plans/new?add=private_reference:${savedReference.id}`,
    )

    const selected = await screen.findByRole('region', { name: '已选候选' })
    expect(within(selected).getByText(savedReference.name)).toBeTruthy()
    await fireEvent.click(screen.getByRole('button', { name: '加入候选：纹理短碎发' }))
    await fireEvent.update(screen.getByLabelText('计划标题'), '私人参考探索计划')
    await fireEvent.click(screen.getByRole('button', { name: '保存计划' }))

    await waitFor(() => expect(router.currentRoute.value.name).toBe('archive-plan-detail'))
    const planId = router.currentRoute.value.params.id as string
    const savedCandidates = await defaultArchiveRepository.listCandidates(planId)
    const privateCandidate = savedCandidates.find(({ source }) => source === 'user_reference')
    expect(await privateCandidate?.referenceImage?.text()).toBe('private-plan-snapshot')

    await defaultHairstyleLibraryRepository.deletePrivateReference(savedReference.id)
    await router.push('/archive')
    await router.push(`/archive/plans/${planId}`)
    expect(await screen.findByRole('img', {
      name: /我的层次短发参考.*本地候选图/,
    })).toBeTruthy()

    const exportPng = vi.spyOn(briefExport, 'exportBriefPng').mockResolvedValue({
      blob: new NodeBlob(['png'], { type: 'image/png' }) as unknown as Blob,
      filename: 'private-reference-brief.png',
      width: 1440,
      height: 2200,
    })
    await router.push(`/archive/plans/${planId}/brief`)
    expect(await screen.findByRole('heading', {
      level: 1,
      name: '创建Tony卡',
    })).toBeTruthy()
    await fireEvent.update(screen.getByLabelText('整体'), '按私人参考保留整体轮廓')
    await fireEvent.update(screen.getByLabelText('顶部'), '顶部保留层次')
    await fireEvent.update(screen.getByLabelText('刘海'), '自然向前')
    await fireEvent.update(screen.getByLabelText('两侧'), '不要推白')
    await fireEvent.update(screen.getByLabelText('鬓角'), '保留自然尖角')
    await fireEvent.update(screen.getByLabelText('后脑'), '贴合收干净')
    await fireEvent.update(screen.getByLabelText('最在意 1'), '轮廓一致')
    await fireEvent.update(screen.getByLabelText('绝对不要 1'), '不要打薄')
    await fireEvent.click(screen.getByRole('button', { name: '保存Tony卡' }))
    expect(await defaultArchiveRepository.getBrief(planId)).toMatchObject({
      targetCandidateId: privateCandidate?.id,
    })
    await fireEvent.click(screen.getByRole('button', { name: '导出 PNG' }))
    const exported = exportPng.mock.calls[0]?.[0].imageSource
    expect(typeof exported).not.toBe('string')
    expect(await (exported as Blob).text()).toBe('private-plan-snapshot')
  })

  test('mixes a prepared reference, a real past record, and a demo while preserving ids on edit', async () => {
    await defaultArchiveRepository.createProfile(existingProfile)
    const record: HaircutRecord = {
      id: 'source-record',
      profileId: existingProfile.id,
      date: '2026-08-19',
      status: 'completed',
      satisfaction: 5,
      styleName: '清爽短碎发',
      outcome: 'repeat',
      createdAt: '2026-08-19T10:00:00.000Z',
      updatedAt: '2026-08-19T10:00:00.000Z',
    }
    const sourcePhoto = new NodeBlob(['real-record-photo'], { type: 'image/webp' }) as unknown as Blob
    await defaultArchiveRepository.saveRecordWithPhotos(record, [{
      id: 'source-record-photo',
      recordId: record.id,
      stage: 'after',
      image: sourcePhoto,
      capturedAt: record.updatedAt,
      width: 900,
      height: 1200,
      bytes: sourcePhoto.size,
      processedAt: record.updatedAt,
    }])
    const preparedBlob = new NodeBlob(['prepared-private-reference'], {
      type: 'image/webp',
    }) as unknown as Blob
    vi.spyOn(localImages, 'prepareLocalImage').mockResolvedValue({
      blob: preparedBlob,
      mimeType: 'image/webp',
      width: 960,
      height: 1280,
      originalWidth: 1200,
      originalHeight: 1600,
      bytes: preparedBlob.size,
      processedAt: '2026-08-20T09:30:00.000Z',
    })
    const router = await renderAt('/archive/plans/new')
    const input = await screen.findByLabelText('本地参考图') as HTMLInputElement
    Object.defineProperty(input, 'files', { configurable: true, value: [localPhoto] })

    await fireEvent(input, new Event('change', { bubbles: true }))

    expect(await screen.findByText(/960 × 1280.*26 B/)).toBeTruthy()
    await fireEvent.click(screen.getByText('继续添加或更换候选'))
    await fireEvent.click(screen.getByRole('button', { name: '加入历史候选：清爽短碎发' }))
    await fireEvent.click(screen.getByText('继续添加或更换候选'))
    const firstCandidateAction = screen.getByRole('button', { name: '加入候选：齐颌短鲍伯' })
    expect(firstCandidateAction.getAttribute('data-tactile')).toBe('true')
    expect(screen.getByRole('button', { name: '保存计划' }).getAttribute('data-tactile')).toBe('true')
    await fireEvent.click(firstCandidateAction)
    expect(screen.getByText('已选择 3 / 4')).toBeTruthy()
    await fireEvent.update(screen.getByLabelText('计划标题'), '三种来源计划')
    await fireEvent.click(screen.getByRole('button', { name: '保存计划' }))

    await waitFor(() => expect(router.currentRoute.value.path).not.toBe('/archive/plans/new'))
    const planId = router.currentRoute.value.params.id as string
    const saved = await defaultArchiveRepository.listCandidates(planId)
    expect(saved.map(({ source }) => source)).toEqual([
      'user_reference',
      'past_record',
      'demo_ai',
    ])
    expect(await saved[0]?.referenceImage?.text()).toBe('prepared-private-reference')
    expect(saved[0]).toMatchObject({
      referenceImageWidth: 960,
      referenceImageHeight: 1280,
      referenceImageBytes: preparedBlob.size,
      referenceImageProcessedAt: '2026-08-20T09:30:00.000Z',
    })
    expect(await saved[1]?.referenceImage?.text()).toBe('real-record-photo')
    expect(saved[1]?.pastRecordId).toBe(record.id)
    await screen.findByRole('heading', { level: 1, name: '三种来源计划' })
    await waitFor(() => {
      expect(URL.createObjectURL).toHaveBeenCalledWith(preparedBlob)
      expect(URL.createObjectURL).toHaveBeenCalledWith(sourcePhoto)
      const candidateList = screen.getByRole('list', { name: '这次比较的方向' })
      expect(within(candidateList).getAllByRole('img')).toHaveLength(3)
    })
    const originalIds = saved.map(({ id }) => id)

    await fireEvent.click(screen.getByRole('link', { name: '调整这次剪法' }))
    expect(await screen.findByText('已选择 3 / 4')).toBeTruthy()
    await fireEvent.update(screen.getByLabelText('计划标题'), '保留候选标识的计划')
    await fireEvent.click(screen.getByRole('button', { name: '保存修改' }))

    await waitFor(() => expect(router.currentRoute.value.path).toBe(`/archive/plans/${planId}`))
    expect((await defaultArchiveRepository.listCandidates(planId)).map(({ id }) => id))
      .toEqual(originalIds)
    expect(URL.revokeObjectURL).toHaveBeenCalled()

    const exportPng = vi.spyOn(briefExport, 'exportBriefPng').mockResolvedValue({
      blob: new NodeBlob(['png'], { type: 'image/png' }) as unknown as Blob,
      filename: 'brief.png',
      width: 1440,
      height: 2200,
    })
    await router.push(`/archive/plans/${planId}/brief`)
    await screen.findByRole('heading', { level: 1, name: '创建Tony卡' })
    await fireEvent.click(screen.getByLabelText('目标候选：我的参考图 1'))
    await fireEvent.click(screen.getByRole('button', { name: '导出 PNG' }))
    const exportedSource = exportPng.mock.calls[0]?.[0].imageSource
    expect(typeof exportedSource).not.toBe('string')
    expect(await (exportedSource as Blob).text()).toBe('prepared-private-reference')
  })

  test('freezes candidate changes while a local reference is being prepared', async () => {
    await defaultArchiveRepository.createProfile(existingProfile)
    let finishPreparation!: (value: localImages.PreparedLocalImage) => void
    vi.spyOn(localImages, 'prepareLocalImage').mockReturnValue(new Promise((resolve) => {
      finishPreparation = resolve
    }))
    await renderAt('/archive/plans/new')
    await screen.findByRole('button', { name: '加入候选：齐颌短鲍伯' })
    for (const name of ['齐颌短鲍伯', '轻层次精灵短发', '常春藤侧分']) {
      await fireEvent.click(screen.getByRole('button', { name: `加入候选：${name}` }))
    }
    const input = screen.getByLabelText('本地参考图') as HTMLInputElement
    Object.defineProperty(input, 'files', { configurable: true, value: [localPhoto] })
    await fireEvent(input, new Event('change', { bubbles: true }))

    expect((await screen.findByRole('status')).textContent).toContain('本地处理中…')
    const fourthChoice = screen.getByRole('button', { name: '加入候选：清爽渐层' })
    try {
      expect((fourthChoice as HTMLButtonElement).disabled).toBe(true)
      expect((screen.getAllByRole('button', { name: '移除' })[0] as HTMLButtonElement).disabled)
        .toBe(true)
    } finally {
      const prepared = new NodeBlob(['ready'], { type: 'image/webp' }) as unknown as Blob
      finishPreparation({
        blob: prepared,
        mimeType: 'image/webp',
        width: 800,
        height: 1200,
        originalWidth: 800,
        originalHeight: 1200,
        bytes: prepared.size,
        processedAt: '2026-08-20T09:30:00.000Z',
      })
    }

    expect(await screen.findByText('已选择 4 / 4')).toBeTruthy()
    expect(screen.queryByText('已选择 5 / 4')).toBeNull()
  })

  test('creates, reloads, previews, prints, reports export failure, edits, and deletes only a brief', async () => {
    await defaultArchiveRepository.createProfile(existingProfile)
    const plan: HaircutPlan = {
      id: 'brief-plan',
      profileId: existingProfile.id,
      title: '夏末短发计划',
      date: '2026-08-22',
      mode: 'exploration',
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

    const createBrief = await screen.findByRole('link', { name: '准备给理发师看的内容' })
    expect(createBrief.getAttribute('data-tactile')).toBe('true')
    expect(createBrief.classList).toContain('plan-primary-action')
    const mainCandidateAction = screen.getByRole('link', { name: '选“纹理短碎发”为主方案' })
    expect(mainCandidateAction.getAttribute('data-tactile')).toBe('true')
    await fireEvent.click(mainCandidateAction)
    expect(await screen.findByRole('heading', { level: 1, name: '创建Tony卡' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '保存Tony卡' }).getAttribute('data-tactile')).toBe('true')
    expect(screen.getByRole('button', { name: '导出 PNG' }).getAttribute('data-tactile')).toBe('true')
    expect(screen.getByRole('link', { name: '返回计划' }).getAttribute('href')).toBe(`/archive/plans/${plan.id}`)
    expect(screen.queryByRole('navigation', { name: '主导航' })).toBeNull()
    expect((screen.getByLabelText('整体') as HTMLTextAreaElement).value).toMatch(/自然卷.*不要贴头皮/)
    expect((screen.getByLabelText('顶部') as HTMLTextAreaElement).value).toMatch(/卷束.*回缩/)
    expect((screen.getByLabelText('绝对不要 1') as HTMLInputElement).value).toBe('不要湿发判断到过短')

    const targetRadio = screen.getByLabelText('目标候选：纹理短碎发') as HTMLInputElement
    expect(targetRadio.checked).toBe(true)
    await fireEvent.update(screen.getByLabelText('备选方案'), 'brief-candidate-1')
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
    await fireEvent.click(screen.getByRole('button', { name: '保存Tony卡' }))

    expect(await screen.findByRole('heading', { level: 1, name: '编辑Tony卡' })).toBeTruthy()
    expect((await defaultArchiveRepository.getBrief(plan.id))?.targetCandidateId).toBe('brief-candidate-2')
    expect((await defaultArchiveRepository.getBrief(plan.id))?.backupCandidateId).toBe('brief-candidate-1')
    const preview = screen.getByRole('region', { name: 'Tony卡预览' })
    expect(within(preview).getByText(plainText)).toBeTruthy()
    expect(await within(preview).findByRole('img', { name: /纹理短碎发/ })).toBeTruthy()
    expect(within(preview).getByText('备选 · 齐颌短鲍伯')).toBeTruthy()
    expect(preview.querySelector('img[src="x"]')).toBeNull()
    expect(preview.querySelector('[onerror]')).toBeNull()

    await fireEvent.click(screen.getByRole('link', { name: '到店打开' }))
    expect(await screen.findByRole('navigation', { name: '理发现场操作' })).toBeTruthy()
    expect(screen.queryByRole('navigation', { name: '主导航' })).toBeNull()
    expect(screen.queryByRole('heading', { level: 1, name: '编辑Tony卡' })).toBeNull()
    const barberPreview = screen.getByRole('region', { name: 'Tony卡预览' })
    const prioritiesHeading = within(barberPreview).getByRole('heading', { name: '最在意' })
    const regionalDetails = within(barberPreview).getByText('查看顶部、刘海和侧后细节').closest('details')
    expect(regionalDetails?.open).toBe(false)
    expect(prioritiesHeading.compareDocumentPosition(regionalDetails as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByRole('button', { name: '保存图片备用' })).toBeTruthy()
    await router.push(`/archive/plans/${plan.id}/brief`)

    await router.push('/archive')
    expect(await screen.findByRole('heading', { name: '给理发师看的内容 · 1 份' })).toBeTruthy()
    expect(screen.getByRole('link', { name: /夏末短发计划.*纹理短碎发/ })).toBeTruthy()
    await router.push(`/archive/plans/${plan.id}`)
    expect(await screen.findByRole('link', { name: '给理发师看' })).toBeTruthy()
    await router.push(`/archive/plans/${plan.id}/brief`)
    expect(await screen.findByDisplayValue(plainText)).toBeTruthy()

    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined)
    await fireEvent.click(screen.getByRole('button', { name: '打印Tony卡' }))
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
    const editHeading = await screen.findByRole('heading', { level: 1, name: '编辑Tony卡' })
    expect(editHeading.closest('section')?.getAttribute('aria-labelledby')).toBe(editHeading.id)

    await fireEvent.update(screen.getByLabelText('整体'), '编辑后的整体要求')
    await fireEvent.click(screen.getByRole('button', { name: '保存修改' }))
    expect(within(screen.getByRole('region', { name: 'Tony卡预览' })).getByText('编辑后的整体要求')).toBeTruthy()
    await waitFor(async () => {
      expect((await defaultArchiveRepository.getBrief(plan.id))?.overall).toBe('编辑后的整体要求')
    })

    const confirmDelete = vi.spyOn(window, 'confirm').mockReturnValue(true)
    await fireEvent.click(screen.getByRole('button', { name: '删除Tony卡' }))
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
      mode: 'exploration',
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
      name: '旧版计划 · 旧版未记录目标候选 · 给理发师看',
    })
    expect(within(legacyBriefLink).getByText('旧版未记录目标候选')).toBeTruthy()
    expect(within(legacyBriefLink).queryByText('旧候选 1')).toBeNull()

    await router.push(`/archive/plans/${plan.id}/brief`)
    expect(await screen.findByRole('heading', { level: 1, name: '编辑Tony卡' })).toBeTruthy()
    expect(screen.getByText('旧版Tony卡未记录目标候选，已预选计划中的第一项；保存后才会更新。')).toBeTruthy()
    expect(await screen.findByDisplayValue('旧版整体要求')).toBeTruthy()
    expect((await screen.findAllByText('旧版整体要求')).length).toBeGreaterThan(0)
    expect(screen.queryByText(/没有.*Tony卡/)).toBeNull()
  })

  test('keeps legacy-source and completed plans read-only instead of replacing their candidates', async () => {
    await defaultArchiveRepository.createProfile(existingProfile)
    const legacyPlan: HaircutPlan = {
      id: 'legacy-plan',
      profileId: existingProfile.id,
      title: '旧参考图计划',
      date: '2025-08-01',
      mode: 'exploration',
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
    await defaultArchiveDb.plans.add(legacyPlan)
    await defaultArchiveDb.candidates.bulkAdd(legacyCandidates)
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

    expect(await screen.findByText('旧来源或已完成的剪法暂时不能修改')).toBeTruthy()
    expect(screen.queryByRole('link', { name: '调整这次剪法' })).toBeNull()
    await router.push(`/archive/plans/${legacyPlan.id}/edit`)
    expect(await screen.findByRole('heading', { level: 2, name: '这份下次剪法暂时不能修改' })).toBeTruthy()
    expect(screen.getByText(/避免编辑时丢失来源/)).toBeTruthy()
    expect(await defaultArchiveRepository.listCandidates(legacyPlan.id)).toEqual(legacyCandidates)

    await router.push(`/archive/plans/${completedPlan.id}/edit`)
    expect(await screen.findByText(/不会把它降级为草稿/)).toBeTruthy()
    expect((await defaultArchiveRepository.getPlan(completedPlan.id))?.status).toBe('completed')
  })

  test('keeps a hybrid demo read-only and exports the same demo image shown in the brief', async () => {
    await defaultArchiveRepository.createProfile(existingProfile)
    const hybridImage = new NodeBlob(['hidden-reference'], {
      type: 'image/webp',
    }) as unknown as Blob
    const hybridPlan: HaircutPlan = {
      id: 'hybrid-demo-plan',
      profileId: existingProfile.id,
      title: '混合来源旧计划',
      date: '2026-08-01',
      mode: 'exploration',
      status: 'draft',
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
    }
    await defaultArchiveDb.plans.add(hybridPlan)
    await defaultArchiveDb.candidates.bulkAdd([
      {
        id: 'hybrid-demo-candidate',
        planId: hybridPlan.id,
        order: 1,
        name: '混合预制图',
        notes: '',
        source: 'demo_ai',
        demoImagePath: '/demo/persona-lin-bob.webp',
        referenceImage: hybridImage,
        referenceImageWidth: 900,
        referenceImageHeight: 1200,
        referenceImageBytes: hybridImage.size,
        referenceImageProcessedAt: '2026-08-01T00:00:00.000Z',
      },
      {
        id: 'clean-demo-candidate',
        planId: hybridPlan.id,
        order: 2,
        name: '正常预制图',
        notes: '',
        source: 'demo_ai',
        demoImagePath: '/demo/persona-ran-crop.webp',
      },
    ])
    const exportPng = vi.spyOn(briefExport, 'exportBriefPng').mockResolvedValue({
      blob: new NodeBlob(['png'], { type: 'image/png' }) as unknown as Blob,
      filename: 'brief.png',
      width: 1440,
      height: 2200,
    })

    const router = await renderAt(`/archive/plans/${hybridPlan.id}`)
    expect(await screen.findByText('旧来源或已完成的剪法暂时不能修改')).toBeTruthy()
    expect(screen.queryByRole('link', { name: '调整这次剪法' })).toBeNull()
    await router.push(`/archive/plans/${hybridPlan.id}/brief`)
    expect(await screen.findByRole('img', { name: '混合预制图候选图' })).toHaveProperty(
      'src',
      expect.stringContaining('/demo/persona-lin-bob.webp'),
    )
    await fireEvent.click(screen.getByRole('button', { name: '导出 PNG' }))
    expect(exportPng).toHaveBeenCalledWith(expect.objectContaining({
      imageSource: '/demo/persona-lin-bob.webp',
    }))
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
    await screen.findByLabelText('备注')
    expect(screen.queryByText('已保留：已造型照片')).toBeNull()
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
    const preparedBlob = new NodeBlob(['prepared-photo'], {
      type: 'image/webp',
    }) as unknown as Blob
    const prepareImage = vi.spyOn(localImages, 'prepareLocalImage').mockResolvedValue({
      blob: preparedBlob,
      mimeType: 'image/webp',
      width: 1280,
      height: 1920,
      originalWidth: 2000,
      originalHeight: 3000,
      bytes: preparedBlob.size,
      processedAt: '2026-08-20T09:30:00.000Z',
    })
    const saveRecord = vi.spyOn(defaultArchiveRepository, 'saveRecordWithPhotos')
    const router = await renderAt('/archive/records/new')

    expect(await screen.findByRole('heading', { level: 1, name: '记录这次理发' })).toBeTruthy()
    await screen.findByLabelText('理发日期')
    expect(document.querySelectorAll('.record-photos input[type="file"]')).toHaveLength(2)
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
    await chooseRepeatDecision()
    const styledPhotoInput = screen.getByLabelText('剪后照片') as HTMLInputElement
    Object.defineProperty(styledPhotoInput, 'files', {
      configurable: true,
      value: [localPhoto],
    })
    await fireEvent(styledPhotoInput, new Event('change', { bubbles: true }))
    expect(await screen.findByText(/1280 × 1920.*14 B/)).toBeTruthy()
    const preview = screen.getByRole('img', { name: '剪后处理后预览' })
    const previewCallIndex = vi.mocked(URL.createObjectURL).mock.calls.findIndex(
      ([blob]) => blob === preparedBlob,
    )
    const previewUrl = vi.mocked(URL.createObjectURL).mock.results[previewCallIndex]?.value
    expect(preview.getAttribute('src')).toBe(previewUrl)
    expect(previewUrl).toBeTruthy()
    await fireEvent.click(screen.getByLabelText('别再这样'))
    await fireEvent.update(screen.getByLabelText('避雷规则 1'), '   ')
    await fireEvent.click(screen.getByRole('button', { name: '保存剪后记录' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/1 到 3 条非空规则/)
    expect(await defaultArchiveRepository.listRecords(existingProfile.id)).toEqual([])
    await fireEvent.click(screen.getByLabelText('就这样'))
    await fireEvent.click(screen.getByRole('button', { name: '保存剪后记录' }))

    await waitFor(() => expect(router.currentRoute.value.path).not.toBe('/archive/records/new'))
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(previewUrl)
    const record = (await defaultArchiveRepository.listRecords(existingProfile.id))[0]
    expect(record).toMatchObject({
      styleName: '纹理短碎发',
      priceCents: 12850,
      durationMinutes: 75,
      outcome: 'repeat',
    })
    expect(prepareImage).toHaveBeenCalledWith(localPhoto)
    const submittedPhotos = saveRecord.mock.calls[0]?.[1]
    expect(submittedPhotos?.[0]).toMatchObject({
      stage: 'after',
      image: preparedBlob,
      width: 1280,
      height: 1920,
      bytes: preparedBlob.size,
      processedAt: '2026-08-20T09:30:00.000Z',
    })
    expect(submittedPhotos?.[0]?.image).not.toBe(localPhoto)
    const storedPhoto = (await defaultArchiveRepository.listPhotos(record?.id ?? ''))[0]
    expect(storedPhoto).toMatchObject({
      stage: 'after',
      width: 1280,
      height: 1920,
      bytes: preparedBlob.size,
      processedAt: '2026-08-20T09:30:00.000Z',
    })
    expect(await storedPhoto?.image.text()).toBe('prepared-photo')
    expect(await screen.findByText('¥128.50')).toBeTruthy()
    expect(screen.getByText('5 / 5')).toBeTruthy()
    expect(screen.getByText('下次可以照着剪')).toBeTruthy()
    expect(screen.queryByText('REPEAT')).toBeNull()

    await fireEvent.click(screen.getByRole('link', { name: '编辑记录' }))
    expect(await screen.findByText('已保留：剪后照片')).toBeTruthy()
    await fireEvent.update(screen.getByLabelText('满意度'), '2')
    await fireEvent.click(screen.getByLabelText('别再这样'))
    await fireEvent.update(screen.getByLabelText('避雷规则 1'), '两侧不要推白')
    await fireEvent.click(screen.getByRole('button', { name: '保存修改' }))

    expect(await screen.findByText('这次记为避雷')).toBeTruthy()
    expect(screen.getByText('两侧不要推白')).toBeTruthy()
    const editedPhoto = (await defaultArchiveRepository.listPhotos(record?.id ?? ''))[0]
    expect(await editedPhoto?.image.text()).toBe('prepared-photo')
    expect(editedPhoto).toMatchObject({
      width: 1280,
      height: 1920,
      bytes: preparedBlob.size,
      processedAt: '2026-08-20T09:30:00.000Z',
    })
    expect(await defaultArchiveRepository.listStandardStylesByProfile(existingProfile.id)).toEqual([])
    expect(await defaultArchiveRepository.listAvoidRulesByProfile(existingProfile.id)).toMatchObject([
      { text: '两侧不要推白', active: true },
    ])
  })

  test('shows the real before and after photos as the first comparison on record detail', async () => {
    await defaultArchiveRepository.createProfile(existingProfile)
    const record: HaircutRecord = {
      id: 'comparison-record',
      profileId: existingProfile.id,
      date: '2026-08-20',
      status: 'completed',
      satisfaction: 4,
      styleName: '对比短发',
      outcome: 'repeat',
      createdAt: '2026-08-20T10:00:00.000Z',
      updatedAt: '2026-08-20T10:00:00.000Z',
    }
    const beforeBlob = new NodeBlob(['before'], { type: 'image/webp' }) as unknown as Blob
    const afterBlob = new NodeBlob(['after'], { type: 'image/webp' }) as unknown as Blob
    await defaultArchiveRepository.saveRecordWithPhotos(record, [
      {
        id: 'comparison-before',
        recordId: record.id,
        stage: 'before',
        image: beforeBlob,
        capturedAt: record.createdAt,
      },
      {
        id: 'comparison-after',
        recordId: record.id,
        stage: 'after',
        image: afterBlob,
        capturedAt: record.updatedAt,
      },
    ])

    const router = await renderAt('/archive')
    expect(await screen.findByRole('group', { name: '最近一次剪前剪后' })).toBeTruthy()
    await router.push(`/archive/records/${record.id}`)

    const comparison = await screen.findByRole('group', { name: '剪前剪后对比' })
    expect(within(comparison).getByRole('img', { name: '对比短发的剪前照片' })).toBeTruthy()
    expect(within(comparison).getByRole('img', { name: '对比短发的剪后照片' })).toBeTruthy()
    expect(comparison.compareDocumentPosition(screen.getByText('下次可以照着剪')) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBeTruthy()
  })

  test('puts photos and the next-cut decision before metadata, then separates optional details', async () => {
    await defaultArchiveRepository.createProfile(existingProfile)
    await renderAt('/archive/records/new')

    const dateInput = await screen.findByLabelText('理发日期')
    const photoFieldset = screen.getByText('剪前 / 剪后 · 至少一张').closest('fieldset')
    const outcomeFieldset = screen.getByText('下次还这么剪吗？').closest('fieldset')
    const basicSummary = screen.getByText('日期、名称和满意度').closest('summary')
    const basicDetails = basicSummary?.closest('details')
    const salonSummary = screen.getByText('在哪剪的（可选）')
    const salonDetails = salonSummary.closest('details')
    const moreSummary = screen.getByText('更多记录（可选）')
    const moreDetails = moreSummary.closest('details')

    expect(photoFieldset).toBeTruthy()
    expect(outcomeFieldset).toBeTruthy()
    expect(Boolean(
      photoFieldset
      && outcomeFieldset
      && (photoFieldset.compareDocumentPosition(outcomeFieldset) & Node.DOCUMENT_POSITION_FOLLOWING),
    )).toBe(true)
    expect(Boolean(
      outcomeFieldset
      && basicDetails
      && (outcomeFieldset.compareDocumentPosition(basicDetails) & Node.DOCUMENT_POSITION_FOLLOWING),
    )).toBe(true)
    expect(basicDetails?.hasAttribute('open')).toBe(false)
    expect(basicDetails?.contains(dateInput)).toBe(true)
    expect(salonDetails).toBeTruthy()
    expect(salonDetails?.hasAttribute('open')).toBe(false)
    expect(salonDetails?.contains(screen.getByLabelText('店铺', { exact: true }))).toBe(true)
    expect(salonDetails?.contains(screen.getByLabelText('店铺位置（可选）'))).toBe(true)
    expect(moreDetails).toBeTruthy()
    expect(moreDetails?.hasAttribute('open')).toBe(false)
    expect(moreDetails?.contains(screen.getByLabelText('价格（元）'))).toBe(true)
    expect(screen.getByText('选择剪前照片')).toBeTruthy()
    expect(screen.getByText('选择剪后照片')).toBeTruthy()
    expect(screen.getByRole('radio', { name: '就这样' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: '有一点要改' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: '别再这样' })).toBeTruthy()
    await fireEvent.click(screen.getByRole('radio', { name: '有一点要改' }))
    expect((screen.getByLabelText('满意度') as HTMLSelectElement).value).toBe('3')
    expect(screen.getByLabelText('下次调整 1')).toBeTruthy()
  })

  test('turns three plain-language answers into three editable plan candidates', async () => {
    await defaultArchiveRepository.createProfile(existingProfile)
    const router = await renderAt('/archive/plans/new?intent=choose')

    expect(router.currentRoute.value.query.intent).toBe('choose')
    expect(screen.queryByRole('alert')).toBeNull()

    const goal = await screen.findByRole('group', { name: '这次最想解决什么？' })
    await fireEvent.click(within(goal).getByRole('button', { name: '每天少打理' }))

    const budget = await screen.findByRole('group', { name: '每天最多愿意打理多久？' })
    await fireEvent.click(within(budget).getByRole('button', { name: '5 分钟以内' }))

    const change = await screen.findByRole('group', { name: '这次想变化多大？' })
    await fireEvent.click(within(change).getByRole('button', { name: '有变化，但别太冒险' }))

    expect(await screen.findByRole('heading', { name: '先比较这三个方向' })).toBeTruthy()
    expect(screen.getByText('最稳妥')).toBeTruthy()
    expect(screen.getByText('最符合目标')).toBeTruthy()
    expect(screen.getByText('最值得尝试')).toBeTruthy()

    await fireEvent.click(screen.getByRole('button', { name: '一起比较这 3 个方向' }))

    const selected = await screen.findByRole('region', { name: '已选候选' })
    expect(within(selected).getByText('已选择 3 / 4')).toBeTruthy()
    expect(within(selected).getAllByRole('img')).toHaveLength(3)
    expect((screen.getByLabelText('计划标题') as HTMLInputElement).value).toBe('帮我选的下次剪法')
  })

  test('keeps the guided questions out of the ordinary plan form', async () => {
    await defaultArchiveRepository.createProfile(existingProfile)
    await renderAt('/archive/plans/new')

    expect(await screen.findByRole('heading', { name: '准备下次怎么剪' })).toBeTruthy()
    expect(screen.queryByText('先回答一件事')).toBeNull()
    expect(await screen.findByText('选择第一个候选')).toBeTruthy()
  })

  test('opens the repeat entry as a repeat plan without treating its intent as an add-source error', async () => {
    await defaultArchiveRepository.createProfile(existingProfile)
    const router = await renderAt('/archive/plans/new?intent=repeat')

    const repeatMode = await screen.findByLabelText('复刻标准发型') as HTMLInputElement
    expect(router.currentRoute.value.query.intent).toBe('repeat')
    expect(repeatMode.checked).toBe(true)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByText('从标准发型中选 1 个')).toBeTruthy()
  })

  test('waits for local image preparation before enabling save', async () => {
    await defaultArchiveRepository.createProfile(existingProfile)
    let finishPreparation!: (value: localImages.PreparedLocalImage) => void
    vi.spyOn(localImages, 'prepareLocalImage').mockReturnValue(new Promise((resolve) => {
      finishPreparation = resolve
    }))
    await renderAt('/archive/records/new')
    const saveButton = await screen.findByRole('button', { name: '保存剪后记录' })
    const input = screen.getByLabelText('剪后照片') as HTMLInputElement
    Object.defineProperty(input, 'files', { configurable: true, value: [localPhoto] })

    await fireEvent(input, new Event('change', { bubbles: true }))

    expect(await screen.findByText('本地处理中…')).toBeTruthy()
    expect((saveButton as HTMLButtonElement).disabled).toBe(true)

    const preparedBlob = new NodeBlob(['ready'], { type: 'image/webp' }) as unknown as Blob
    finishPreparation({
      blob: preparedBlob,
      mimeType: 'image/webp',
      width: 800,
      height: 1200,
      originalWidth: 800,
      originalHeight: 1200,
      bytes: preparedBlob.size,
      processedAt: '2026-08-20T09:30:00.000Z',
    })

    expect(await screen.findByText(/800 × 1200.*5 B/)).toBeTruthy()
    expect((saveButton as HTMLButtonElement).disabled).toBe(false)
  })

  test('shows a local failure and never saves an unprepared file', async () => {
    await defaultArchiveRepository.createProfile(existingProfile)
    vi.spyOn(localImages, 'prepareLocalImage').mockRejectedValue(
      new localImages.ImagePreparationError('decode_failed'),
    )
    const saveRecord = vi.spyOn(defaultArchiveRepository, 'saveRecordWithPhotos')
    await renderAt('/archive/records/new')
    await fireEvent.update(await screen.findByLabelText('理发日期'), '2026-08-20')
    await fireEvent.update(screen.getByLabelText('发型名'), '无法处理的照片')
    const input = screen.getByLabelText('剪后照片') as HTMLInputElement
    Object.defineProperty(input, 'files', { configurable: true, value: [localPhoto] })

    await fireEvent(input, new Event('change', { bubbles: true }))

    expect((await screen.findAllByText('无法读取这张照片，请换一张后重试。')).length)
      .toBeGreaterThan(0)
    await fireEvent.click(screen.getByRole('button', { name: '保存剪后记录' }))
    expect(saveRecord).not.toHaveBeenCalled()
    expect(await defaultArchiveRepository.listRecords(existingProfile.id)).toEqual([])
  })

  test('clears an optional failed photo so another prepared photo can still be saved', async () => {
    await defaultArchiveRepository.createProfile(existingProfile)
    const preparedBlob = new NodeBlob(['prepared'], { type: 'image/webp' }) as unknown as Blob
    vi.spyOn(localImages, 'prepareLocalImage')
      .mockResolvedValueOnce({
        blob: preparedBlob,
        mimeType: 'image/webp',
        width: 800,
        height: 1200,
        originalWidth: 800,
        originalHeight: 1200,
        bytes: preparedBlob.size,
        processedAt: '2026-08-20T09:30:00.000Z',
      })
      .mockRejectedValueOnce(new localImages.ImagePreparationError('decode_failed'))
    const router = await renderAt('/archive/records/new')
    await fireEvent.update(await screen.findByLabelText('理发日期'), '2026-08-20')
    await fireEvent.update(screen.getByLabelText('发型名'), '保留有效照片')
    const styledInput = screen.getByLabelText('剪后照片') as HTMLInputElement
    Object.defineProperty(styledInput, 'files', { configurable: true, value: [localPhoto] })
    await fireEvent(styledInput, new Event('change', { bubbles: true }))
    expect(await screen.findByText(/800 × 1200/)).toBeTruthy()
    const optionalInput = screen.getByLabelText('剪前照片') as HTMLInputElement
    Object.defineProperty(optionalInput, 'files', { configurable: true, value: [localPhoto] })
    await fireEvent(optionalInput, new Event('change', { bubbles: true }))
    expect((await screen.findAllByText('无法读取这张照片，请换一张后重试。')).length)
      .toBeGreaterThan(0)

    Object.defineProperty(optionalInput, 'files', { configurable: true, value: [] })
    await fireEvent(optionalInput, new Event('change', { bubbles: true }))

    await waitFor(() => {
      expect(screen.queryByText('请重新选择处理失败的照片。')).toBeNull()
      expect(screen.queryAllByText('无法读取这张照片，请换一张后重试。')).toEqual([])
    })
    await chooseRepeatDecision()
    await fireEvent.click(screen.getByRole('button', { name: '保存剪后记录' }))
    await waitFor(() => expect(router.currentRoute.value.path).not.toBe('/archive/records/new'))
    const record = (await defaultArchiveRepository.listRecords(existingProfile.id))[0]
    const photos = await defaultArchiveRepository.listPhotos(record?.id ?? '')
    expect(photos).toHaveLength(1)
    expect(await photos[0]?.image.text()).toBe('prepared')
  })

  test('freezes file selection while a record save is pending', async () => {
    await defaultArchiveRepository.createProfile(existingProfile)
    const preparedBlob = new NodeBlob(['prepared'], { type: 'image/webp' }) as unknown as Blob
    const prepareImage = vi.spyOn(localImages, 'prepareLocalImage').mockResolvedValue({
      blob: preparedBlob,
      mimeType: 'image/webp',
      width: 800,
      height: 1200,
      originalWidth: 800,
      originalHeight: 1200,
      bytes: preparedBlob.size,
      processedAt: '2026-08-20T09:30:00.000Z',
    })
    let releaseSave!: () => void
    const saveGate = new Promise<void>((resolve) => {
      releaseSave = resolve
    })
    const originalSave = defaultArchiveRepository.saveRecordWithPhotos.bind(defaultArchiveRepository)
    vi.spyOn(defaultArchiveRepository, 'saveRecordWithPhotos').mockImplementation(async (...args) => {
      await saveGate
      return originalSave(...args)
    })
    const router = await renderAt('/archive/records/new')
    await fireEvent.update(await screen.findByLabelText('理发日期'), '2026-08-20')
    await fireEvent.update(screen.getByLabelText('发型名'), '保存中冻结')
    const input = screen.getByLabelText('剪后照片') as HTMLInputElement
    Object.defineProperty(input, 'files', { configurable: true, value: [localPhoto] })
    await fireEvent(input, new Event('change', { bubbles: true }))
    expect(await screen.findByText(/800 × 1200/)).toBeTruthy()
    await chooseRepeatDecision()
    await fireEvent.click(screen.getByRole('button', { name: '保存剪后记录' }))

    try {
      await waitFor(() => expect(input.disabled).toBe(true))
      const lateFile = new NodeFile(['late-file'], 'late.webp', {
        type: 'image/webp',
      }) as unknown as File
      Object.defineProperty(input, 'files', { configurable: true, value: [lateFile] })
      await fireEvent(input, new Event('change', { bubbles: true }))
      expect(prepareImage).toHaveBeenCalledOnce()
    } finally {
      releaseSave()
    }

    await waitFor(() => expect(router.currentRoute.value.path).not.toBe('/archive/records/new'))
    const record = (await defaultArchiveRepository.listRecords(existingProfile.id))[0]
    expect(await (await defaultArchiveRepository.listPhotos(record?.id ?? ''))[0]?.image.text())
      .toBe('prepared')
  })

  test('shows a real recent record on archive and home, then deletes only that record', async () => {
    await defaultArchiveRepository.createProfile(existingProfile)
    const plan: HaircutPlan = {
      id: 'record-plan',
      profileId: existingProfile.id,
      title: '保留的计划',
      date: '2026-08-18',
      mode: 'exploration',
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
    expect(screen.getByRole('heading', { name: '满意的剪法' })).toBeTruthy()
    expect(screen.getAllByText('清爽短碎发').length).toBeGreaterThan(0)
    expect(screen.queryByText('还没有避雷规则。')).toBeNull()

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
    await screen.findByRole('heading', { level: 2, name: '阿青的发型档案' })
    expect(screen.getByRole('heading', { name: '最近剪后记录' })).toBeTruthy()
    expect(screen.getByRole('link', { name: '记录这次理发' })).toBeTruthy()
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
