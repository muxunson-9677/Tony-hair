import { describe, expect, it } from 'vitest'

import { admitSharePhoto, createSharePhotoResolver, detectSharePhoto } from './sharePhotos'
import type { MaskDetectionOutcome, MaskTransform } from '../privacy/types'

const TRANSFORM: MaskTransform = { centerX: 0.5, centerY: 0.4, width: 0.3, height: 0.12, rotation: 0 }

describe('admitSharePhoto', () => {
  it('masks a single detected face automatically', () => {
    const admission = admitSharePhoto({ kind: 'single', transform: TRANSFORM })
    expect(admission.status).toBe('masked')
    expect(admission.transform).toEqual(TRANSFORM)
    expect(admission.statusLine).toBe('已自动遮住脸部')
  })

  it('passes photos without a face through unchanged', () => {
    const admission = admitSharePhoto({ kind: 'none' })
    expect(admission.status).toBe('plain')
    expect(admission.transform).toBeUndefined()
  })

  it('blocks photos with multiple faces instead of guessing', () => {
    const admission = admitSharePhoto({ kind: 'multiple' })
    expect(admission.status).toBe('blocked')
    expect(admission.statusLine).toContain('多张人脸')
  })

  it('blocks honestly when the detector fails, never falling back to plain', () => {
    const codes = ['worker_unavailable', 'worker_init_failed', 'model_fetch_failed', 'inference_failed', 'bitmap_failed', 'stale_result'] as const
    for (const code of codes) {
      expect(admitSharePhoto({ kind: 'error', code }).status).toBe('blocked')
    }
  })
})

describe('detectSharePhoto', () => {
  const blob = new Blob(['x'], { type: 'image/webp' })

  it('runs detection through the injected detector', async () => {
    const detector = {
      detect: async (): Promise<MaskDetectionOutcome> => ({ kind: 'single', transform: TRANSFORM }),
    }
    const admission = await detectSharePhoto(blob, detector, {
      createBitmap: async () => ({} as ImageBitmap),
    })
    expect(admission.status).toBe('masked')
  })

  it('blocks when the bitmap cannot be created', async () => {
    const detector = {
      detect: async (): Promise<MaskDetectionOutcome> => ({ kind: 'none' }),
    }
    const admission = await detectSharePhoto(blob, detector, {
      createBitmap: async () => { throw new Error('decode failed') },
    })
    expect(admission.status).toBe('blocked')
  })
})

describe('createSharePhotoResolver', () => {
  const blob = new Blob(['x'], { type: 'image/webp' })

  it('runs inference once per photo blob and caches the admission', async () => {
    let detections = 0
    const detector = {
      detect: async (): Promise<MaskDetectionOutcome> => {
        detections += 1
        return { kind: 'multiple' }
      },
    }
    const resolve = createSharePhotoResolver(detector, {
      createBitmap: async () => ({} as ImageBitmap),
    })
    const first = await resolve(blob)
    const second = await resolve(blob)
    expect(first.status).toBe('blocked')
    expect(second).toBe(first)
    expect(detections).toBe(1)

    const other = new Blob(['y'], { type: 'image/webp' })
    await resolve(other)
    expect(detections).toBe(2)
  })
})
