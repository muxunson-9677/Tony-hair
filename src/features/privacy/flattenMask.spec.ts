import { Blob as NodeBlob } from 'node:buffer'

import { describe, expect, test, vi } from 'vitest'

import { flattenMask, type FlattenMaskDependencies } from './flattenMask'

const source = new NodeBlob(['PRIVATE_ORIGINAL_MARKER'], { type: 'image/jpeg' }) as unknown as Blob
const transform = { centerX: 0.5, centerY: 0.45, width: 0.5, height: 0.3, rotation: 0 }

const makeDependencies = (outputs: Array<Blob | null>) => {
  const context = {
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
    drawImage: vi.fn(),
    set fillStyle(_value: string) {},
  }
  const canvas = { width: 0, height: 0, getContext: vi.fn(() => context) }
  const close = vi.fn()
  const dependencies: FlattenMaskDependencies = {
    decodeImage: vi.fn(async () => ({ source: {}, width: 1200, height: 800, close })),
    createCanvas: vi.fn(() => canvas),
    encodeCanvas: vi.fn(async () => outputs.shift() ?? null),
  }
  return { dependencies, context, canvas, close }
}

describe('flattenMask', () => {
  test.each(['editorial_bar', 'pixel_blocks', 'paper_patch'] as const)(
    'draws %s as an opaque flattened layer and returns only public output metadata',
    async (style) => {
      const encoded = new NodeBlob(['flattened'], { type: 'image/webp' }) as unknown as Blob
      const { dependencies, context, close } = makeDependencies([encoded])

      const result = await flattenMask(source, transform, style, {
        dependencies,
        now: () => new Date('2026-08-10T00:00:00.000Z'),
      })

      expect(context.drawImage).toHaveBeenCalled()
      expect(context.fillRect.mock.calls.length + context.fill.mock.calls.length).toBeGreaterThan(0)
      expect(result).toEqual({
        blob: encoded,
        mimeType: 'image/webp',
        width: 1200,
        height: 800,
        bytes: encoded.size,
        processedAt: '2026-08-10T00:00:00.000Z',
      })
      expect(Object.keys(result).sort()).toEqual(['blob', 'bytes', 'height', 'mimeType', 'processedAt', 'width'])
      expect(close).toHaveBeenCalledOnce()
    },
  )

  test('falls back from unsupported WebP to JPEG', async () => {
    const jpeg = new NodeBlob(['jpeg'], { type: 'image/jpeg' }) as unknown as Blob
    const { dependencies } = makeDependencies([null, jpeg])

    const result = await flattenMask(source, transform, 'editorial_bar', { dependencies })

    expect(result.mimeType).toBe('image/jpeg')
    expect(dependencies.encodeCanvas).toHaveBeenNthCalledWith(1, expect.anything(), 'image/webp', expect.any(Number))
    expect(dependencies.encodeCanvas).toHaveBeenNthCalledWith(2, expect.anything(), 'image/jpeg', expect.any(Number))
  })

  test('reduces quality and dimensions until output is at most 1.5MB', async () => {
    const huge = new NodeBlob([new Uint8Array(1_500_001)], { type: 'image/webp' }) as unknown as Blob
    const small = new NodeBlob(['small'], { type: 'image/webp' }) as unknown as Blob
    const { dependencies } = makeDependencies([huge, huge, huge, huge, huge, huge, huge, null, small])

    const result = await flattenMask(source, transform, 'editorial_bar', { dependencies })

    expect(result.bytes).toBeLessThanOrEqual(1_500_000)
    expect(result.width).toBeLessThan(1200)
  })

  test('closes decoded resources when encoding fails', async () => {
    const { dependencies, close } = makeDependencies(Array.from({ length: 80 }, () => null))

    await expect(flattenMask(source, transform, 'editorial_bar', { dependencies })).rejects.toThrow('导出')
    expect(close).toHaveBeenCalledOnce()
  })
})
