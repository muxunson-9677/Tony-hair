import { drawOpaqueMask } from '../privacy/flattenMask'
import type { MaskTransform } from '../privacy/types'
import type { ShareCardLayout, SharePhotoSlot } from './shareCards'

export interface ShareRenderCanvas {
  width: number
  height: number
  getContext(type: '2d'): CanvasRenderingContext2D | null
}

export interface DecodedShareImage {
  readonly source: CanvasImageSource
  readonly width: number
  readonly height: number
  close(): void
}

export interface ShareRenderDependencies {
  createCanvas(width: number, height: number): ShareRenderCanvas
  decodeImage(blob: Blob): Promise<DecodedShareImage>
  encodePng(canvas: ShareRenderCanvas): Promise<Blob>
}

const decodeImage = async (blob: Blob): Promise<DecodedShareImage> => {
  const bitmap = await createImageBitmap(blob)
  return {
    source: bitmap,
    width: bitmap.width,
    height: bitmap.height,
    close: () => bitmap.close(),
  }
}

const createCanvas = (width: number, height: number): ShareRenderCanvas => {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

const encodePng = (canvas: ShareRenderCanvas) => new Promise<Blob>((resolve, reject) => {
  ;(canvas as HTMLCanvasElement).toBlob((blob) => {
    if (blob) {
      resolve(blob)
    } else {
      reject(new Error('分享图编码失败，请重试。'))
    }
  }, 'image/png')
})

const DEFAULT_DEPENDENCIES: ShareRenderDependencies = { createCanvas, decodeImage, encodePng }

const roundedRectPath = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) => {
  const r = Math.min(radius, width / 2, height / 2)
  context.beginPath()
  context.moveTo(x + r, y)
  context.lineTo(x + width - r, y)
  context.quadraticCurveTo(x + width, y, x + width, y + r)
  context.lineTo(x + width, y + height - r)
  context.quadraticCurveTo(x + width, y + height, x + width - r, y + height)
  context.lineTo(x + r, y + height)
  context.quadraticCurveTo(x, y + height, x, y + height - r)
  context.lineTo(x, y + r)
  context.quadraticCurveTo(x, y, x + r, y)
  context.closePath()
}

/**
 * 遮罩必须先在原图分辨率上压平，再进入版面裁切，
 * 保证遮罩永远锚定人脸，不因 cover 裁切偏移。
 */
const flattenMaskedPhoto = (
  decoded: DecodedShareImage,
  transform: MaskTransform,
  dependencies: ShareRenderDependencies,
): ShareRenderCanvas => {
  const canvas = dependencies.createCanvas(decoded.width, decoded.height)
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('无法创建本地遮罩画布。')
  }
  context.drawImage(decoded.source, 0, 0, decoded.width, decoded.height)
  drawOpaqueMask(context, decoded.width, decoded.height, transform, 'editorial_bar')
  return canvas
}

const drawPhotoSlot = (
  context: CanvasRenderingContext2D,
  slot: SharePhotoSlot,
  source: CanvasImageSource | ShareRenderCanvas,
  sourceWidth: number,
  sourceHeight: number,
) => {
  const targetRatio = slot.width / slot.height
  const sourceRatio = sourceWidth / sourceHeight
  let sx = 0
  let sy = 0
  let sw = sourceWidth
  let sh = sourceHeight
  if (sourceRatio > targetRatio) {
    sw = sourceHeight * targetRatio
    sx = (sourceWidth - sw) / 2
  } else {
    sh = sourceWidth / targetRatio
    sy = (sourceHeight - sh) / 2
  }

  context.save()
  roundedRectPath(context, slot.x, slot.y, slot.width, slot.height, 24)
  context.clip()
  context.drawImage(source as CanvasImageSource, sx, sy, sw, sh, slot.x, slot.y, slot.width, slot.height)
  context.restore()

  for (const dot of slot.dots ?? []) {
    const cx = slot.x + dot.x * slot.width
    const cy = slot.y + dot.y * slot.height
    context.beginPath()
    context.arc(cx, cy, 26, 0, Math.PI * 2)
    context.fillStyle = '#b0342f'
    context.fill()
    context.font = '700 30px "PingFang SC", "Noto Sans SC", sans-serif'
    context.fillStyle = '#ffffff'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(dot.label, cx, cy + 1)
    context.textBaseline = 'alphabetic'
  }
}

export const renderShareCard = async (
  layout: ShareCardLayout,
  photoBlobs: Readonly<Record<string, Blob>>,
  overrides: Partial<ShareRenderDependencies> = {},
): Promise<Blob> => {
  const dependencies = { ...DEFAULT_DEPENDENCIES, ...overrides }
  const canvas = dependencies.createCanvas(layout.width, layout.height)
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('当前浏览器无法创建分享图画布。')
  }

  context.fillStyle = layout.background
  context.fillRect(0, 0, layout.width, layout.height)

  for (const rect of layout.rects) {
    context.fillStyle = rect.color
    if (rect.radius) {
      roundedRectPath(context, rect.x, rect.y, rect.width, rect.height, rect.radius)
      context.fill()
    } else {
      context.fillRect(rect.x, rect.y, rect.width, rect.height)
    }
  }

  for (const slot of layout.photos) {
    const blob = photoBlobs[slot.key]
    if (!blob) {
      throw new Error(`分享图缺少照片：${slot.key}`)
    }
    const decoded = await dependencies.decodeImage(blob)
    try {
      if (slot.maskTransform) {
        const flattened = flattenMaskedPhoto(decoded, slot.maskTransform, dependencies)
        drawPhotoSlot(context, slot, flattened, flattened.width, flattened.height)
      } else {
        drawPhotoSlot(context, slot, decoded.source, decoded.width, decoded.height)
      }
    } finally {
      decoded.close()
    }
  }

  context.textBaseline = 'alphabetic'
  for (const item of layout.texts) {
    context.font = `${item.fontWeight} ${item.fontSize}px "PingFang SC", "Noto Sans SC", sans-serif`
    context.fillStyle = item.color
    context.textAlign = item.align ?? 'left'
    context.fillText(item.text, item.x, item.y)
  }

  return dependencies.encodePng(canvas)
}
