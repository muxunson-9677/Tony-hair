import type { MaskDetectionOutcome, MaskTransform } from '../privacy/types'

export type SharePhotoStatus = 'masked' | 'plain' | 'blocked'

export interface SharePhotoAdmission {
  readonly status: SharePhotoStatus
  readonly transform?: MaskTransform
  readonly statusLine: string
}

/**
 * 分享照片准入策略（确定性）：
 * - 检出单张人脸 → 自动加不可逆遮罩后放行；
 * - 检出多张人脸 → 拦截（不猜哪张是本人）；
 * - 检测器出错/不可用 → 拦截（诚实降级，不冒险裸发）；
 * - 未检出人脸 → 原样放行（如后脑勺照）。
 */
export const admitSharePhoto = (outcome: MaskDetectionOutcome): SharePhotoAdmission => {
  if (outcome.kind === 'single') {
    return { status: 'masked', transform: outcome.transform, statusLine: '已自动遮住脸部' }
  }
  if (outcome.kind === 'none') {
    return { status: 'plain', statusLine: '未检测到人脸，按原图使用' }
  }
  if (outcome.kind === 'multiple') {
    return { status: 'blocked', statusLine: '照片里有多张人脸，为保护隐私暂不支持分享这张' }
  }
  return { status: 'blocked', statusLine: '人脸检测暂不可用，为保护隐私先不生成这张' }
}

export interface SharePhotoDetector {
  detect(bitmap: ImageBitmap, generation: number): Promise<MaskDetectionOutcome>
}

export interface DetectSharePhotoDependencies {
  readonly createBitmap?: (blob: Blob) => Promise<ImageBitmap>
}

let detectionGeneration = 0

export const detectSharePhoto = async (
  blob: Blob,
  detector: SharePhotoDetector,
  dependencies: DetectSharePhotoDependencies = {},
): Promise<SharePhotoAdmission> => {
  const createBitmap = dependencies.createBitmap ?? ((value: Blob) => createImageBitmap(value))
  let bitmap: ImageBitmap
  try {
    bitmap = await createBitmap(blob)
  } catch {
    return admitSharePhoto({ kind: 'error', code: 'bitmap_failed' })
  }
  detectionGeneration += 1
  const outcome = await detector.detect(bitmap, detectionGeneration)
  return admitSharePhoto(outcome)
}

export type SharePhotoResolver = (blob: Blob) => Promise<SharePhotoAdmission>

/** 同一张照片只推理一次；拦截结果也缓存（同一会话内结论不会变）。 */
export const createSharePhotoResolver = (
  detector: SharePhotoDetector,
  dependencies: DetectSharePhotoDependencies = {},
): SharePhotoResolver => {
  const cache = new WeakMap<Blob, Promise<SharePhotoAdmission>>()
  return (blob) => {
    const cached = cache.get(blob)
    if (cached) {
      return cached
    }
    const admission = detectSharePhoto(blob, detector, dependencies)
    cache.set(blob, admission)
    return admission
  }
}
