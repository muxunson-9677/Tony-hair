import { describe, expect, test } from 'vitest'

import { parseDetectionWorkerResponse, serializeDetectionOutcome } from './faceLandmarker.protocol'

describe('face landmarker worker protocol', () => {
  test('accepts only the four public outcome shapes', () => {
    expect(parseDetectionWorkerResponse({ type: 'result', generation: 3, outcome: { kind: 'none' } })).toEqual({
      type: 'result', generation: 3, outcome: { kind: 'none' },
    })
    const single = parseDetectionWorkerResponse({
      type: 'result',
      generation: 4,
      outcome: {
        kind: 'single',
        transform: { centerX: 0.5, centerY: 0.4, width: 0.6, height: 0.3, rotation: 0 },
      },
    })
    expect(single?.type === 'result' ? single.outcome.kind : null).toBe('single')
    const multiple = parseDetectionWorkerResponse({ type: 'result', generation: 5, outcome: { kind: 'multiple' } })
    expect(multiple?.type === 'result' ? multiple.outcome.kind : null).toBe('multiple')
    const failed = parseDetectionWorkerResponse({
      type: 'result', generation: 6, outcome: { kind: 'error', code: 'model_fetch_failed' },
    })
    expect(failed?.type === 'result' ? failed.outcome.kind : null).toBe('error')
  })

  test.each([
    { type: 'result', generation: 1, outcome: { kind: 'none', landmarks: [] } },
    { type: 'result', generation: 1, outcome: { kind: 'single', transform: { centerX: 0.5, centerY: 0.5, width: 0.5, height: 0.3, rotation: 0 }, blendshapes: [] } },
    { type: 'result', generation: 1, outcome: { kind: 'multiple', matrix: [] } },
    { type: 'result', generation: 1, outcome: { kind: 'single', transform: { centerX: 0.5, centerY: 0.5, width: 0.5, height: 0.3, rotation: 0, z: 1 } } },
    { type: 'result', generation: Number.NaN, outcome: { kind: 'none' } },
    { type: 'disposed', extra: true },
  ])('rejects extra or malformed cross-boundary data', (unsafeResponse) => {
    expect(parseDetectionWorkerResponse(unsafeResponse)).toBeNull()
  })

  test('serialized public output contains no face-data vocabulary', () => {
    const serialized = serializeDetectionOutcome({
      kind: 'single',
      transform: { centerX: 0.5, centerY: 0.5, width: 0.5, height: 0.3, rotation: 0 },
    })

    expect(serialized).not.toMatch(/landmark|blendshape|matrix/i)
  })
})
