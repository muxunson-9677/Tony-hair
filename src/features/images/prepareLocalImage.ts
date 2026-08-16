export type ImagePreparationErrorCode =
  | 'unsupported_type'
  | 'decode_failed'
  | 'encode_failed'
  | 'too_large'

type ExifOrientation = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8

const IMAGE_PREPARATION_MESSAGES: Record<ImagePreparationErrorCode, string> = {
  unsupported_type: '仅支持 JPEG、PNG 或 WebP 照片。',
  decode_failed: '无法读取这张照片，请换一张后重试。',
  encode_failed: '照片处理失败，请换一张后重试。',
  too_large: '照片处理后仍然过大，请选择更小的照片。',
}

export class ImagePreparationError extends Error {
  readonly code: ImagePreparationErrorCode

  constructor(code: ImagePreparationErrorCode, cause?: unknown) {
    super(IMAGE_PREPARATION_MESSAGES[code], cause === undefined ? undefined : { cause })
    this.name = 'ImagePreparationError'
    this.code = code
  }
}

export interface ImagePreparationContext {
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void
  drawImage(source: unknown, dx: number, dy: number, width: number, height: number): void
}

export interface ImagePreparationCanvas {
  width: number
  height: number
  getContext(type: '2d'): ImagePreparationContext | null
}

export interface DecodedLocalImage {
  readonly source: unknown
  readonly width: number
  readonly height: number
  readonly orientationApplied: boolean
  close(): void
}

export interface ImagePreparationDependencies {
  decodeImage(blob: Blob): Promise<DecodedLocalImage>
  createCanvas(width: number, height: number): ImagePreparationCanvas
  encodeCanvas(
    canvas: ImagePreparationCanvas,
    mimeType: 'image/webp' | 'image/jpeg',
    quality: number,
  ): Promise<Blob | null>
}

export interface PreparedLocalImage {
  readonly blob: Blob
  readonly mimeType: 'image/webp' | 'image/jpeg'
  readonly width: number
  readonly height: number
  readonly originalWidth: number
  readonly originalHeight: number
  readonly bytes: number
  readonly processedAt: string
}

export interface PrepareLocalImageOptions {
  readonly maxLongEdge?: number
  readonly maxBytes?: number
  readonly minimumLongEdge?: number
  readonly now?: () => Date
  readonly dependencies?: ImagePreparationDependencies
}

const SUPPORTED_INPUT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const DEFAULT_MAX_LONG_EDGE = 1920
const DEFAULT_MAX_BYTES = 1_500_000
const DEFAULT_MINIMUM_LONG_EDGE = 480
const QUALITY_STEPS = [0.9, 0.82, 0.74, 0.66, 0.58, 0.5, 0.42] as const
const DIMENSION_STEP = 0.82

const normalizeOrientation = (value: number): ExifOrientation => (
  Number.isInteger(value) && value >= 1 && value <= 8 ? value as ExifOrientation : 1
)

interface ExifOrientationEntry {
  readonly orientation: ExifOrientation
  readonly valueOffset: number
  readonly littleEndian: boolean
}

const readExifOrientationEntry = (
  view: DataView,
  segmentStart: number,
  segmentEnd: number,
): ExifOrientationEntry | null => {
  const exifHeader = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00]
  if (
    segmentStart + exifHeader.length > segmentEnd
    || exifHeader.some((byte, index) => view.getUint8(segmentStart + index) !== byte)
  ) {
    return null
  }

  const tiffStart = segmentStart + exifHeader.length
  if (tiffStart + 8 > segmentEnd) {
    return null
  }
  const byteOrder = view.getUint16(tiffStart, false)
  const littleEndian = byteOrder === 0x4949
  if (!littleEndian && byteOrder !== 0x4d4d) {
    return null
  }
  if (view.getUint16(tiffStart + 2, littleEndian) !== 0x002a) {
    return null
  }

  const ifdOffset = view.getUint32(tiffStart + 4, littleEndian)
  const ifdStart = tiffStart + ifdOffset
  if (ifdStart + 2 > segmentEnd) {
    return null
  }
  const entryCount = view.getUint16(ifdStart, littleEndian)
  for (let index = 0; index < entryCount; index += 1) {
    const entryStart = ifdStart + 2 + index * 12
    if (entryStart + 12 > segmentEnd) {
      return null
    }
    if (
      view.getUint16(entryStart, littleEndian) === 0x0112
      && view.getUint16(entryStart + 2, littleEndian) === 3
      && view.getUint32(entryStart + 4, littleEndian) >= 1
    ) {
      return {
        orientation: normalizeOrientation(view.getUint16(entryStart + 8, littleEndian)),
        valueOffset: entryStart + 8,
        littleEndian,
      }
    }
  }
  return null
}

