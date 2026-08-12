import { describe, expect, it } from 'vitest'

import {
  buildRegionMarkSuggestions,
  describeRegionConflict,
  detectRegionConflicts,
  regionMarkSummary,
  regionMarkValidationError,
} from './regionMarks'
import type { HaircutRecord, RegionMark } from './types'

const mark = (overrides: Partial<RegionMark> = {}): RegionMark => ({
  id: 'mark-1',
  region: 'sides',
  issue: 'too_short',
  x: 0.5,
  y: 0.5,
  ...overrides,
})

const record = (overrides: Partial<HaircutRecord> & Pick<HaircutRecord, 'outcome'>): HaircutRecord => ({
  id: 'record-1',
  profileId: 'profile-1',
  date: '2026-08-01',
  status: 'completed',
  satisfaction: 2,
  styleName: '短碎',
  createdAt: '2026-08-01T10:00:00.000Z',
  updatedAt: '2026-08-01T10:00:00.000Z',
  ...(overrides.outcome === 'avoid'
    ? { avoidRules: ['太短'] }
    : overrides.outcome === 'adjust'
      ? { adjustmentNotes: ['微调'] }
      : {}),
  ...overrides,
} as HaircutRecord)

describe('regionMarkValidationError', () => {
  it('accepts a standard issue mark without a note', () => {
    expect(regionMarkValidationError(mark())).toBeNull()
  })

  it('requires a note for custom issues', () => {
    expect(regionMarkValidationError(mark({ issue: 'custom', note: '   ' }))).toContain('自定义')
    expect(regionMarkValidationError(mark({ issue: 'custom', note: '鬓角剃出直角了' }))).toBeNull()
  })

  it('rejects notes above 160 characters', () => {
    expect(regionMarkValidationError(mark({ note: '啊'.repeat(161) }))).toContain('160')
    expect(regionMarkValidationError(mark({ note: '啊'.repeat(160) }))).toBeNull()
  })

  it('rejects coordinates outside the photo', () => {
    expect(regionMarkValidationError(mark({ x: -0.1 }))).toContain('位置')
    expect(regionMarkValidationError(mark({ y: 1.2 }))).toContain('位置')
    expect(regionMarkValidationError(mark({ x: Number.NaN }))).toContain('位置')
  })
})

describe('regionMarkSummary', () => {
  it('joins region and issue labels', () => {
    expect(regionMarkSummary(mark())).toBe('两侧 · 太短')
  })

  it('uses the note for custom issues', () => {
    expect(regionMarkSummary(mark({ issue: 'custom', note: '发缝分错边' }))).toBe('两侧 · 发缝分错边')
  })
})

describe('buildRegionMarkSuggestions', () => {
  it('maps issues to deterministic memory texts with the record as source', () => {
    const suggestions = buildRegionMarkSuggestions([
      record({ outcome: 'avoid', regionMarks: [mark()] }),
    ])
    expect(suggestions).toEqual([{
      kind: 'avoid',
      text: '两侧：上次剪太短，这次保留长度',
      source: 'region_mark',
      sourceRecordId: 'record-1',
      sourceRecordDate: '2026-08-01',
      sourceLabel: '短碎',
    }])
  })

  it('covers every issue template', () => {
    const suggestions = buildRegionMarkSuggestions([record({
      outcome: 'adjust',
      regionMarks: [
        mark({ id: 'm1', region: 'top', issue: 'too_thin' }),
        mark({ id: 'm2', region: 'fringe', issue: 'wrong_shape' }),
        mark({ id: 'm3', region: 'back', issue: 'harsh_transition' }),
        mark({ id: 'm4', region: 'sideburns', issue: 'custom', note: '剃成直角了' }),
      ],
    })])
    expect(suggestions.map(({ text }) => text)).toEqual([
      '顶部：上次打太薄，这次保留厚度',
      '刘海：上次形状不对，这次先确认轮廓再动手',
      '后脑：上次衔接生硬，这次要求过渡自然',
      '鬓角：剃成直角了',
    ])
  })

  it('keeps only the latest mark per region and issue', () => {
    const suggestions = buildRegionMarkSuggestions([
      record({ id: 'old', date: '2026-06-01', outcome: 'avoid', regionMarks: [mark({ id: 'm-old' })] }),
      record({ id: 'new', date: '2026-08-01', outcome: 'avoid', regionMarks: [mark({ id: 'm-new' })] }),
    ])
    expect(suggestions).toHaveLength(1)
    expect(suggestions[0]?.sourceRecordId).toBe('new')
  })

  it('ignores repeat records and records without marks', () => {
    expect(buildRegionMarkSuggestions([
      record({ outcome: 'repeat' }),
      record({ id: 'record-2', outcome: 'avoid' }),
    ])).toEqual([])
  })
})

