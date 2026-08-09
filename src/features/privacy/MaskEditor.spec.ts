/// <reference types="node" />

import { Blob as NodeBlob, File as NodeFile } from 'node:buffer'

import { fireEvent, render, screen, waitFor } from '@testing-library/vue'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import * as localImages from '../images/prepareLocalImage'
import * as flatOutput from './flattenMask'
import { MaskEngine } from './MaskEngine'
import MaskEditor from './MaskEditor.vue'

const preparedBlob = new NodeBlob(['PREPARED_IMAGE'], { type: 'image/webp' }) as unknown as Blob
const inputFile = new NodeFile(['PRIVATE_ORIGINAL_MARKER'], 'private.jpg', {
  type: 'image/jpeg',
}) as unknown as File

const prepared = {
  blob: preparedBlob,
  mimeType: 'image/webp' as const,
  width: 900,
  height: 1200,
  originalWidth: 1800,
  originalHeight: 2400,
  bytes: preparedBlob.size,
  processedAt: '2026-08-10T00:00:00.000Z',
}

const context = {
  clearRect: vi.fn(),
  drawImage: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  translate: vi.fn(),
  rotate: vi.fn(),
  fillRect: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  closePath: vi.fn(),
  fill: vi.fn(),
  set fillStyle(_value: string) {},
}

const selectFile = async (file: File = inputFile) => {
  const input = screen.getByLabelText(/选择本人或已授权照片|换一张照片/) as HTMLInputElement
  Object.defineProperty(input, 'files', { configurable: true, value: [file] })
  await fireEvent(input, new Event('change', { bubbles: true }))
}

