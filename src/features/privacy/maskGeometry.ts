import type { MaskTransform } from './types'

interface NormalizedPoint {
  readonly x: number
  readonly y: number
}

const clamp = (value: number, minimum: number, maximum: number) => (
  Math.min(maximum, Math.max(minimum, value))
)

const finite = (value: number, fallback: number) => Number.isFinite(value) ? value : fallback

export const clampMaskTransform = (transform: MaskTransform): MaskTransform => ({
  centerX: clamp(finite(transform.centerX, 0.5), 0, 1),
  centerY: clamp(finite(transform.centerY, 0.5), 0, 1),
  width: clamp(finite(transform.width, 0.5), 0.16, 1),
  height: clamp(finite(transform.height, 0.3), 0.12, 1),
  rotation: clamp(finite(transform.rotation, 0), -45, 45),
})

export const initialMaskFromLandmarks = (landmarks: readonly NormalizedPoint[]): MaskTransform => {
  const valid = landmarks.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
  if (valid.length === 0 || valid.length !== landmarks.length) {
    throw new Error('Expected valid face landmarks')
  }

  const xs = valid.map((point) => point.x)
  const ys = valid.map((point) => point.y)
  const minimumX = Math.min(...xs)
  const maximumX = Math.max(...xs)
  const minimumY = Math.min(...ys)
  const maximumY = Math.max(...ys)
  const faceWidth = maximumX - minimumX
  const faceHeight = maximumY - minimumY

  if (faceWidth <= 0 || faceHeight <= 0) {
    throw new Error('Expected valid face landmarks')
  }

  return clampMaskTransform({
    centerX: Number(((minimumX + maximumX) / 2).toFixed(6)),
    centerY: Number(((minimumY + maximumY) / 2).toFixed(6)),
    width: Number((faceWidth * 1.25).toFixed(6)),
    height: Number((faceHeight * 0.65).toFixed(6)),
    rotation: 0,
  })
}

export const nudgeMaskTransform = (
  transform: MaskTransform,
  directionX: number,
  directionY: number,
  step = 0.01,
) => clampMaskTransform({
  ...transform,
  centerX: transform.centerX + directionX * step,
  centerY: transform.centerY + directionY * step,
})

export const transformFromPreviewDrag = (
  transform: MaskTransform,
  deltaX: number,
  deltaY: number,
  previewWidth: number,
  previewHeight: number,
) => clampMaskTransform({
  ...transform,
  centerX: transform.centerX + deltaX / Math.max(1, previewWidth),
  centerY: transform.centerY + deltaY / Math.max(1, previewHeight),
})
