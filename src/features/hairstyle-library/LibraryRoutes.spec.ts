import { fireEvent, render, screen, waitFor, within } from '@testing-library/vue'
import { createPinia } from 'pinia'
import { createMemoryHistory } from 'vue-router'
import { afterAll, afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import App from '../../App.vue'
import { createAppRouter } from '../../router'
import { defaultArchiveDb } from '../archive/archiveStore'
import { defaultHairstyleLibraryRepository } from './libraryStore'
import type { HairstyleFavorite } from './types'

async function renderAt(path: string) {
  const router = createAppRouter(createMemoryHistory())
  await router.push(path)
  await router.isReady()
  const result = render(App, {
    global: {
      plugins: [createPinia(), router],
    },
  })
  return { ...result, router }
}

describe('hairstyle library routes', () => {
  beforeEach(async () => {
    defaultArchiveDb.close()
    await defaultArchiveDb.delete()
    await defaultArchiveDb.open()
  })

  afterEach(() => vi.restoreAllMocks())
  afterAll(() => defaultArchiveDb.close())

  test('registers discovery, favorites and catalog-detail routes under the active styles tab', async () => {
    const router = createAppRouter(createMemoryHistory())
    expect(router.getRoutes().map(({ path }) => path)).toEqual(expect.arrayContaining([
      '/styles',
      '/styles/favorites',
      '/styles/catalog/:id',
    ]))

    await renderAt('/styles/catalog/lin-bob')
    expect(await screen.findByRole('heading', { level: 1, name: '齐颌短鲍伯' })).toBeTruthy()
    const mainNav = screen.getByRole('navigation', { name: '主导航' })
    expect(within(mainNav).getByRole('link', { name: '找发型' }).getAttribute('aria-current')).toBe('page')
    await waitFor(() => expect(document.title).toBe('齐颌短鲍伯｜咋剪发'))
  })

  test('shows six image-first styles and combines search, goal and maintenance filters', async () => {
    await renderAt('/styles')

    expect(await screen.findByRole('heading', { level: 1, name: '找发型' })).toBeTruthy()
    expect(await screen.findAllByTestId('hairstyle-tile')).toHaveLength(6)
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

  test('shows complete reality and barber guidance without a dead add-to-plan action', async () => {
    await renderAt('/styles/catalog/lin-bob')

    expect(await screen.findByRole('heading', { level: 1, name: '齐颌短鲍伯' })).toBeTruthy()
    expect(screen.getByText(/项目内 AI 合成成年人物正面示例/)).toBeTruthy()
    expect(screen.getByText('适合条件')).toBeTruthy()
    expect(screen.getByText('维护成本')).toBeTruthy()
    expect(screen.getByText('现实取舍')).toBeTruthy()
    expect(screen.getByText('给理发师看的要点')).toBeTruthy()
    expect(screen.getByText(/保留耳前重量，后区只做轻层次/)).toBeTruthy()
    expect(screen.getByText(/顶部只做轻层次维持饱满/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /加入.*计划/ })).toBeNull()
    expect(screen.queryByRole('link', { name: /加入.*计划/ })).toBeNull()
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
    await waitFor(() => expect(document.title).toBe('齐颌短鲍伯｜咋剪发'))

    await router.push('/styles')

    await waitFor(() => expect(document.title).toBe('找发型｜咋剪发'))
  })

  test('restores the home title when leaving an unavailable detail route', async () => {
    const { router } = await renderAt('/styles/catalog/not-a-real-style')
    await waitFor(() => expect(document.title).toBe('发型不可用｜咋剪发'))

    await router.push('/')

    await waitFor(() => expect(document.title).toBe('咋剪发'))
  })
})
