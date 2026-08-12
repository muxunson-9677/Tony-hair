/// <reference types="node" />

import { Blob as NodeBlob, File as NodeFile } from 'node:buffer'

import { fireEvent, render, screen, waitFor, within } from '@testing-library/vue'
import { createPinia } from 'pinia'
import { createMemoryHistory } from 'vue-router'
import { afterAll, afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import App from '../../App.vue'
import { createAppRouter } from '../../router'
import { ArchiveStorageError } from '../archive/ArchiveRepository'
import { defaultArchiveDb } from '../archive/archiveStore'
import {
  ImagePreparationError,
  type PreparedLocalImage,
} from '../images/prepareLocalImage'
import { defaultHairstyleLibraryRepository } from './libraryStore'
import type { HairstyleFavorite, PrivateHairstyleReference } from './types'

async function renderAt(path: string, provide: Record<string, unknown> = {}) {
  const router = createAppRouter(createMemoryHistory())
  await router.push(path)
  await router.isReady()
  const result = render(App, {
    global: {
      plugins: [createPinia(), router],
      provide,
    },
  })
  return { ...result, router }
}

const preparedImage = (
  blob: Blob,
  overrides: Partial<PreparedLocalImage> = {},
): PreparedLocalImage => ({
  blob,
  mimeType: blob.type as PreparedLocalImage['mimeType'],
  width: 900,
  height: 1200,
  originalWidth: 1800,
  originalHeight: 2400,
  bytes: blob.size,
  processedAt: '2026-08-11T00:00:00.000Z',
  ...overrides,
})

const selectReferenceImage = async (file: File) => {
  const input = (await screen.findByLabelText('选择私人参考照片')) as HTMLInputElement
  Object.defineProperty(input, 'files', { configurable: true, value: [file] })
  await fireEvent(input, new Event('change', { bubbles: true }))
  return input
}

const seedPrivateReference = async (
  name = '本机短发参考',
  content = 'saved-private-reference',
): Promise<PrivateHairstyleReference> => {
  const image = new NodeBlob([content], { type: 'image/webp' }) as unknown as Blob
  return defaultHairstyleLibraryRepository.savePrivateReference({
    name,
    notes: '只保留耳侧长度，不照搬颜色。',
    tags: ['通勤', '短发'],
    image,
    width: 900,
    height: 1200,
    bytes: image.size,
    processedAt: '2026-08-11T00:00:00.000Z',
  })
}

describe('hairstyle library routes', () => {
  beforeEach(async () => {
    defaultArchiveDb.close()
    await defaultArchiveDb.delete()
    await defaultArchiveDb.open()
  })

  afterEach(() => vi.restoreAllMocks())
  afterAll(() => defaultArchiveDb.close())

  test('registers discovery, private-reference and barber-view routes under the styles product', async () => {
    const router = createAppRouter(createMemoryHistory())
    expect(router.getRoutes().map(({ path }) => path)).toEqual(expect.arrayContaining([
      '/styles',
      '/styles/favorites',
      '/styles/references',
      '/styles/references/new',
      '/styles/references/:id',
      '/styles/references/:id/edit',
      '/styles/references/:id/show',
      '/styles/catalog/:id',
      '/styles/catalog/:id/show',
    ]))

    expect(router.resolve('/styles/references/reference-1/show').meta.hideBottomNav).toBe(true)
    expect(router.resolve('/styles/catalog/lin-bob/show').meta.hideBottomNav).toBe(true)
    expect(router.resolve('/styles/references/new').meta.hideBottomNav).toBe(true)
    expect(router.resolve('/styles/references/reference-1').meta.hideBottomNav).toBe(true)
    expect(router.resolve('/styles/catalog/lin-bob').meta.hideBottomNav).toBe(true)

    await renderAt('/styles/catalog/lin-bob')
    expect(await screen.findByRole('heading', { level: 1, name: '齐颌短鲍伯' })).toBeTruthy()
    expect(screen.queryByRole('navigation', { name: '主导航' })).toBeNull()
    await waitFor(() => expect(document.title).toBe('齐颌短鲍伯｜Tony宝'))
  })

  test('shows six image-first styles and combines search, goal and maintenance filters', async () => {
    await renderAt('/styles')

    expect(await screen.findByRole('heading', { level: 1, name: '找发型' })).toBeTruthy()
    expect(await screen.findAllByTestId('hairstyle-tile')).toHaveLength(6)
    expect(document.querySelectorAll('[data-testid="hairstyle-tile"] [data-tactile]')).toHaveLength(12)
    expect(document.querySelectorAll('[data-testid="hairstyle-tile"] [data-icon]')).toHaveLength(6)
    expect(document.querySelectorAll('[data-drag-rail]')).toHaveLength(2)
    expect(screen.getAllByText(/项目内 AI 合成成年人物正面示例/).length).toBeGreaterThan(0)

    const filterToggle = screen.getByRole('button', { name: '筛选条件（0）' })
    expect(filterToggle.getAttribute('aria-expanded')).toBe('false')
    await fireEvent.click(filterToggle)
    expect(filterToggle.getAttribute('aria-expanded')).toBe('true')

    await fireEvent.update(screen.getByLabelText('搜索发型'), '渐层')
    expect(await screen.findAllByTestId('hairstyle-tile')).toHaveLength(1)
    expect(screen.getByRole('link', { name: '查看发型：清爽渐层' })).toBeTruthy()

    await fireEvent.update(screen.getByLabelText('搜索发型'), '')
    await fireEvent.click(screen.getByLabelText('筛选维护：低维护'))
    expect(await screen.findAllByTestId('hairstyle-tile')).toHaveLength(2)
    await fireEvent.click(screen.getByLabelText('筛选目标：通勤'))
    expect(await screen.findAllByTestId('hairstyle-tile')).toHaveLength(1)
    expect(screen.getByRole('link', { name: '查看发型：清爽渐层' })).toBeTruthy()
  })

  test('gives an empty result an explicit reset action', async () => {
    await renderAt('/styles')
    await fireEvent.update(await screen.findByLabelText('搜索发型'), '完全不存在的发型')

    expect(await screen.findByRole('heading', { level: 2, name: '没有符合条件的发型' }))
      .toBeTruthy()
    await fireEvent.click(screen.getByRole('button', { name: '清空筛选' }))
    expect(await screen.findAllByTestId('hairstyle-tile')).toHaveLength(6)
  })

  test('does not claim the favorites collection is empty when persisted state cannot load', async () => {
    vi.spyOn(defaultHairstyleLibraryRepository, 'listFavorites')
      .mockRejectedValue(new Error('read failed'))

    await renderAt('/styles/favorites')

    expect((await screen.findByRole('alert')).textContent).toContain('本机发型库暂时无法读取')
    expect(screen.queryByRole('heading', { level: 2, name: '还没有收藏' })).toBeNull()
  })

  test('keeps catalog favorite mutations disabled until a failed initial load is retried', async () => {
    await defaultHairstyleLibraryRepository.toggleFavorite({
      itemType: 'curated_style',
      itemId: 'lin-bob',
    })
    vi.spyOn(defaultHairstyleLibraryRepository, 'listFavorites')
      .mockRejectedValueOnce(new Error('read failed'))

    await renderAt('/styles')

    expect(await screen.findByRole('alert')).toBeTruthy()
    const favoriteButton = screen.getByRole('button', { name: '收藏：齐颌短鲍伯' })
    expect(favoriteButton.hasAttribute('disabled')).toBe(true)
    expect(favoriteButton.getAttribute('aria-pressed')).toBe('false')

    await fireEvent.click(favoriteButton)
    expect(await defaultHairstyleLibraryRepository.listFavorites()).toHaveLength(1)

    await fireEvent.click(screen.getByRole('button', { name: '重试读取本机发型库' }))

    await waitFor(() => {
      expect(favoriteButton.hasAttribute('disabled')).toBe(false)
      expect(favoriteButton.getAttribute('aria-pressed')).toBe('true')
    })
    expect(screen.queryByRole('alert')).toBeNull()
  })

  test('shows the load failure on detail and keeps its favorite action disabled', async () => {
    vi.spyOn(defaultHairstyleLibraryRepository, 'listFavorites')
      .mockRejectedValue(new Error('read failed'))

    await renderAt('/styles/catalog/lin-bob')

    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByRole('button', { name: '重试读取本机发型库' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '收藏：齐颌短鲍伯' }).hasAttribute('disabled'))
      .toBe(true)
  })

  test('persists a catalog favorite across a new Pinia application instance', async () => {
    const first = await renderAt('/styles/catalog/lin-bob')
    const favoriteButton = await screen.findByRole('button', { name: '收藏：齐颌短鲍伯' })
    expect(favoriteButton.getAttribute('aria-pressed')).toBe('false')
    await waitFor(() => expect(favoriteButton.hasAttribute('disabled')).toBe(false))

    await fireEvent.click(favoriteButton)
    await waitFor(() => expect(favoriteButton.getAttribute('aria-pressed')).toBe('true'))
    first.unmount()

    defaultArchiveDb.close()
    await defaultArchiveDb.open()
    await renderAt('/styles/catalog/lin-bob')
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '收藏：齐颌短鲍伯' }).getAttribute('aria-pressed'))
        .toBe('true')
    })
  })

  test('keeps favorite actions disabled until persisted library state finishes loading', async () => {
    let completeFavorites!: (favorites: HairstyleFavorite[]) => void
    const pendingFavorites = new Promise<HairstyleFavorite[]>((resolve) => {
      completeFavorites = resolve
    })
    vi.spyOn(defaultHairstyleLibraryRepository, 'listFavorites')
      .mockReturnValue(pendingFavorites)

    await renderAt('/styles/catalog/lin-bob')

    const favoriteButton = await screen.findByRole('button', { name: '收藏：齐颌短鲍伯' })
    expect(favoriteButton.hasAttribute('disabled')).toBe(true)

    completeFavorites([])
    await waitFor(() => expect(favoriteButton.hasAttribute('disabled')).toBe(false))
  })

  test('loads a persisted curated favorite into the home summary', async () => {
    await defaultHairstyleLibraryRepository.toggleFavorite({
      itemType: 'curated_style',
      itemId: 'lin-bob',
    })

    await renderAt('/')

    const summary = await screen.findByRole('link', { name: '查看收藏发型：齐颌短鲍伯' })
    expect(summary.getAttribute('href')).toBe('/styles/catalog/lin-bob')
    expect(within(summary).getByText('齐颌短鲍伯 · 我的收藏')).toBeTruthy()
    expect(within(summary).getByRole('img', { name: /齐颌短鲍伯.*我的收藏/u })).toBeTruthy()
    expect(screen.getAllByTestId('home-primary-action')).toHaveLength(1)
  })

  test('creates, renames and deletes a folder while moving the favorite back to unfiled', async () => {
    await defaultHairstyleLibraryRepository.toggleFavorite({
      itemType: 'curated_style',
      itemId: 'lin-bob',
    })
    await renderAt('/styles/favorites')

    expect(await screen.findByRole('heading', { level: 1, name: '我的收藏' })).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/点赞|作者主页|社交热度/u)
    expect(await screen.findByRole('link', { name: '查看发型：齐颌短鲍伯' })).toBeTruthy()

    await fireEvent.click(screen.getByRole('button', { name: '新建收藏夹' }))
    await fireEvent.update(screen.getByLabelText('收藏夹名称'), '通勤候选')
    await fireEvent.click(screen.getByRole('button', { name: '创建收藏夹' }))
    const folderButton = await screen.findByRole('button', { name: '通勤候选' })
    const [savedFolder] = await defaultHairstyleLibraryRepository.listFavoriteFolders()
    expect(savedFolder?.name).toBe('通勤候选')

    const moveSelect = screen.getByLabelText('移动“齐颌短鲍伯”到收藏夹')
    await fireEvent.update(moveSelect, savedFolder!.id)
    await waitFor(async () => {
      expect((await defaultHairstyleLibraryRepository.listFavorites())[0]?.folderId)
        .toBe(savedFolder!.id)
    })

    await fireEvent.click(folderButton)
    expect(screen.queryByRole('region', { name: '管理收藏夹' })).toBeNull()
    await fireEvent.click(screen.getByRole('button', { name: '管理“通勤候选”' }))
    const management = screen.getByRole('region', { name: '管理收藏夹' })
    await fireEvent.update(within(management).getByLabelText('收藏夹新名称'), '下次想剪')
    await fireEvent.click(within(management).getByRole('button', { name: '保存名称' }))
    expect(await screen.findByRole('button', { name: '下次想剪' })).toBeTruthy()

    const confirmDelete = vi.spyOn(window, 'confirm').mockReturnValue(true)
    await fireEvent.click(within(management).getByRole('button', { name: '删除收藏夹' }))
    await waitFor(() => expect(confirmDelete).toHaveBeenCalled())
    expect(await defaultHairstyleLibraryRepository.listFavoriteFolders()).toEqual([])
    expect((await defaultHairstyleLibraryRepository.listFavorites())[0]?.folderId).toBeNull()
    expect(screen.getByRole('link', { name: '查看发型：齐颌短鲍伯' })).toBeTruthy()
  })

  test('shows complete reality and barber guidance with a canonical add-to-plan action', async () => {
    await defaultArchiveDb.profiles.put({
      id: 'profile-personalized-detail',
      name: '阿青',
      genderIdentity: 'unspecified',
      presentationPreference: 'feminine',
      hairTexture: 'straight',
      strandThickness: 'fine',
      density: 'medium',
      stylingMinutes: 8,
      washFrequency: 'every_other_day',
      preferenceNotes: '',
      createdAt: '2026-08-11T00:00:00.000Z',
      updatedAt: '2026-08-11T00:00:00.000Z',
    })
    await renderAt('/styles/catalog/lin-bob')

    expect(await screen.findByRole('heading', { level: 1, name: '齐颌短鲍伯' })).toBeTruthy()
    expect(await screen.findByRole('heading', { level: 2, name: '为什么排在你的前面' })).toBeTruthy()
    expect(screen.getByText(/适合你的直发/)).toBeTruthy()
    expect(screen.getByText(/项目内 AI 合成成年人物正面示例/)).toBeTruthy()
    expect(screen.getByText('适合条件')).toBeTruthy()
    expect(screen.getAllByText('维护成本').length).toBeGreaterThan(0)
    expect(screen.getAllByText('现实取舍').length).toBeGreaterThan(0)
    expect(screen.getAllByText('给理发师看的要点').length).toBeGreaterThan(0)
    expect(screen.getByText(/保留耳前重量，后区只做轻层次/)).toBeTruthy()
    expect(screen.getByText(/顶部只做轻层次维持饱满/)).toBeTruthy()
    expect(screen.getByRole('link', { name: '给理发师看' }).getAttribute('href'))
      .toBe('/styles/catalog/lin-bob/show')
    expect(screen.getByRole('link', { name: '加入计划' }).getAttribute('href'))
      .toBe('/archive/plans/new?add=catalog:lin-bob')
  })

  test('renders an honest terminal state for an invalid or retired catalog id', async () => {
    await renderAt('/styles/catalog/not-a-real-style')

    expect(await screen.findByRole('heading', { level: 1, name: '这个发型暂时不可用' }))
      .toBeTruthy()
    expect(screen.getByText(/没有用其他发型替换它/)).toBeTruthy()
    expect(screen.getByRole('link', { name: '返回找发型' }).getAttribute('href')).toBe('/styles')
    expect(screen.queryByText('齐颌短鲍伯')).toBeNull()
  })

  test('restores the catalog title when leaving a valid detail route', async () => {
    const { router } = await renderAt('/styles/catalog/lin-bob')
    await waitFor(() => expect(document.title).toBe('齐颌短鲍伯｜Tony宝'))

    await router.push('/styles')

    await waitFor(() => expect(document.title).toBe('找发型｜Tony宝'))
  })

  test('restores the home title when leaving an unavailable detail route', async () => {
    const { router } = await renderAt('/styles/catalog/not-a-real-style')
    await waitFor(() => expect(document.title).toBe('发型不可用｜Tony宝'))

    await router.push('/')

    await waitFor(() => expect(document.title).toBe('Tony宝'))
  })

  test('uploads only prepared bytes without requiring a hair profile, then opens the saved detail', async () => {
    const original = new NodeFile(['private-original-secret'], '本人姓名-原图.jpg', {
      type: 'image/jpeg',
    }) as unknown as File
    const preparedBlob = new NodeBlob(['prepared-private-reference'], {
      type: 'image/webp',
    }) as unknown as Blob
    const prepareImage = vi.fn(async () => preparedImage(preparedBlob))
    const { router } = await renderAt('/styles/references/new', {
      referenceImagePreparer: prepareImage,
    })

    expect(await defaultArchiveDb.profiles.count()).toBe(0)
    expect(await screen.findByRole('heading', { level: 1, name: '添加私人参考' })).toBeTruthy()
    await selectReferenceImage(original)

    expect(prepareImage).toHaveBeenCalledWith(original)
    const preview = await screen.findByRole('img', { name: '处理后的私人参考预览' })
    const preparedUrlCall = vi.mocked(URL.createObjectURL).mock.calls.findIndex(
      ([blob]) => blob === preparedBlob,
    )
    expect(preview.getAttribute('src')).toBe(
      vi.mocked(URL.createObjectURL).mock.results[preparedUrlCall]?.value,
    )
    expect(URL.createObjectURL).not.toHaveBeenCalledWith(original)

    await fireEvent.click(screen.getByRole('button', { name: '刘海' }))
    await fireEvent.click(screen.getByRole('radio', { name: '喜欢这里' }))
    await fireEvent.update(screen.getByLabelText('刘海说明'), '保留自然碎刘海')
    await fireEvent.click(screen.getByRole('button', { name: '记下刘海' }))

    await fireEvent.update(screen.getByLabelText('参考名称'), '  通勤短发  ')
    await fireEvent.update(screen.getByLabelText('我的备注'), '保留耳侧长度')
    await fireEvent.update(screen.getByLabelText('标签'), ' 通勤，短发,通勤 ')
    await fireEvent.click(screen.getByRole('button', { name: '保存私人参考' }))

    await waitFor(() => expect(router.currentRoute.value.name).toBe('style-reference-detail'))
    const [stored] = await defaultHairstyleLibraryRepository.listPrivateReferences()
    expect(stored).toMatchObject({
      name: '通勤短发',
      notes: '保留耳侧长度',
      tags: ['通勤', '短发'],
      focusAreas: [
        { region: 'fringe', intent: 'keep', note: '保留自然碎刘海' },
      ],
      width: 900,
      height: 1200,
      bytes: preparedBlob.size,
      processedAt: '2026-08-11T00:00:00.000Z',
    })
    expect(await stored?.image.text()).toBe('prepared-private-reference')
    expect('name' in (stored?.image ?? {})).toBe(false)
    expect(await defaultArchiveDb.profiles.count()).toBe(0)
    expect(await screen.findByRole('heading', { level: 1, name: '通勤短发' })).toBeTruthy()
    expect(screen.getByText('刘海想保留')).toBeTruthy()
    expect(screen.getByText('保留自然碎刘海')).toBeTruthy()
  })

  test('blocks a new-reference form behind a retryable initial storage failure', async () => {
    vi.spyOn(defaultHairstyleLibraryRepository, 'listPrivateReferences')
      .mockRejectedValueOnce(new ArchiveStorageError('unavailable', new Error('blocked')))
    await renderAt('/styles/references/new')

    expect((await screen.findByRole('alert')).textContent).toContain('本机存储不可用')
    expect(screen.queryByLabelText('参考名称')).toBeNull()
    await fireEvent.click(screen.getByRole('button', { name: '重试读取本机发型库' }))

    expect(await screen.findByLabelText('参考名称')).toBeTruthy()
  })

  test('releases prepared previews on replace, clear and unmount while ignoring late results', async () => {
    const source = new NodeFile(['source'], 'source.jpg', {
      type: 'image/jpeg',
    }) as unknown as File
    const firstBlob = new NodeBlob(['first-ready'], { type: 'image/webp' }) as unknown as Blob
    const lateBlob = new NodeBlob(['late-ready'], { type: 'image/webp' }) as unknown as Blob
    const finalBlob = new NodeBlob(['final-ready'], { type: 'image/webp' }) as unknown as Blob
    let resolveLate!: (value: PreparedLocalImage) => void
    const prepareImage = vi.fn()
      .mockResolvedValueOnce(preparedImage(firstBlob))
      .mockReturnValueOnce(new Promise<PreparedLocalImage>((resolve) => {
        resolveLate = resolve
      }))
      .mockResolvedValueOnce(preparedImage(finalBlob))
    const view = await renderAt('/styles/references/new', {
      referenceImagePreparer: prepareImage,
    })

    await selectReferenceImage(source)
    const firstPreview = await screen.findByRole('img', { name: '处理后的私人参考预览' })
    const firstUrl = firstPreview.getAttribute('src')!

    await selectReferenceImage(source)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(firstUrl)
    expect(await screen.findByText('正在本机处理照片…')).toBeTruthy()
    const clearWhileProcessing = screen.getByRole('button', { name: '清除所选照片' })
    expect((screen.getByLabelText('选择私人参考照片') as HTMLInputElement).disabled).toBe(false)
    expect((clearWhileProcessing.closest('fieldset') as HTMLFieldSetElement).disabled).toBe(false)
    await fireEvent.click(clearWhileProcessing)
    resolveLate(preparedImage(lateBlob))
    await Promise.resolve()
    await Promise.resolve()
    expect(vi.mocked(URL.createObjectURL).mock.calls.some(([blob]) => blob === lateBlob)).toBe(false)
    expect(screen.queryByRole('img', { name: '处理后的私人参考预览' })).toBeNull()

    await selectReferenceImage(source)
    const finalPreview = await screen.findByRole('img', { name: '处理后的私人参考预览' })
    const finalUrl = finalPreview.getAttribute('src')!
    view.unmount()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(finalUrl)
  })

  test('does not create a preview when preparation finishes after the form unmounts', async () => {
    const source = new NodeFile(['source'], 'source.jpg', {
      type: 'image/jpeg',
    }) as unknown as File
    const lateBlob = new NodeBlob(['late-after-unmount'], { type: 'image/webp' }) as unknown as Blob
    let resolvePreparation!: (value: PreparedLocalImage) => void
    const view = await renderAt('/styles/references/new', {
      referenceImagePreparer: vi.fn(() => new Promise<PreparedLocalImage>((resolve) => {
        resolvePreparation = resolve
      })),
    })

    await selectReferenceImage(source)
    expect(await screen.findByText('正在本机处理照片…')).toBeTruthy()
    view.unmount()
    resolvePreparation(preparedImage(lateBlob))
    await Promise.resolve()
    await Promise.resolve()

    expect(vi.mocked(URL.createObjectURL).mock.calls.some(([blob]) => blob === lateBlob)).toBe(false)
  })

  test('lets a fast reselection replace a slow preparation and ignores the stale first result', async () => {
    const firstSource = new NodeFile(['first-source'], 'first.jpg', {
      type: 'image/jpeg',
    }) as unknown as File
    const secondSource = new NodeFile(['second-source'], 'second.jpg', {
      type: 'image/jpeg',
    }) as unknown as File
    const slowBlob = new NodeBlob(['slow-result'], { type: 'image/webp' }) as unknown as Blob
    const fastBlob = new NodeBlob(['fast-result'], { type: 'image/webp' }) as unknown as Blob
    let resolveSlow!: (value: PreparedLocalImage) => void
    const prepareImage = vi.fn()
      .mockReturnValueOnce(new Promise<PreparedLocalImage>((resolve) => {
        resolveSlow = resolve
      }))
      .mockResolvedValueOnce(preparedImage(fastBlob))
    await renderAt('/styles/references/new', {
      referenceImagePreparer: prepareImage,
    })

    await selectReferenceImage(firstSource)
    expect(await screen.findByText('正在本机处理照片…')).toBeTruthy()
    await selectReferenceImage(secondSource)

    const preview = await screen.findByRole('img', { name: '处理后的私人参考预览' })
    const fastCall = vi.mocked(URL.createObjectURL).mock.calls.findIndex(([blob]) => blob === fastBlob)
    expect(preview.getAttribute('src')).toBe(
      vi.mocked(URL.createObjectURL).mock.results[fastCall]?.value,
    )
    resolveSlow(preparedImage(slowBlob))
    await Promise.resolve()
    await Promise.resolve()
    expect(vi.mocked(URL.createObjectURL).mock.calls.some(([blob]) => blob === slowBlob)).toBe(false)
    expect(screen.getByRole('img', { name: '处理后的私人参考预览' }).getAttribute('src'))
      .toBe(vi.mocked(URL.createObjectURL).mock.results[fastCall]?.value)
  })

  test('keeps a failed selection local and clearable without writing a reference', async () => {
    const prepareImage = vi.fn().mockRejectedValue(
      new ImagePreparationError('decode_failed'),
    )
    await renderAt('/styles/references/new', {
      referenceImagePreparer: prepareImage,
    })
    const source = new NodeFile(['broken'], 'broken.jpg', {
      type: 'image/jpeg',
    }) as unknown as File

    await selectReferenceImage(source)

    expect((await screen.findByRole('alert')).textContent).toContain('无法读取这张照片')
    expect(await defaultHairstyleLibraryRepository.listPrivateReferences()).toEqual([])
    await fireEvent.click(screen.getByRole('button', { name: '清除所选照片' }))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  test('locks the whole form during one save and reports quota failure without navigating', async () => {
    const source = new NodeFile(['source'], 'source.jpg', {
      type: 'image/jpeg',
    }) as unknown as File
    const preparedBlob = new NodeBlob(['prepared'], { type: 'image/webp' }) as unknown as Blob
    const actualSave = defaultHairstyleLibraryRepository.savePrivateReference
      .bind(defaultHairstyleLibraryRepository)
    let releaseSave!: () => void
    const saveGate = new Promise<void>((resolve) => {
      releaseSave = resolve
    })
    const saveReference = vi.spyOn(defaultHairstyleLibraryRepository, 'savePrivateReference')
      .mockImplementation(async (write) => {
        await saveGate
        return actualSave(write)
      })
    const { router } = await renderAt('/styles/references/new', {
      referenceImagePreparer: vi.fn(async () => preparedImage(preparedBlob)),
    })
    await selectReferenceImage(source)
    await fireEvent.update(screen.getByLabelText('参考名称'), '保存锁定')
    const saveButton = screen.getByRole('button', { name: '保存私人参考' })

    await fireEvent.click(saveButton)

    expect((saveButton as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByLabelText('选择私人参考照片') as HTMLInputElement).disabled).toBe(true)
    await fireEvent.click(saveButton)
    expect(saveReference).toHaveBeenCalledTimes(1)
    releaseSave()
    await waitFor(() => expect(router.currentRoute.value.name).toBe('style-reference-detail'))

    await defaultHairstyleLibraryRepository.deletePrivateReference(
      (await defaultHairstyleLibraryRepository.listPrivateReferences())[0]!.id,
    )
    vi.restoreAllMocks()
    vi.spyOn(defaultHairstyleLibraryRepository, 'savePrivateReference').mockRejectedValue(
      new ArchiveStorageError('quota_exceeded', new DOMException('full', 'QuotaExceededError')),
    )
    const retryView = await renderAt('/styles/references/new', {
      referenceImagePreparer: vi.fn(async () => preparedImage(preparedBlob)),
    })
    await selectReferenceImage(source)
    await fireEvent.update(screen.getByLabelText('参考名称'), '容量不足')
    await fireEvent.click(screen.getByRole('button', { name: '保存私人参考' }))

    expect((await screen.findByRole('alert')).textContent).toContain('本机存储空间不足')
    expect(retryView.router.currentRoute.value.name).toBe('style-reference-new')
    expect(await defaultHairstyleLibraryRepository.listPrivateReferences()).toEqual([])
    retryView.unmount()
  })

  test('blocks route leave during a deferred save and permits only the successful detail navigation', async () => {
    const source = new NodeFile(['source'], 'source.jpg', {
      type: 'image/jpeg',
    }) as unknown as File
    const preparedBlob = new NodeBlob(['guarded-save'], { type: 'image/webp' }) as unknown as Blob
    const actualSave = defaultHairstyleLibraryRepository.savePrivateReference
      .bind(defaultHairstyleLibraryRepository)
    let releaseSave!: () => void
    const saveGate = new Promise<void>((resolve) => {
      releaseSave = resolve
    })
    const saveReference = vi.spyOn(defaultHairstyleLibraryRepository, 'savePrivateReference')
      .mockImplementation(async (write) => {
        await saveGate
        return actualSave(write)
      })
    const { router } = await renderAt('/styles/references/new', {
      referenceImagePreparer: vi.fn(async () => preparedImage(preparedBlob)),
    })
    let detailNavigationStarted = false
    let releaseDetailNavigation!: () => void
    const detailNavigationGate = new Promise<void>((resolve) => {
      releaseDetailNavigation = resolve
    })
    const removeDetailGuard = router.beforeResolve((to) => {
      if (to.name === 'style-reference-detail') {
        detailNavigationStarted = true
        return detailNavigationGate
      }
      return true
    })
    await selectReferenceImage(source)
    await fireEvent.update(screen.getByLabelText('参考名称'), '守住保存过程')
    await fireEvent.click(screen.getByRole('button', { name: '保存私人参考' }))

    await router.push('/styles')
    expect(router.currentRoute.value.name).toBe('style-reference-new')
    expect(saveReference).toHaveBeenCalledTimes(1)

    releaseSave()
    await waitFor(() => expect(detailNavigationStarted).toBe(true))
    await router.push('/styles/favorites')
    expect(router.currentRoute.value.name).toBe('style-reference-new')
    releaseDetailNavigation()
    await waitFor(() => expect(router.currentRoute.value.name).toBe('style-reference-detail'))
    removeDetailGuard()
    expect(saveReference).toHaveBeenCalledTimes(1)
    expect(await defaultHairstyleLibraryRepository.listPrivateReferences()).toHaveLength(1)
  })

  test('blocks an edit-route parameter update while the current reference is saving', async () => {
    const first = await seedPrivateReference('正在保存的参考', 'first-edit')
    const second = await seedPrivateReference('另一个参考', 'second-edit')
    const actualUpdate = defaultHairstyleLibraryRepository.updatePrivateReference
      .bind(defaultHairstyleLibraryRepository)
    let releaseUpdate!: () => void
    const updateGate = new Promise<void>((resolve) => {
      releaseUpdate = resolve
    })
    const updateReference = vi.spyOn(defaultHairstyleLibraryRepository, 'updatePrivateReference')
      .mockImplementation(async (id, write) => {
        await updateGate
        return actualUpdate(id, write)
      })
    const { router } = await renderAt(`/styles/references/${first.id}/edit`)
    await fireEvent.update(await screen.findByLabelText('参考名称'), '保存中的新名称')
    await fireEvent.click(screen.getByRole('button', { name: '保存修改' }))

    await router.push(`/styles/references/${second.id}/edit`)
    expect(router.currentRoute.value.fullPath).toBe(`/styles/references/${first.id}/edit`)
    expect(updateReference).toHaveBeenCalledTimes(1)

    releaseUpdate()
    await waitFor(() => {
      expect(router.currentRoute.value.fullPath).toBe(`/styles/references/${first.id}`)
    })
    expect(updateReference).toHaveBeenCalledTimes(1)
  })

  test('edits text without changing stored image metadata and rejects a duplicate replacement atomically', async () => {
    const originalBlob = new NodeBlob(['original-reference'], {
      type: 'image/webp',
    }) as unknown as Blob
    const duplicateBlob = new NodeBlob(['duplicate-reference'], {
      type: 'image/webp',
    }) as unknown as Blob
    const original = await defaultHairstyleLibraryRepository.savePrivateReference({
      name: '原名称',
      notes: '原备注',
      tags: ['原标签'],
      focusAreas: [
        { region: 'sides', intent: 'avoid', note: '不要推得太高' },
      ],
      image: originalBlob,
      width: 900,
      height: 1200,
      bytes: originalBlob.size,
      processedAt: '2026-08-10T00:00:00.000Z',
    })
    await defaultHairstyleLibraryRepository.savePrivateReference({
      name: '另一个参考',
      notes: '',
      tags: [],
      image: duplicateBlob,
      width: 800,
      height: 1000,
      bytes: duplicateBlob.size,
      processedAt: '2026-08-10T01:00:00.000Z',
    })
    const first = await renderAt(`/styles/references/${original.id}/edit`)

    expect(await screen.findByText('两侧不要照搬')).toBeTruthy()
    expect(screen.getByText('不要推得太高')).toBeTruthy()
    await fireEvent.update(await screen.findByLabelText('参考名称'), '只改文字')
    await fireEvent.update(screen.getByLabelText('标签'), '一,二,三,四,五,六,七,八')
    await fireEvent.click(screen.getByRole('button', { name: '保存修改' }))
    await waitFor(() => expect(first.router.currentRoute.value.name).toBe('style-reference-detail'))
    const textOnly = await defaultHairstyleLibraryRepository.getPrivateReference(original.id)
    expect(textOnly).toMatchObject({
      fingerprint: original.fingerprint,
      bytes: original.bytes,
      width: original.width,
      height: original.height,
      processedAt: original.processedAt,
      tags: ['一', '二', '三', '四', '五', '六', '七', '八'],
      focusAreas: [
        { region: 'sides', intent: 'avoid', note: '不要推得太高' },
      ],
    })
    expect(await textOnly?.image.text()).toBe('original-reference')
    first.unmount()

    const atomicUpdate = vi.spyOn(
      defaultHairstyleLibraryRepository,
      'updatePrivateReferenceWithImage',
    )
    const source = new NodeFile(['anything'], 'replacement.jpg', {
      type: 'image/jpeg',
    }) as unknown as File
    const second = await renderAt(`/styles/references/${original.id}/edit`, {
      referenceImagePreparer: vi.fn(async () => preparedImage(duplicateBlob, {
        width: 800,
        height: 1000,
      })),
    })
    await screen.findByDisplayValue('只改文字')
    await selectReferenceImage(source)
    await fireEvent.update(screen.getByLabelText('参考名称'), '不应写入')
    await fireEvent.click(screen.getByRole('button', { name: '保存修改' }))

    expect((await screen.findByRole('alert')).textContent).toContain('本机发型库未更改')
    expect(atomicUpdate).toHaveBeenCalledTimes(1)
    expect(second.router.currentRoute.value.name).toBe('style-reference-edit')
    const unchanged = await defaultHairstyleLibraryRepository.getPrivateReference(original.id)
    expect(unchanged).toMatchObject({
      name: '只改文字',
      fingerprint: original.fingerprint,
      bytes: original.bytes,
      processedAt: original.processedAt,
      focusAreas: [
        { region: 'sides', intent: 'avoid', note: '不要推得太高' },
      ],
    })
    expect(await unchanged?.image.text()).toBe('original-reference')
  })

  test('lists private references as a separate device-local section and releases their image URLs', async () => {
    const reference = await seedPrivateReference()
    const view = await renderAt('/styles/references')

    expect(await screen.findByRole('heading', { level: 1, name: '我的参考' })).toBeTruthy()
    expect(screen.getByText(/只保存在当前设备/)).toBeTruthy()
    expect((await screen.findByRole('link', { name: '添加私人参考' })).getAttribute('href'))
      .toBe('/styles/references/new')
    const referenceLink = await screen.findByRole('link', {
      name: `查看私人参考：${reference.name}`,
    })
    expect(referenceLink.getAttribute('href')).toBe(`/styles/references/${reference.id}`)
    const image = within(referenceLink).getByRole('img', {
      name: `${reference.name}的私人参考`,
    })
    const objectUrl = image.getAttribute('src')!
    const objectUrlCall = vi.mocked(URL.createObjectURL).mock.results.findIndex(
      ({ value }) => value === objectUrl,
    )
    const listedBlob = vi.mocked(URL.createObjectURL).mock.calls[objectUrlCall]?.[0] as Blob | undefined
    expect(await listedBlob?.text()).toBe(await reference.image.text())

    view.unmount()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(objectUrl)
  })

  test('shows an honest private-reference empty state without requiring a profile', async () => {
    await renderAt('/styles/references')

    expect(await screen.findByRole('heading', { level: 1, name: '我的参考' })).toBeTruthy()
    expect(await screen.findByRole('heading', { level: 2, name: '还没有私人参考' })).toBeTruthy()
    expect(screen.getByRole('link', { name: '添加第一张参考' }).getAttribute('href'))
      .toBe('/styles/references/new')
    expect(screen.queryByRole('link', { name: '添加私人参考' })).toBeNull()
    expect(await defaultArchiveDb.profiles.count()).toBe(0)
  })

  test('includes a private favorite in folders and keeps it across a new Pinia application', async () => {
    const reference = await seedPrivateReference('我的收藏参考')
    const folder = await defaultHairstyleLibraryRepository.saveFavoriteFolder({ name: '下次想剪' })
    await defaultHairstyleLibraryRepository.toggleFavorite({
      itemType: 'private_reference',
      itemId: reference.id,
    }, folder.id)

    const favorites = await renderAt('/styles/favorites')
    const favoriteLink = await screen.findByRole('link', {
      name: `查看私人参考：${reference.name}`,
    })
    expect(favoriteLink.getAttribute('href')).toBe(`/styles/references/${reference.id}`)
    expect((screen.getByLabelText(`移动“${reference.name}”到收藏夹`) as HTMLSelectElement).value)
      .toBe(folder.id)
    favorites.unmount()

    defaultArchiveDb.close()
    await defaultArchiveDb.open()
    await renderAt(`/styles/references/${reference.id}`)
    await fireEvent.click(await screen.findByRole('button', { name: '更多' }))
    const favoriteButton = await screen.findByRole('button', {
      name: `收藏：${reference.name}`,
    })
    expect(favoriteButton.getAttribute('aria-pressed')).toBe('true')
    expect(await defaultArchiveDb.profiles.count()).toBe(0)
  })

  test('toggles favorite from detail and deletes only the local source after an explicit snapshot warning', async () => {
    const reference = await seedPrivateReference('准备删除的参考')
    const { router } = await renderAt(`/styles/references/${reference.id}`)
    await fireEvent.click(await screen.findByRole('button', { name: '更多' }))
    const favoriteButton = await screen.findByRole('button', {
      name: `收藏：${reference.name}`,
    })
    await waitFor(() => expect((favoriteButton as HTMLButtonElement).disabled).toBe(false))

    await fireEvent.click(favoriteButton)
    await waitFor(() => expect(favoriteButton.getAttribute('aria-pressed')).toBe('true'))
    expect(await defaultHairstyleLibraryRepository.listFavorites()).toHaveLength(1)
    expect(screen.getByRole('link', { name: '给理发师看' }).getAttribute('href'))
      .toBe(`/styles/references/${reference.id}/show`)
    expect(screen.getByRole('link', { name: '编辑私人参考' }).getAttribute('href'))
      .toBe(`/styles/references/${reference.id}/edit`)
    expect(screen.getByRole('link', { name: '加入计划' }).getAttribute('href'))
      .toBe(`/archive/plans/new?add=private_reference:${reference.id}`)

    const confirmDelete = vi.spyOn(window, 'confirm').mockReturnValue(true)
    await fireEvent.click(screen.getByRole('button', { name: '删除私人参考' }))

    await waitFor(() => expect(router.currentRoute.value.path).toBe('/styles/references'))
    expect(confirmDelete).toHaveBeenCalledWith(expect.stringMatching(
      /本机来源和对应收藏.*已保存到计划中的照片快照仍会保留/u,
    ))
    expect(await defaultHairstyleLibraryRepository.listPrivateReferences()).toEqual([])
    expect(await defaultHairstyleLibraryRepository.listFavorites()).toEqual([])
  })

  test('keeps private detail visible while surfacing an action storage failure and retry', async () => {
    const reference = await seedPrivateReference('操作失败仍可见')
    vi.spyOn(defaultHairstyleLibraryRepository, 'toggleFavorite').mockRejectedValueOnce(
      new ArchiveStorageError('unavailable', new Error('blocked')),
    )
    await renderAt(`/styles/references/${reference.id}`)
    await fireEvent.click(await screen.findByRole('button', { name: '更多' }))
    const favoriteButton = await screen.findByRole('button', {
      name: `收藏：${reference.name}`,
    })
    await waitFor(() => expect((favoriteButton as HTMLButtonElement).disabled).toBe(false))

    await fireEvent.click(favoriteButton)

    expect((await screen.findByRole('alert')).textContent).toContain('本机存储不可用')
    expect(screen.getByRole('heading', { level: 1, name: reference.name })).toBeTruthy()
    await fireEvent.click(screen.getByRole('button', { name: '重新读取本机状态' }))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  })

  test('shows a terminal load failure on private detail and reveals the saved reference only after retry', async () => {
    const reference = await seedPrivateReference('重试后出现')
    vi.spyOn(defaultHairstyleLibraryRepository, 'listPrivateReferences')
      .mockRejectedValueOnce(new ArchiveStorageError('unavailable', new Error('blocked')))
    await renderAt(`/styles/references/${reference.id}`)

    expect((await screen.findByRole('alert')).textContent).toContain('本机存储不可用')
    expect(screen.queryByRole('heading', { level: 1, name: reference.name })).toBeNull()
    await fireEvent.click(screen.getByRole('button', { name: '重试读取本机发型库' }))

    expect(await screen.findByRole('heading', { level: 1, name: reference.name })).toBeTruthy()
  })

  test('renders an honest terminal state for a missing private reference', async () => {
    await renderAt('/styles/references/missing-reference')

    expect(await screen.findByRole('heading', { level: 1, name: '这份私人参考找不到了' }))
      .toBeTruthy()
    expect(screen.getByText(/没有用其他照片替换它/)).toBeTruthy()
    expect(screen.getByRole('link', { name: '返回我的参考' }).getAttribute('href'))
      .toBe('/styles/references')
  })

  test('shows every curated barber field, disclosure and front-view limitation without global navigation', async () => {
    await renderAt('/styles/catalog/lin-bob/show')

    expect(await screen.findByRole('heading', { level: 1, name: '齐颌短鲍伯' })).toBeTruthy()
    expect(screen.queryByRole('navigation', { name: '主导航' })).toBeNull()
    expect(screen.getByText(/项目内 AI 合成成年人物正面示例/)).toBeTruthy()
    expect(screen.getByText(/只提供正面参考.*侧面.*后脑/u)).toBeTruthy()
    for (const field of ['整体', '顶部', '刘海', '两侧', '鬓角', '后脑']) {
      expect(screen.getByText(field)).toBeTruthy()
    }
    expect(screen.getByText(/保留耳前重量，后区只做轻层次/)).toBeTruthy()
    expect(screen.getByText(/顶部只做轻层次维持饱满/)).toBeTruthy()
    expect(screen.getByText(/不要过度打薄/)).toBeTruthy()
    expect(screen.getByText(/齐颌轮廓完整/)).toBeTruthy()
    expect(screen.getByText(/保留耳前重量，后区只做轻层次，避免过度打薄/)).toBeTruthy()
    expect(screen.getByText('完整部位说明与现实限制').closest('details')?.hasAttribute('open')).toBe(false)
    await fireEvent.click(screen.getByRole('button', { name: '放大发型图片' }))
    expect(screen.getByRole('dialog', { name: '发型图片大图' })).toBeTruthy()
    await fireEvent.click(screen.getByRole('button', { name: '关闭大图' }))
    expect(screen.queryByRole('dialog', { name: '发型图片大图' })).toBeNull()
  })

  test('shows only the processed image, name and user notes for a private barber view', async () => {
    const reference = await seedPrivateReference('只给理发师看的参考')
    const view = await renderAt(`/styles/references/${reference.id}/show`)

    expect(await screen.findByRole('heading', { level: 1, name: reference.name })).toBeTruthy()
    expect(screen.queryByRole('navigation', { name: '主导航' })).toBeNull()
    expect(screen.getByRole('img', { name: `${reference.name}的私人参考` })).toBeTruthy()
    expect(screen.getByRole('button', { name: '放大发型图片' })).toBeTruthy()
    expect(screen.getByText(reference.notes)).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/整体|顶部|刘海|两侧|鬓角|后脑|绝对不要/u)
    expect(document.body.textContent).not.toContain('通勤')
    expect(document.body.textContent).not.toContain('项目内 AI 合成')
    const imageUrl = screen.getByRole('img', {
      name: `${reference.name}的私人参考`,
    }).getAttribute('src')!

    view.unmount()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(imageUrl)
  })

  test('shows retryable and unavailable terminal states in private barber mode', async () => {
    const reference = await seedPrivateReference('展示重试')
    vi.spyOn(defaultHairstyleLibraryRepository, 'listPrivateReferences')
      .mockRejectedValueOnce(new ArchiveStorageError('unavailable', new Error('blocked')))
    const retryView = await renderAt(`/styles/references/${reference.id}/show`)

    expect((await screen.findByRole('alert')).textContent).toContain('本机存储不可用')
    await fireEvent.click(screen.getByRole('button', { name: '重试读取本机发型库' }))
    expect(await screen.findByRole('heading', { level: 1, name: reference.name })).toBeTruthy()
    retryView.unmount()

    await renderAt('/styles/references/missing/show')
    expect(await screen.findByRole('heading', { level: 1, name: '这份私人参考找不到了' }))
      .toBeTruthy()
  })

  test('does not substitute another catalog style in an unavailable curated barber route', async () => {
    await renderAt('/styles/catalog/missing/show')

    expect(await screen.findByRole('heading', { level: 1, name: '这个精选发型暂时不可用' }))
      .toBeTruthy()
    expect(screen.getByText(/没有用其他发型替换它/)).toBeTruthy()
    expect(screen.queryByText('齐颌短鲍伯')).toBeNull()
    expect(screen.queryByRole('navigation', { name: '主导航' })).toBeNull()
  })
})
