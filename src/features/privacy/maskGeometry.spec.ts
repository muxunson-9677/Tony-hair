import { describe, expect, test } from 'vitest'

import {
  clampMaskTransform,
  initialMaskFromLandmarks,
  nudgeMaskTransform,
} from './maskGeometry'

describe('mask geometry', () => {
  test('derives a centered normalized mask from face landmarks without exposing them', () => {
    const transform = initialMaskFromLandmarks([
      { x: 0.3, y: 0.2 },
      { x: 0.7, y: 0.75 },
      { x: 0.45, y: 0.5 },
    ])

    expect(transform).toEqual({
      centerX: 0.5,
      centerY: 0.475,
      width: 0.5,
      height: 0.3575,
      rotation: 0,
    })
    expect(Object.keys(transform)).not.toContain('landmarks')
  })

  test('clamps every editable value to a safe normalized range', () => {
    expect(clampMaskTransform({
      centerX: -2,
      centerY: 4,
      width: 0.01,
      height: -2,
      rotation: 140,
    })).toEqual({
      centerX: 0,
      centerY: 1,
      width: 0.16,
      height: 0.12,
      rotation: 45,
    })
  })

  test('nudges in image-relative steps and remains clamped', () => {
    const start = { centerX: 0.99, centerY: 0.01, width: 0.4, height: 0.3, rotation: 0 }
    expect(nudgeMaskTransform(start, 1, -1, 0.02)).toMatchObject({ centerX: 1, centerY: 0 })
  })

  test('rejects empty and non-finite landmark data', () => {
    expect(() => initialMaskFromLandmarks([])).toThrow('valid face landmarks')
    expect(() => initialMaskFromLandmarks([{ x: Number.NaN, y: 0.5 }])).toThrow('valid face landmarks')
  })
})