const findJpegOrientationEntry = (buffer: ArrayBuffer): ExifOrientationEntry | null => {
  const view = new DataView(buffer)
  if (view.byteLength < 4 || view.getUint16(0, false) !== 0xffd8) {
    return null
  }

  try {
    let offset = 2
    while (offset + 4 <= view.byteLength) {
      while (offset < view.byteLength && view.getUint8(offset) === 0xff) {
        offset += 1
      }
      if (offset >= view.byteLength) {
        return null
      }
      const marker = view.getUint8(offset)
      offset += 1
      if (marker === 0xd9 || marker === 0xda) {
        return null
      }
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
        continue
      }
      if (offset + 2 > view.byteLength) {
        return null
      }
      const segmentLength = view.getUint16(offset, false)
      if (segmentLength < 2) {
        return null
      }
      const segmentStart = offset + 2
      const segmentEnd = offset + segmentLength
      if (segmentEnd > view.byteLength) {
        return null
      }
      if (marker === 0xe1) {
        const entry = readExifOrientationEntry(view, segmentStart, segmentEnd)
        if (entry) {
          return entry
        }
      }
      offset = segmentEnd
    }
  } catch {
    return null
  }
  return null
}

export const parseJpegOrientation = (buffer: ArrayBuffer): ExifOrientation => (
  findJpegOrientationEntry(buffer)?.orientation ?? 1
)

const removeJpegOrientationForDecoding = async (blob: Blob) => {
  if (blob.type.toLowerCase() !== 'image/jpeg') {
    return blob
  }
  const buffer = await blob.arrayBuffer()
  const entry = findJpegOrientationEntry(buffer)
  if (!entry || entry.orientation === 1) {
    return blob
  }
  const copy = buffer.slice(0)
  new DataView(copy).setUint16(entry.valueOffset, 1, entry.littleEndian)
  return new Blob([copy], { type: 'image/jpeg' })
}

export const getOrientationTransform = (
  orientation: number,
  width: number,
  height: number,
): { width: number, height: number, matrix: number[] } => {
  switch (normalizeOrientation(orientation)) {
    case 2:
      return { width, height, matrix: [-1, 0, 0, 1, width, 0] }
    case 3:
      return { width, height, matrix: [-1, 0, 0, -1, width, height] }
    case 4:
      return { width, height, matrix: [1, 0, 0, -1, 0, height] }
    case 5:
      return { width: height, height: width, matrix: [0, 1, 1, 0, 0, 0] }
    case 6:
      return { width: height, height: width, matrix: [0, 1, -1, 0, height, 0] }
    case 7:
      return { width: height, height: width, matrix: [0, -1, -1, 0, height, width] }
    case 8:
      return { width: height, height: width, matrix: [0, -1, 1, 0, 0, width] }
    default:
      return { width, height, matrix: [1, 0, 0, 1, 0, 0] }
  }
}

const decodeWithHtmlImage = (blob: Blob): Promise<DecodedLocalImage> => {
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    return Promise.reject(new Error('Image decoding is unavailable'))
  }

  const objectUrl = URL.createObjectURL(blob)
  const image = new Image()
  return new Promise((resolve, reject) => {
    const releaseOnError = () => {
      image.onload = null
      image.onerror = null
      image.src = ''
      URL.revokeObjectURL(objectUrl)
    }
    image.onload = () => {
      image.onload = null
      image.onerror = null
      resolve({
        source: image,
        width: image.naturalWidth,
        height: image.naturalHeight,
        // decodeBrowserImage removes JPEG orientation before this fallback, so
        // the dimensions and pixels stay in the unrotated source coordinate space.
        orientationApplied: false,
        close: () => {
          image.src = ''
          URL.revokeObjectURL(objectUrl)
        },
      })
    }
    image.onerror = () => {
      releaseOnError()
      reject(new Error('Image decoding failed'))
    }
    image.src = objectUrl
  })
}

export const decodeBrowserImage = async (blob: Blob): Promise<DecodedLocalImage> => {
  const decodingBlob = await removeJpegOrientationForDecoding(blob)
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(decodingBlob, { imageOrientation: 'none' })
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        orientationApplied: false,
        close: () => bitmap.close(),
      }
    } catch {
      // Some browsers expose createImageBitmap but reject imageOrientation: none.
    }
  }
  return decodeWithHtmlImage(decodingBlob)
}

const createCanvas = (width: number, height: number): ImagePreparationCanvas => {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas as unknown as ImagePreparationCanvas
}

