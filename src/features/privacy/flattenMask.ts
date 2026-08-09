import type { MaskExportResult, MaskStyle, MaskTransform } from './types'
import { decodeBrowserImage } from '../images/prepareLocalImage'
import { clampMaskTransform } from './maskGeometry'

export interface MaskDrawingContext {
  fillStyle: string | CanvasGradient | CanvasPattern
  save(): void
  restore(): void
  translate(x: number, y: number): void
  rotate(angle: number): void
  fillRect(x: number, y: number, width: number, height: number): void
  beginPath(): void
  moveTo(x: number, y: number): void
  lineTo(x: number, y: number): void
  closePath(): void
  fill(): void
  drawImage(source: unknown, dx: number, dy: number, width: number, height: number): void
}

export interface FlattenMaskCanvas {
  width: number
  height: number
  getContext(type: '2d'): MaskDrawingContext | null
}

export interface DecodedMaskImage {
  readonly source: unknown
  readonly width: number
  readonly height: number
  close(): void
}

export interface FlattenMaskDependencies {
  decodeImage(blob: Blob): Promise<DecodedMaskImage>
  createCanvas(width: number, height: number): FlattenMaskCanvas
  encodeCanvas(
    canvas: FlattenMaskCanvas,
    mimeType: 'image/webp' | 'image/jpeg',
    quality: number,
  ): Promise<Blob | null>
}

export interface FlattenMaskOptions {
  readonly maxBytes?: number
  readonly minimumLongEdge?: number
  readonly now?: () => Date
  readonly dependencies?: FlattenMaskDependencies
}

const QUALITY_STEPS = [0.9, 0.82, 0.74, 0.66, 0.58, 0.5, 0.42] as const
const DIMENSION_STEP = 0.82

const decodeImage = (blob: Blob): Promise<DecodedMaskImage> => decodeBrowserImage(blob)

const createCanvas = (width: number, height: number): FlattenMaskCanvas => {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas as unknown as FlattenMaskCanvas
}

const encodeCanvas = (
  canvas: FlattenMaskCanvas,
  mimeType: 'image/webp' | 'image/jpeg',
  quality: number,
) => new Promise<Blob | null>((resolve) => {
  ;(canvas as unknown as HTMLCanvasElement).toBlob(resolve, mimeType, quality)
})

const DEFAULT_DEPENDENCIES: FlattenMaskDependencies = { decodeImage, createCanvas, encodeCanvas }

export const drawOpaqueMask = (
  context: MaskDrawingContext,
  canvasWidth: number,
  canvasHeight: number,
  inputTransform: MaskTransform,
  style: MaskStyle,
) => {
  const transform = clampMaskTransform(inputTransform)
  const width = transform.width * canvasWidth
  const height = transform.height * canvasHeight
  const x = -width / 2
  const y = -height / 2

  context.save()
  context.translate(transform.centerX * canvasWidth, transform.centerY * canvasHeight)
  context.rotate(transform.rotation * Math.PI / 180)

  if (style === 'editorial_bar') {
    context.fillStyle = '#171512'
    context.fillRect(x, y, width, height)
  } else if (style === 'pixel_blocks') {
    const columns = 8
    const rows = 4
    const cellWidth = width / columns
    const cellHeight = height / rows
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        context.fillStyle = (row + column) % 3 === 0 ? '#7a4936' : '#171512'
        context.fillRect(x + column * cellWidth, y + row * cellHeight, cellWidth + 0.5, cellHeight + 0.5)
      }
    }
  } else {
    context.fillStyle = '#e8ded0'
    context.beginPath()
    context.moveTo(x, y + height * 0.08)
    context.lineTo(x + width * 0.18, y)
    context.lineTo(x + width * 0.53, y + height * 0.05)
    context.lineTo(x + width, y)
    context.lineTo(x + width * 0.96, y + height * 0.92)
    context.lineTo(x + width * 0.62, y + height)
    context.lineTo(x + width * 0.24, y + height * 0.94)
    context.lineTo(x, y + height)
    context.closePath()
    context.fill()
  }
  context.restore()
}

const renderAtScale = (
  decoded: DecodedMaskImage,
  transform: MaskTransform,
  style: MaskStyle,
  scale: number,
  dependencies: FlattenMaskDependencies,
) => {
  const width = Math.max(1, Math.round(decoded.width * scale))
  const height = Math.max(1, Math.round(decoded.height * scale))
  const canvas = dependencies.createCanvas(width, height)
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('无法创建本地导出画布。')
  }
  context.drawImage(decoded.source, 0, 0, width, height)
  drawOpaqueMask(context, width, height, transform, style)
  return canvas
}

export const flattenMask = async (
  source: Blob,
  transform: MaskTransform,
  style: MaskStyle,
  options: FlattenMaskOptions = {},
): Promise<MaskExportResult> => {
  const dependencies = options.dependencies ?? DEFAULT_DEPENDENCIES
  const maxBytes = options.maxBytes ?? 1_500_000
  const decoded = await dependencies.decodeImage(source)

  try {
    if (!Number.isFinite(decoded.width) || !Number.isFinite(decoded.height) || decoded.width < 1 || decoded.height < 1) {
      throw new Error('无法读取本地照片尺寸。')
    }
    const originalLongEdge = Math.max(decoded.width, decoded.height)
    const minimumLongEdge = Math.min(originalLongEdge, options.minimumLongEdge ?? 480)
    let scale = 1

    while (Math.round(originalLongEdge * scale) >= minimumLongEdge) {
      const canvas = renderAtScale(decoded, transform, style, scale, dependencies)
      for (const mimeType of ['image/webp', 'image/jpeg'] as const) {
        for (const quality of QUALITY_STEPS) {
          const blob = await dependencies.encodeCanvas(canvas, mimeType, quality)
          if (!blob || blob.type.toLowerCase() !== mimeType) {
            break
          }
          if (blob.size <= maxBytes) {
            return {
              blob,
              mimeType,
              width: canvas.width,
              height: canvas.height,
              bytes: blob.size,
              processedAt: (options.now ?? (() => new Date()))().toISOString(),
            }
          }
        }
      }
      scale *= DIMENSION_STEP
    }
    throw new Error('遮罩图片导出失败，请换一张照片后重试。')
  } finally {
    decoded.close()
  }
}
