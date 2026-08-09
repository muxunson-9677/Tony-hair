/// <reference types="node" />

import { Blob as NodeBlob, File as NodeFile } from 'node:buffer'

import { afterEach, describe, expect, test, vi } from 'vitest'

import {
  ImagePreparationError,
  decodeBrowserImage,
  getOrientationTransform,
  parseJpegOrientation,
  prepareLocalImage,
  type DecodedLocalImage,
  type ImagePreparationCanvas,
  type ImagePreparationDependencies,
} from './prepareLocalImage'

afterEach(() => vi.unstubAllGlobals())

const jpegWithOrientation = (orientation: number) => Uint8Array.from([
  0xff, 0xd8,
  0xff, 0xe1, 0x00, 0x22,
  0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
  0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08,
  0x00, 0x01,
  0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01,
  0x00, orientation, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00,
  0xff, 0xd9,
]).buffer

const imageFile = (
  bytes: ArrayBuffer | Uint8Array | string = 'source-image',
  type = 'image/jpeg',
) => new NodeFile(
  [bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes],
  'private-original-name.jpg',
  { type },
) as unknown as File

interface FakeCanvas extends ImagePreparationCanvas {
  readonly transforms: number[][]
  readonly drawCalls: unknown[][]
}

const createCanvasFactory = () => {
  const canvases: FakeCanvas[] = []
  const createCanvas = vi.fn((width: number, height: number): FakeCanvas => {
    const transforms: number[][] = []
    const drawCalls: unknown[][] = []
    const canvas: FakeCanvas = {
      width,
      height,
      transforms,
      drawCalls,
      getContext: () => ({
        setTransform: (...values) => transforms.push(values),
        drawImage: (...values) => drawCalls.push(values),
      }),
    }
    canvases.push(canvas)
    return canvas
  })
  return { canvases, createCanvas }
}

const decodedImage = (
  width = 1200,
  height = 800,
  overrides: Partial<DecodedLocalImage> = {},
): DecodedLocalImage => ({
  source: { kind: 'decoded-source' },
  width,
  height,
  orientationApplied: false,
  close: vi.fn(),
  ...overrides,
})

const cleanBlob = (size = 24, type = 'image/webp') => (
  new NodeBlob([new Uint8Array(size).fill(0x63)], { type }) as unknown as Blob
)

const dependencies = (
  overrides: Partial<ImagePreparationDependencies> = {},
) => {
  const { canvases, createCanvas } = createCanvasFactory()
  const decoded = decodedImage()
  const value: ImagePreparationDependencies = {
    decodeImage: vi.fn(async () => decoded),
    createCanvas,
    encodeCanvas: vi.fn(async (_canvas, mimeType) => cleanBlob(24, mimeType)),
    ...overrides,
  }
  return { canvases, decoded, value }
}

describe('parseJpegOrientation', () => {
  test.each([1, 3, 6, 8] as const)('reads EXIF orientation %i', (orientation) => {
    expect(parseJpegOrientation(jpegWithOrientation(orientation))).toBe(orientation)
  })

  test('defaults malformed and out-of-range orientation data to 1', () => {
    expect(parseJpegOrientation(Uint8Array.from([0xff, 0xd8, 0xff]).buffer)).toBe(1)
    expect(parseJpegOrientation(jpegWithOrientation(9))).toBe(1)
  })
})

describe('getOrientationTransform', () => {
  test.each([
    [1, 400, 300, [1, 0, 0, 1, 0, 0]],
    [2, 400, 300, [-1, 0, 0, 1, 400, 0]],
    [3, 400, 300, [-1, 0, 0, -1, 400, 300]],
    [4, 400, 300, [1, 0, 0, -1, 0, 300]],
    [5, 300, 400, [0, 1, 1, 0, 0, 0]],
    [6, 300, 400, [0, 1, -1, 0, 300, 0]],
    [7, 300, 400, [0, -1, -1, 0, 300, 400]],
    [8, 300, 400, [0, -1, 1, 0, 0, 400]],
  ] as const)(
    'returns the canvas size and matrix for orientation %i',
    (orientation, outputWidth, outputHeight, matrix) => {
      expect(getOrientationTransform(orientation, 400, 300)).toEqual({
        width: outputWidth,
        height: outputHeight,
        matrix,
      })
    },
  )
})