const encodeCanvas = (
  canvas: ImagePreparationCanvas,
  mimeType: 'image/webp' | 'image/jpeg',
  quality: number,
) => new Promise<Blob | null>((resolve) => {
  ;(canvas as unknown as HTMLCanvasElement).toBlob(resolve, mimeType, quality)
})

const DEFAULT_DEPENDENCIES: ImagePreparationDependencies = {
  decodeImage: decodeBrowserImage,
  createCanvas,
  encodeCanvas,
}

const renderCanvas = (
  decoded: DecodedLocalImage,
  orientation: ExifOrientation,
  scale: number,
  create: ImagePreparationDependencies['createCanvas'],
) => {
  const sourceWidth = Math.max(1, Math.round(decoded.width * scale))
  const sourceHeight = Math.max(1, Math.round(decoded.height * scale))
  const transform = getOrientationTransform(orientation, sourceWidth, sourceHeight)
  const canvas = create(transform.width, transform.height)
  const context = canvas.getContext('2d')
  if (!context) {
    throw new ImagePreparationError('encode_failed')
  }
  context.setTransform(...transform.matrix as [number, number, number, number, number, number])
  context.drawImage(decoded.source, 0, 0, sourceWidth, sourceHeight)
  return canvas
}

const nextScale = (
  currentScale: number,
  originalLongEdge: number,
  minimumLongEdge: number,
) => {
  const candidate = currentScale * DIMENSION_STEP
  return Math.round(originalLongEdge * candidate) >= minimumLongEdge ? candidate : null
}

export const prepareLocalImage = async (
  blob: Blob,
  options: PrepareLocalImageOptions = {},
): Promise<PreparedLocalImage> => {
  const inputType = blob.type.toLowerCase()
  if (!SUPPORTED_INPUT_TYPES.has(inputType)) {
    throw new ImagePreparationError('unsupported_type')
  }

  const dependencies = options.dependencies ?? DEFAULT_DEPENDENCIES
  let orientation: ExifOrientation = 1
  if (inputType === 'image/jpeg') {
    try {
      orientation = parseJpegOrientation(await blob.arrayBuffer())
    } catch (cause) {
      throw new ImagePreparationError('decode_failed', cause)
    }
  }

  let decoded: DecodedLocalImage
  try {
    decoded = await dependencies.decodeImage(blob)
  } catch (cause) {
    throw cause instanceof ImagePreparationError
      ? cause
      : new ImagePreparationError('decode_failed', cause)
  }

  try {
    if (
      !Number.isFinite(decoded.width)
      || !Number.isFinite(decoded.height)
      || decoded.width < 1
      || decoded.height < 1
    ) {
      throw new ImagePreparationError('decode_failed')
    }

    const effectiveOrientation = decoded.orientationApplied ? 1 : orientation
    const original = getOrientationTransform(
      effectiveOrientation,
      Math.round(decoded.width),
      Math.round(decoded.height),
    )
    const originalLongEdge = Math.max(original.width, original.height)
    const maxLongEdge = options.maxLongEdge ?? DEFAULT_MAX_LONG_EDGE
    const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES
    const minimumLongEdge = Math.min(
      originalLongEdge,
      options.minimumLongEdge ?? DEFAULT_MINIMUM_LONG_EDGE,
    )
    let scale = Math.min(1, maxLongEdge / originalLongEdge)
    let encodedAny = false

    while (true) {
      const canvas = renderCanvas(decoded, effectiveOrientation, scale, dependencies.createCanvas)
      for (const mimeType of ['image/webp', 'image/jpeg'] as const) {
        for (const quality of QUALITY_STEPS) {
          let encoded: Blob | null
          try {
            encoded = await dependencies.encodeCanvas(canvas, mimeType, quality)
          } catch {
            encoded = null
          }
          if (!encoded || encoded.type.toLowerCase() !== mimeType) {
            break
          }
          encodedAny = true
          if (encoded.size <= maxBytes) {
            return {
              blob: encoded,
              mimeType,
              width: canvas.width,
              height: canvas.height,
              originalWidth: original.width,
              originalHeight: original.height,
              bytes: encoded.size,
              processedAt: (options.now ?? (() => new Date()))().toISOString(),
            }
          }
        }
      }

      const smallerScale = nextScale(scale, originalLongEdge, minimumLongEdge)
      if (smallerScale === null) {
        break
      }
      scale = smallerScale
    }

    throw new ImagePreparationError(encodedAny ? 'too_large' : 'encode_failed')
  } catch (cause) {
    throw cause instanceof ImagePreparationError
      ? cause
      : new ImagePreparationError('encode_failed', cause)
  } finally {
    try {
      decoded.close()
    } catch {
      // Cleanup failures must not replace the public preparation result/error.
    }
  }
}