describe('MaskEditor', () => {
  beforeEach(() => {
    vi.spyOn(localImages, 'prepareLocalImage').mockResolvedValue(prepared)
    vi.spyOn(localImages, 'decodeBrowserImage').mockResolvedValue({
      source: {} as CanvasImageSource,
      width: 900,
      height: 1200,
      orientationApplied: false,
      close: vi.fn(),
    })
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 900, height: 1200, close: vi.fn() })))
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 360, height: 480, top: 0, left: 0, right: 360, bottom: 480, x: 0, y: 0, toJSON: () => ({}),
    })
  })

  afterEach(() => vi.restoreAllMocks())

  test('prepares locally before detection and requires confirmation for one automatic face', async () => {
    vi.spyOn(MaskEngine.prototype, 'detect').mockResolvedValue({
      kind: 'single',
      transform: { centerX: 0.5, centerY: 0.4, width: 0.6, height: 0.3, rotation: 0 },
    })
    render(MaskEditor)

    await selectFile()

    expect(localImages.prepareLocalImage).toHaveBeenCalledWith(inputFile)
    expect(await screen.findByText('已自动放置初始遮罩，请确认后再调整。')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '导出单层遮罩图' })).toBeNull()
    await fireEvent.click(screen.getByRole('button', { name: '确认位置并继续' }))
    expect(screen.getByRole('button', { name: '导出单层遮罩图' })).toBeTruthy()
  })

  test('uses a clear manual mode for no face or initialization error', async () => {
    vi.spyOn(MaskEngine.prototype, 'detect').mockResolvedValue({ kind: 'none' })
    render(MaskEditor)
    await selectFile()

    expect(await screen.findByText('没有定位到单张人脸，已进入完全手动模式。')).toBeTruthy()
    expect(screen.getByRole('button', { name: '导出单层遮罩图' })).toBeTruthy()
  })

  test('hard-blocks multiple faces without manual bypass or export', async () => {
    vi.spyOn(MaskEngine.prototype, 'detect').mockResolvedValue({ kind: 'multiple' })
    render(MaskEditor)
    await selectFile()

    expect((await screen.findByRole('alert')).textContent).toContain('检测到多人')
    expect(screen.queryByRole('button', { name: /手动/ })).toBeNull()
    expect(screen.queryByRole('button', { name: '导出单层遮罩图' })).toBeNull()
  })

  test('can abandon slow automatic detection immediately for manual adjustment', async () => {
    vi.spyOn(MaskEngine.prototype, 'detect').mockReturnValue(new Promise(() => {}))
    const cancel = vi.spyOn(MaskEngine.prototype, 'cancelCurrent')
    render(MaskEditor)
    await selectFile()

    await fireEvent.click(await screen.findByRole('button', { name: '立即改为手动' }))

    expect(cancel).toHaveBeenCalled()
    expect(screen.getByText('已停止自动定位，请手动移动和调整遮罩。')).toBeTruthy()
    expect(screen.getByRole('button', { name: '导出单层遮罩图' })).toBeTruthy()
  })

  test.each(['missing', 'rejects-options'] as const)(
    'keeps manual editing available when createImageBitmap %s',
    async (mode) => {
      vi.stubGlobal('createImageBitmap', mode === 'missing'
        ? undefined
        : vi.fn(async () => { throw new Error('unsupported imageOrientation option') }))
      const detect = vi.spyOn(MaskEngine.prototype, 'detect')
      render(MaskEditor)

      await selectFile()

      expect(await screen.findByText('无法启动自动定位，已进入完全手动模式。')).toBeTruthy()
      expect(screen.getByRole('button', { name: '导出单层遮罩图' })).toBeTruthy()
      expect(localImages.decodeBrowserImage).toHaveBeenCalledWith(preparedBlob)
      expect(detect).not.toHaveBeenCalled()
    },
  )

  test('supports keyboard nudging, opaque style selection, and emits only flattened output', async () => {
    vi.spyOn(MaskEngine.prototype, 'detect').mockResolvedValue({ kind: 'none' })
    const result = {
      blob: new NodeBlob(['FLAT_OUTPUT'], { type: 'image/webp' }) as unknown as Blob,
      mimeType: 'image/webp' as const,
      width: 900,
      height: 1200,
      bytes: 11,
      processedAt: '2026-08-10T00:00:00.000Z',
    }
    vi.spyOn(flatOutput, 'flattenMask').mockResolvedValue(result)
    const { emitted } = render(MaskEditor)
    await selectFile()
    await screen.findByRole('button', { name: '导出单层遮罩图' })

    const canvas = screen.getByRole('img', { name: '遮罩编辑画布' })
    canvas.focus()
    await fireEvent.keyDown(canvas, { key: 'ArrowRight' })
    await fireEvent.click(screen.getByRole('radio', { name: '像素块' }))
    await fireEvent.click(screen.getByRole('button', { name: '导出单层遮罩图' }))

    await waitFor(() => expect(flatOutput.flattenMask).toHaveBeenCalled())
    expect(emitted().exported?.[0]).toEqual([result])
    expect(Object.keys((emitted().exported?.[0] as [typeof result])[0]).sort()).toEqual([
      'blob', 'bytes', 'height', 'mimeType', 'processedAt', 'width',
    ])
  })

  test('ignores a stale preparation result after a replacement selection', async () => {
    let resolveFirst: ((value: typeof prepared) => void) | undefined
    vi.mocked(localImages.prepareLocalImage)
      .mockReturnValueOnce(new Promise((resolve) => { resolveFirst = resolve }))
      .mockResolvedValueOnce({ ...prepared, width: 700 })
    vi.spyOn(MaskEngine.prototype, 'detect').mockResolvedValue({ kind: 'none' })
    render(MaskEditor)

    await selectFile()
    await selectFile()
    resolveFirst?.(prepared)

    expect(await screen.findByText(/700 × 1200/)).toBeTruthy()
    expect(screen.queryByText(/900 × 1200/)).toBeNull()
  })

  test('does not emit an export that finishes after the source is replaced', async () => {
    vi.spyOn(MaskEngine.prototype, 'detect').mockResolvedValue({ kind: 'none' })
    const result = {
      blob: new NodeBlob(['OLD_FLAT_OUTPUT'], { type: 'image/webp' }) as unknown as Blob,
      mimeType: 'image/webp' as const,
      width: 900,
      height: 1200,
      bytes: 15,
      processedAt: '2026-08-10T00:00:00.000Z',
    }
    let resolveExport: ((value: typeof result) => void) | undefined
    vi.spyOn(flatOutput, 'flattenMask').mockReturnValue(new Promise((resolve) => {
      resolveExport = resolve
    }))
    const { emitted } = render(MaskEditor)
    await selectFile()
    await fireEvent.click(await screen.findByRole('button', { name: '导出单层遮罩图' }))
    await waitFor(() => expect(flatOutput.flattenMask).toHaveBeenCalledOnce())

    const replacement = new NodeFile(['SECOND_PRIVATE_MARKER'], 'replacement.jpg', {
      type: 'image/jpeg',
    }) as unknown as File
    await selectFile(replacement)
    await screen.findByText('没有定位到单张人脸，已进入完全手动模式。')
    resolveExport?.(result)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(emitted().exported).toBeUndefined()
  })
})
