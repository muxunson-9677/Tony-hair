import { initialMaskFromLandmarks } from './maskGeometry'
import type { MaskDetectionOutcome } from './types'

interface WorkerLandmark {
  readonly x: number
  readonly y: number
}

export const outcomeFromFaceLandmarks = (
  faces: readonly (readonly WorkerLandmark[])[],
): MaskDetectionOutcome => {
  if (faces.length === 0) {
    return { kind: 'none' }
  }
  if (faces.length > 1) {
    return { kind: 'multiple' }
  }
  try {
    return { kind: 'single', transform: initialMaskFromLandmarks(faces[0] ?? []) }
  } catch {
    return { kind: 'error', code: 'inference_failed' }
  }
}
