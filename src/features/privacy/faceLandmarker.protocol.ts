import { clampMaskTransform } from './maskGeometry'
import type { MaskDetectionErrorCode, MaskDetectionOutcome, MaskTransform } from './types'

export type DetectionWorkerRequest =
  | { readonly type: 'detect', readonly generation: number, readonly bitmap: ImageBitmap }
  | { readonly type: 'dispose' }

export type DetectionWorkerResponse =
  | { readonly type: 'result', readonly generation: number, readonly outcome: MaskDetectionOutcome }
  | { readonly type: 'disposed' }

const ERROR_CODES = new Set<MaskDetectionErrorCode>([
  'worker_unavailable',
  'worker_init_failed',
  'model_fetch_failed',
  'inference_failed',
  'bitmap_failed',
  'stale_result',
])

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
)

const hasExactKeys = (value: Record<string, unknown>, keys: readonly string[]) => {
  const actual = Object.keys(value).sort()
  return actual.length === keys.length && actual.every((key, index) => key === [...keys].sort()[index])
}

const parseTransform = (value: unknown): MaskTransform | null => {
  if (!isRecord(value) || !hasExactKeys(value, ['centerX', 'centerY', 'width', 'height', 'rotation'])) {
    return null
  }
  const numbers = [value.centerX, value.centerY, value.width, value.height, value.rotation]
  if (!numbers.every((entry) => typeof entry === 'number' && Number.isFinite(entry))) {
    return null
  }
  return clampMaskTransform(value as unknown as MaskTransform)
}

const parseOutcome = (value: unknown): MaskDetectionOutcome | null => {
  if (!isRecord(value) || typeof value.kind !== 'string') {
    return null
  }
  if (value.kind === 'none' || value.kind === 'multiple') {
    return hasExactKeys(value, ['kind']) ? { kind: value.kind } : null
  }
  if (value.kind === 'single' && hasExactKeys(value, ['kind', 'transform'])) {
    const transform = parseTransform(value.transform)
    return transform ? { kind: 'single', transform } : null
  }
  if (
    value.kind === 'error'
    && hasExactKeys(value, ['kind', 'code'])
    && typeof value.code === 'string'
    && ERROR_CODES.has(value.code as MaskDetectionErrorCode)
  ) {
    return { kind: 'error', code: value.code as MaskDetectionErrorCode }
  }
  return null
}

export const parseDetectionWorkerResponse = (value: unknown): DetectionWorkerResponse | null => {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return null
  }
  if (value.type === 'disposed') {
    return hasExactKeys(value, ['type']) ? { type: 'disposed' } : null
  }
  if (
    value.type !== 'result'
    || !hasExactKeys(value, ['type', 'generation', 'outcome'])
    || typeof value.generation !== 'number'
    || !Number.isSafeInteger(value.generation)
    || value.generation < 0
  ) {
    return null
  }
  const outcome = parseOutcome(value.outcome)
  return outcome ? { type: 'result', generation: value.generation, outcome } : null
}

export const serializeDetectionOutcome = (outcome: MaskDetectionOutcome) => JSON.stringify(outcome)
