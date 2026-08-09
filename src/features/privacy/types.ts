export const MASK_STYLES = ['editorial_bar', 'pixel_blocks', 'paper_patch'] as const

export type MaskStyle = typeof MASK_STYLES[number]

export interface MaskTransform {
  readonly centerX: number
  readonly centerY: number
  readonly width: number
  readonly height: number
  readonly rotation: number
}

export type MaskDetectionErrorCode =
  | 'worker_unavailable'
  | 'worker_init_failed'
  | 'model_fetch_failed'
  | 'inference_failed'
  | 'bitmap_failed'
  | 'stale_result'

export type MaskDetectionOutcome =
  | { readonly kind: 'none' }
  | { readonly kind: 'single', readonly transform: MaskTransform }
  | { readonly kind: 'multiple' }
  | { readonly kind: 'error', readonly code: MaskDetectionErrorCode }

export interface MaskExportResult {
  readonly blob: Blob
  readonly mimeType: 'image/webp' | 'image/jpeg'
  readonly width: number
  readonly height: number
  readonly bytes: number
  readonly processedAt: string
}