describe('prepareLocalImage', () => {
  test('corrects orientation before limiting the visual long edge to 1920', async () => {
    const decoded = decodedImage(3000, 2000)
    const setup = dependencies({ decodeImage: vi.fn(async () => decoded) })

    const result = await prepareLocalImage(imageFile(jpegWithOrientation(6)), {
      dependencies: setup.value,
      now: () => new Date('2026-08-10T12:34:56.000Z'),
    })

    expect(setup.canvases[0]).toMatchObject({ width: 1280, height: 1920 })
    expect(setup.canvases[0]?.transforms).toEqual([[0, 1, -1, 0, 1280, 0]])
    expect(result).toMatchObject({
      mimeType: 'image/webp',
      width: 1280,
      height: 1920,
      originalWidth: 2000,
      originalHeight: 3000,
      bytes: 24,
      processedAt: '2026-08-10T12:34:56.000Z',
    })
    expect(result.blob).not.toBe(expect.any(File))
    expect(decoded.close).toHaveBeenCalledOnce()
  })

  test('does not apply EXIF a second time when the decoder already handled orientation', async () => {
    const decoded = decodedImage(2000, 3000, { orientationApplied: true })
    const setup = dependencies({ decodeImage: vi.fn(async () => decoded) })

    const result = await prepareLocalImage(imageFile(jpegWithOrientation(6)), {
      dependencies: setup.value,
    })

    expect(result).toMatchObject({ width: 1280, height: 1920 })
    expect(setup.canvases[0]?.transforms[0]).toEqual([1, 0, 0, 1, 0, 0])
  })

  test('lowers quality before reducing dimensions until output fits the byte limit', async () => {
    const setup = dependencies()
    const attempts: { width: number, quality: number }[] = []
    setup.value.encodeCanvas = vi.fn(async (canvas, mimeType, quality) => {
      attempts.push({ width: canvas.width, quality })
      return cleanBlob(canvas.width > 1000 ? 120 : 80, mimeType)
    })

    const result = await prepareLocalImage(imageFile(), {
      dependencies: setup.value,
      maxBytes: 100,
      maxLongEdge: 1200,
    })

    expect(attempts.filter(({ width }) => width === 1200).length).toBeGreaterThan(1)
    expect(attempts.findIndex(({ width }) => width < 1200)).toBeGreaterThan(
      attempts.findIndex(({ quality }) => quality < 0.9),
    )
    expect(result.bytes).toBe(80)
    expect(result.width).toBeLessThan(1200)
  })

  test('falls back to JPEG when WebP encoding is unavailable', async () => {
    const setup = dependencies()
    setup.value.encodeCanvas = vi.fn(async (_canvas, mimeType) => {
      if (mimeType === 'image/webp') {
        return null
      }
      return cleanBlob(32, mimeType)
    })

    const result = await prepareLocalImage(imageFile(), { dependencies: setup.value })

    expect(result.mimeType).toBe('image/jpeg')
    expect(result.blob.type).toBe('image/jpeg')
    expect(setup.value.encodeCanvas).toHaveBeenCalledWith(
      expect.anything(),
      'image/jpeg',
      expect.any(Number),
    )
  })

  test('returns only newly encoded bytes, without EXIF or original file bytes', async () => {
    const secret = new TextEncoder().encode('Exif\0\0private-original-name.jpg SECRET_PIXELS')
    const setup = dependencies({
      encodeCanvas: vi.fn(async (_canvas, mimeType) => (
        new NodeBlob(['CLEAN_CANVAS_PIXELS'], { type: mimeType }) as unknown as Blob
      )),
    })

    const result = await prepareLocalImage(imageFile(secret, 'image/png'), {
      dependencies: setup.value,
    })
    const output = new Uint8Array(await result.blob.arrayBuffer())
    const outputText = new TextDecoder().decode(output)

    expect(outputText).toBe('CLEAN_CANVAS_PIXELS')
    expect(outputText).not.toContain('Exif')
    expect(outputText).not.toContain('private-original-name.jpg')
    expect(outputText).not.toContain('SECRET_PIXELS')
  })

  test.each([
    ['image/gif', 'unsupported_type'],
    ['image/svg+xml', 'unsupported_type'],
  ] as const)('rejects unsupported %s input with %s', async (type, code) => {
    const setup = dependencies()

    const error = await prepareLocalImage(imageFile('invalid', type), {
      dependencies: setup.value,
    }).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ImagePreparationError)
    expect(error).toMatchObject({ code })
    expect((error as Error).message).toMatch(/照片|图片/)
    expect((error as Error).message).not.toMatch(/canvas|decoder|stack/i)
    expect(setup.value.decodeImage).not.toHaveBeenCalled()
  })

  test('maps decoder failures to decode_failed', async () => {
    const setup = dependencies({
      decodeImage: vi.fn(async () => {
        throw new Error('decoder stack detail')
      }),
    })

    await expect(prepareLocalImage(imageFile(), {
      dependencies: setup.value,
    })).rejects.toMatchObject({ code: 'decode_failed' })
  })

  test('maps complete encoder failure to encode_failed and always closes the image', async () => {
    const setup = dependencies({ encodeCanvas: vi.fn(async () => null) })

    await expect(prepareLocalImage(imageFile(), {
      dependencies: setup.value,
    })).rejects.toMatchObject({ code: 'encode_failed' })
    expect(setup.decoded.close).toHaveBeenCalledOnce()
  })

  test('maps canvas failures to encode_failed without exposing technical details', async () => {
    const setup = dependencies({
      createCanvas: vi.fn(() => {
        throw new Error('Canvas implementation stack detail')
      }),
    })

    const error = await prepareLocalImage(imageFile(), {
      dependencies: setup.value,
    }).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ImagePreparationError)
    expect(error).toMatchObject({ code: 'encode_failed' })
    expect((error as Error).message).not.toMatch(/canvas|stack/i)
    expect(setup.decoded.close).toHaveBeenCalledOnce()
  })

  test('maps output that remains oversized to too_large and always closes the image', async () => {
    const setup = dependencies({
      encodeCanvas: vi.fn(async (_canvas, mimeType) => cleanBlob(101, mimeType)),
    })

    await expect(prepareLocalImage(imageFile(), {
      dependencies: setup.value,
      maxBytes: 100,
      minimumLongEdge: 700,
    })).rejects.toMatchObject({ code: 'too_large' })
    expect(setup.decoded.close).toHaveBeenCalledOnce()
  })
})

