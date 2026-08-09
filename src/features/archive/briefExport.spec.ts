import { describe, expect, test, vi } from 'vitest'

import {
  createBriefExportLayout,
  exportBriefPng,
  isLocalBriefImageSource,
  type BriefExportContent,
  type BriefExportDependencies,
} from './briefExport'

const content: BriefExportContent = {
  planTitle: '夏末/短发:计划',
  candidateName: '纹理短碎发',
  imageSource: '/demo/persona-ran-crop.webp',
  overall: '整体保持轻盈轮廓',
  top: '顶部保留自然支撑',
  fringe: '刘海轻薄并自然露额',
  sides: '两侧贴合但不要推白',
  sideburns: '鬓角保留自然尖角',
  back: '后脑连接自然，后颈收干净',
  topPriorities: ['两侧不要炸', '顶部不要塌', '保留自然发流'],
  absoluteAvoids: ['不要推白', '不要剪齐刘海'],
}

describe('brief PNG export', () => {
  test('allows same-origin WebP and local Blob images but rejects external services', () => {
    const pageUrl = 'https://zajianfa.example/archive/plans/one/brief'

    expect(isLocalBriefImageSource('/demo/persona-ran-crop.webp', pageUrl)).toBe(true)
    expect(isLocalBriefImageSource('blob:https://zajianfa.example/local-image', pageUrl)).toBe(true)
    expect(isLocalBriefImageSource('https://uploads.example/brief.webp', pageUrl)).toBe(false)
  })

  test('lays out the plan, target, six sections, both lists, and confirmation at high resolution', () => {
    const layout = createBriefExportLayout(content, (text) => text.length * 30)
    const flattenedText = layout.textRuns.map(({ text }) => text).join('')

    expect(layout.width).toBe(1440)
    expect(layout.height).toBeGreaterThan(1600)
    expect(layout.image).toMatchObject({ width: 1248 })
    for (const expected of [
      content.planTitle,
      content.candidateName,
      '整体',
      content.overall,
      '顶部',
      content.top,
      '刘海',
      content.fringe,
      '两侧',
      content.sides,
      '鬓角',
      content.sideburns,
      '后脑',
      content.back,
      ...content.topPriorities,
      ...content.absoluteAvoids,
      '请现场确认',
    ]) {
      expect(flattenedText).toContain(expected)
    }
  })

  test('flattens the local image and all text into a PNG download, then cleans up', async () => {
    const drawnText: string[] = []
    const context = {
      fillStyle: '',
      font: '',
      textAlign: 'left',
      textBaseline: 'alphabetic',
      fillRect: vi.fn(),
      fillText: vi.fn((text: string) => drawnText.push(text)),
      drawImage: vi.fn(),
      measureText: vi.fn((text: string) => ({ width: text.length * 30 })),
    }
    const png = new Blob(['png-bytes'], { type: 'image/png' })
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => context),
      toBlob: vi.fn((callback: BlobCallback, type?: string) => {
        expect(type).toBe('image/png')
        callback(png)
      }),
    } as unknown as HTMLCanvasElement
    const anchor = {
      href: '',
      download: '',
      click: vi.fn(),
      remove: vi.fn(),
    } as unknown as HTMLAnchorElement
    const createObjectURL = vi.fn(() => 'blob:brief-png')
    const revokeObjectURL = vi.fn()
    const dependencies: Partial<BriefExportDependencies> = {
      createCanvas: () => canvas,
      loadImage: vi.fn(async () => ({ width: 1200, height: 1600 }) as CanvasImageSource),
      createObjectURL,
      revokeObjectURL,
      createAnchor: () => anchor,
    }

    const result = await exportBriefPng(content, dependencies)

    expect(result.blob).toBe(png)
    expect(result.filename).toBe('咋剪发-夏末-短发-计划-纹理短碎发.png')
    expect(canvas.width).toBe(1440)
    expect(context.drawImage).toHaveBeenCalled()
    expect(drawnText.join('')).toContain(content.absoluteAvoids[1])
    expect(anchor).toMatchObject({ href: 'blob:brief-png', download: result.filename })
    expect(anchor.click).toHaveBeenCalledOnce()
    expect(anchor.remove).toHaveBeenCalledOnce()
    expect(createObjectURL).toHaveBeenCalledWith(png)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:brief-png')
  })

  test('reports PNG encoding failure without creating a fake download URL', async () => {
    const createObjectURL = vi.fn()
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({
        fillStyle: '',
        font: '',
        textAlign: 'left',
        textBaseline: 'alphabetic',
        fillRect: vi.fn(),
        fillText: vi.fn(),
        drawImage: vi.fn(),
        measureText: (text: string) => ({ width: text.length * 30 }),
      }),
      toBlob: (callback: BlobCallback) => callback(null),
    } as unknown as HTMLCanvasElement

    await expect(exportBriefPng(content, {
      createCanvas: () => canvas,
      loadImage: async () => ({ width: 1200, height: 1600 }) as CanvasImageSource,
      createObjectURL,
    })).rejects.toThrow('PNG')
    expect(createObjectURL).not.toHaveBeenCalled()
  })

  test('removes the anchor and revokes its URL when download click fails', async () => {
    const anchor = {
      href: '',
      download: '',
      click: vi.fn(() => { throw new Error('blocked download') }),
      remove: vi.fn(),
    } as unknown as HTMLAnchorElement
    const revokeObjectURL = vi.fn()
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({
        fillStyle: '',
        font: '',
        textAlign: 'left',
        textBaseline: 'alphabetic',
        fillRect: vi.fn(),
        fillText: vi.fn(),
        drawImage: vi.fn(),
        measureText: (text: string) => ({ width: text.length * 30 }),
      }),
      toBlob: (callback: BlobCallback) => callback(new Blob(['png'], { type: 'image/png' })),
    } as unknown as HTMLCanvasElement

    await expect(exportBriefPng(content, {
      createCanvas: () => canvas,
      loadImage: async () => ({ width: 1200, height: 1600 }) as CanvasImageSource,
      createObjectURL: () => 'blob:brief-png',
      revokeObjectURL,
      createAnchor: () => anchor,
    })).rejects.toThrow('blocked download')
    expect(anchor.remove).toHaveBeenCalledOnce()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:brief-png')
  })
})
