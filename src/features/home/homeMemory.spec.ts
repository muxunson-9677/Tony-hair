import { describe, expect, test } from 'vitest'

import { daysSinceLastHaircut, selectRepeatThumbnailPhoto } from './homeMemory'
import type { HaircutPhoto, HaircutRecord } from '../archive/types'

const record = (overrides: Record<string, unknown>): HaircutRecord => ({
  id: 'record-1',
  profileId: 'profile-1',
  date: '2026-08-01',
  status: 'completed',
  styleName: '清爽短发',
  satisfaction: 5,
  outcome: 'repeat',
  createdAt: '2026-08-01T10:00:00.000Z',
  updatedAt: '2026-08-01T10:00:00.000Z',
  ...overrides,
} as HaircutRecord)

const photo = (overrides: Partial<HaircutPhoto>): HaircutPhoto => ({
  id: 'photo-1',
  recordId: 'record-1',
  stage: 'after',
  image: new Blob(['x'], { type: 'image/webp' }),
  width: 100,
  height: 100,
  capturedAt: '2026-08-01T10:00:00.000Z',
  ...overrides,
})

describe('daysSinceLastHaircut', () => {
  test('returns whole days between the latest record date and today', () => {
    expect(daysSinceLastHaircut('2026-08-01', new Date('2026-08-13T09:30:00'))).toBe(12)
  })

  test('returns zero on the same day', () => {
    expect(daysSinceLastHaircut('2026-08-13', new Date('2026-08-13T23:59:00'))).toBe(0)
  })

  test('returns null without a record date or with an unparsable date', () => {
    expect(daysSinceLastHaircut(undefined, new Date('2026-08-13T00:00:00'))).toBeNull()
    expect(daysSinceLastHaircut('not-a-date', new Date('2026-08-13T00:00:00'))).toBeNull()
  })

  test('clamps future-dated records to zero instead of showing negative days', () => {
    expect(daysSinceLastHaircut('2026-08-20', new Date('2026-08-13T00:00:00'))).toBe(0)
  })
})

describe('selectRepeatThumbnailPhoto', () => {
  test('prefers the after photo of the most recent repeat record', () => {
    const records = [
      record({ id: 'newer-adjust', date: '2026-08-10', outcome: 'adjust' }),
      record({ id: 'repeat-new', date: '2026-08-05' }),
      record({ id: 'repeat-old', date: '2026-06-01' }),
    ]
    const photosByRecordId = {
      'repeat-new': [
        photo({ id: 'p-before', recordId: 'repeat-new', stage: 'before' }),
        photo({ id: 'p-after', recordId: 'repeat-new', stage: 'after' }),
      ],
      'repeat-old': [photo({ id: 'p-old', recordId: 'repeat-old' })],
    }

    expect(selectRepeatThumbnailPhoto(records, photosByRecordId)?.id).toBe('p-after')
  })

  test('falls back to styled or unstyled photos when there is no after photo', () => {
    const records = [record({ id: 'repeat-new', date: '2026-08-05' })]
    const photosByRecordId = {
      'repeat-new': [photo({ id: 'p-styled', recordId: 'repeat-new', stage: 'styled' })],
    }
    expect(selectRepeatThumbnailPhoto(records, photosByRecordId)?.id).toBe('p-styled')
  })

  test('returns undefined without repeat records or photos', () => {
    expect(selectRepeatThumbnailPhoto([record({ outcome: 'avoid' })], {})).toBeUndefined()
    expect(selectRepeatThumbnailPhoto([record({ id: 'r1' })], {})).toBeUndefined()
  })
})