describe('decodeBrowserImage', () => {
  test('requests unrotated ImageBitmap pixels and closes the bitmap', async () => {
    const close = vi.fn()
    const createBitmap = vi.fn<(
      blob: Blob,
      options?: ImageBitmapOptions,
    ) => Promise<{ width: number, height: number, close: () => void }>>(async () => ({
      width: 640,
      height: 480,
      close,
    }))
    vi.stubGlobal('createImageBitmap', createBitmap)
    const file = imageFile(jpegWithOrientation(6))

    const decoded = await decodeBrowserImage(file)

    const decodedBlob = createBitmap.mock.calls[0]?.[0] as unknown as Blob
    expect(decodedBlob).not.toBe(file)
    expect(parseJpegOrientation(await decodedBlob.arrayBuffer())).toBe(1)
    expect(createBitmap).toHaveBeenCalledWith(decodedBlob, { imageOrientation: 'none' })
    expect(decoded).toMatchObject({ width: 640, height: 480, orientationApplied: false })
    decoded.close()
    expect(close).toHaveBeenCalledOnce()
  })

  test('revokes the HTMLImage object URL after fallback use', async () => {
    class FakeImage {
      naturalWidth = 480
      naturalHeight = 640
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      private value = ''

      set src(value: string) {
        this.value = value
        if (value) {
          queueMicrotask(() => this.onload?.())
        }
      }

      get src() {
        return this.value
      }
    }
    vi.stubGlobal('createImageBitmap', undefined)
    vi.stubGlobal('Image', FakeImage)

    const decoded = await decodeBrowserImage(imageFile())

    expect(decoded).toMatchObject({ width: 480, height: 640, orientationApplied: false })
    decoded.close()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(
      vi.mocked(URL.createObjectURL).mock.results[0]?.value,
    )
  })

  test('revokes the HTMLImage object URL when fallback decoding fails', async () => {
    class BrokenImage {
      naturalWidth = 0
      naturalHeight = 0
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      private value = ''

      set src(value: string) {
        this.value = value
        if (value) {
          queueMicrotask(() => this.onerror?.())
        }
      }

      get src() {
        return this.value
      }
    }
    vi.stubGlobal('createImageBitmap', undefined)
    vi.stubGlobal('Image', BrokenImage)

    await expect(decodeBrowserImage(imageFile())).rejects.toThrow()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(
      vi.mocked(URL.createObjectURL).mock.results[0]?.value,
    )
  })
})