describe('detectRegionConflicts', () => {
  const markedRecords = [
    record({ outcome: 'avoid', regionMarks: [mark()] }),
  ]

  it('flags too_short vs cut_shorter on the same region', () => {
    const conflicts = detectRegionConflicts(
      [{ region: 'sides', direction: 'cut_shorter' }],
      markedRecords,
    )
    expect(conflicts).toEqual([{
      region: 'sides',
      issue: 'too_short',
      direction: 'cut_shorter',
      markRecordId: 'record-1',
      markRecordDate: '2026-08-01',
      markRecordLabel: '短碎',
    }])
  })

  it('flags too_thin vs thin_out on the same region', () => {
    const conflicts = detectRegionConflicts(
      [{ region: 'top', direction: 'thin_out' }],
      [record({ outcome: 'adjust', regionMarks: [mark({ region: 'top', issue: 'too_thin' })] })],
    )
    expect(conflicts).toHaveLength(1)
  })

  it('does not flag a different region', () => {
    expect(detectRegionConflicts(
      [{ region: 'top', direction: 'cut_shorter' }],
      markedRecords,
    )).toEqual([])
  })

  it('does not flag non-opposing directions', () => {
    expect(detectRegionConflicts(
      [{ region: 'sides', direction: 'keep_length' }, { region: 'sides', direction: 'keep_volume' }],
      markedRecords,
    )).toEqual([])
  })

  it('never matches custom or shape issues, even on the same region', () => {
    const records = [record({
      outcome: 'avoid',
      regionMarks: [
        mark({ id: 'm1', issue: 'custom', note: '两侧铲太短了' }),
        mark({ id: 'm2', issue: 'wrong_shape' }),
        mark({ id: 'm3', issue: 'harsh_transition' }),
      ],
    })]
    expect(detectRegionConflicts(
      [{ region: 'sides', direction: 'cut_shorter' }, { region: 'sides', direction: 'thin_out' }],
      records,
    )).toEqual([])
  })

  it('points to the most recent conflicting record', () => {
    const conflicts = detectRegionConflicts(
      [{ region: 'sides', direction: 'cut_shorter' }],
      [
        record({ id: 'old', date: '2026-05-01', outcome: 'avoid', regionMarks: [mark()] }),
        record({ id: 'new', date: '2026-07-01', outcome: 'avoid', regionMarks: [mark()] }),
      ],
    )
    expect(conflicts.map(({ markRecordId }) => markRecordId)).toEqual(['new'])
  })
})

describe('describeRegionConflict', () => {
  it('names both sources so the user can arbitrate', () => {
    const [conflict] = detectRegionConflicts(
      [{ region: 'sides', direction: 'cut_shorter' }],
      [record({ outcome: 'avoid', regionMarks: [mark()] })],
    )
    expect(describeRegionConflict(conflict!)).toBe(
      '两侧：上次（2026-08-01 · 短碎）标了「太短」，这次又要求「剪更短·铲短」。确定要这样吗？',
    )
  })
})
