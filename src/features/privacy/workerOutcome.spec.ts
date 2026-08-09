import { describe, expect, test } from 'vitest'

import { outcomeFromFaceLandmarks } from './workerOutcome'

describe('worker face count reduction', () => {
  test('maps zero faces to manual fallback', () => {
    expect(outcomeFromFaceLandmarks([])).toEqual({ kind: 'none' })
  })

  test('maps one face to one transform', () => {
    expect(outcomeFromFaceLandmarks([[
      { x: 0.3, y: 0.2 },
      { x: 0.7, y: 0.8 },
    ]])).toEqual({
      kind: 'single',
      transform: { centerX: 0.5, centerY: 0.5, width: 0.5, height: 0.39, rotation: 0 },
    })
  })

  test('maps two or more faces to a hard block with no transform', () => {
    const outcome = outcomeFromFaceLandmarks([
      [{ x: 0.2, y: 0.2 }, { x: 0.4, y: 0.5 }],
      [{ x: 0.6, y: 0.2 }, { x: 0.8, y: 0.5 }],
    ])
    expect(outcome).toEqual({ kind: 'multiple' })
    expect(Object.keys(outcome)).toEqual(['kind'])
  })
})
