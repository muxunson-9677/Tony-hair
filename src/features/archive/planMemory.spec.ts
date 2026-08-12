import { describe, expect, test } from 'vitest'

import {
  buildPlanMemorySuggestions,
  swapAvoidSuggestion,
  PLAN_MEMORY_GROUP_LIMIT,
} from './planMemory'
import type { AvoidRule, BarberBrief, HaircutRecord } from './types'

const repeatRecord = (
  id: string,
  date: string,
  overrides: Partial<HaircutRecord> = {},
): HaircutRecord => ({
  id,
  profileId: 'profile-1',
  date,
  status: 'completed',
  satisfaction: 5,
  outcome: 'repeat',
  styleName: '清爽短碎发',
  createdAt: `${date}T10:00:00.000Z`,
  updatedAt: `${date}T10:00:00.000Z`,
  ...overrides,
} as HaircutRecord)

const adjustRecord = (
  id: string,
  date: string,
  notes: readonly string[],
  overrides: Partial<HaircutRecord> = {},
): HaircutRecord => ({
  id,
  profileId: 'profile-1',
  date,
  status: 'completed',
  satisfaction: 3,
  outcome: 'adjust',
  styleName: '待微调发型',
  adjustmentNotes: notes,
  createdAt: `${date}T10:00:00.000Z`,
  updatedAt: `${date}T10:00:00.000Z`,
  ...overrides,
} as HaircutRecord)

const avoidRule = (
  id: string,
  recordId: string,
  text: string,
  createdAt: string,
  active = true,
): AvoidRule => ({
  id,
  profileId: 'profile-1',
  recordId,
  text,
  createdAt,
  active,
})

const avoidRecord = (
  id: string,
  date: string,
  rules: readonly string[],
  overrides: Partial<HaircutRecord> = {},
): HaircutRecord => ({
  id,
  profileId: 'profile-1',
  date,
  status: 'completed',
  satisfaction: 2,
  outcome: 'avoid',
  styleName: '翻车发型',
  avoidRules: rules,
  createdAt: `${date}T10:00:00.000Z`,
  updatedAt: `${date}T10:00:00.000Z`,
  ...overrides,
} as HaircutRecord)

const brief = (planId: string, topPriorities: readonly string[]): BarberBrief => ({
  id: `brief-${planId}`,
  profileId: 'profile-1',
  planId,
  targetCandidateId: 'candidate-1',
  overall: '整体轻盈',
  top: '顶部保留',
  fringe: '刘海自然',
  sides: '两侧贴合',
  sideburns: '鬓角干净',
  back: '后脑自然',
  topPriorities,
  absoluteAvoids: ['不要推白'],
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
})

describe('buildPlanMemorySuggestions', () => {
  test('returns empty groups when there is no history', () => {
    const result = buildPlanMemorySuggestions({
      records: [],
      avoidRules: [],
      briefsByPlanId: {},
    })
    expect(result.keep).toEqual([])
    expect(result.avoid).toEqual([])
    expect(result.overflowAvoids).toEqual([])
  })

  test('inherits the original Tony card priorities from the latest repeat record', () => {
    const record = repeatRecord('record-repeat', '2026-08-10', { planId: 'plan-a' })
    const result = buildPlanMemorySuggestions({
      records: [record],
      avoidRules: [],
      briefsByPlanId: { 'plan-a': brief('plan-a', ['两侧不要炸', '顶部保留支撑']) },
    })
    expect(result.keep).toHaveLength(2)
    expect(result.keep[0]).toMatchObject({
      kind: 'success',
      text: '两侧不要炸',
      source: 'brief_priority',
      sourceRecordId: 'record-repeat',
      sourceRecordDate: '2026-08-10',
      sourceLabel: '清爽短碎发',
    })
    expect(result.keep[1]).toMatchObject({ text: '顶部保留支撑', source: 'brief_priority' })
  })

  test('falls back to a verifiable repeat sentence without inventing facts', () => {
    const record = repeatRecord('record-repeat', '2026-08-10')
    const result = buildPlanMemorySuggestions({
      records: [record],
      avoidRules: [],
      briefsByPlanId: {},
    })
    expect(result.keep).toEqual([expect.objectContaining({
      kind: 'success',
      text: '整体照上次的「清爽短碎发」复刻',
      source: 'repeat_record',
      sourceRecordId: 'record-repeat',
    })])
  })

  test('inherits adjustment notes verbatim from the latest adjust record only', () => {
    const older = adjustRecord('record-old', '2026-07-01', ['旧的调整不该出现'])
    const newer = adjustRecord('record-new', '2026-08-01', ['两侧留长一点', '刘海薄一点'])
    const result = buildPlanMemorySuggestions({
      records: [older, newer],
      avoidRules: [],
      briefsByPlanId: {},
    })
    expect(result.keep.map(({ text }) => text)).toEqual(['两侧留长一点', '刘海薄一点'])
    expect(result.keep[0]).toMatchObject({
      kind: 'adjustment',
      source: 'adjustment_note',
      sourceRecordId: 'record-new',
    })
  })

  test('drops adjust notes older than the newest repeat record (revision 3)', () => {
    const adjust = adjustRecord('record-adjust', '2026-07-01', ['两侧留长一点'])
    const repeat = repeatRecord('record-repeat', '2026-08-01')
    const result = buildPlanMemorySuggestions({
      records: [adjust, repeat],
      avoidRules: [],
      briefsByPlanId: {},
    })
    expect(result.keep.map(({ kind }) => kind)).toEqual(['success'])
    expect(result.keep.some(({ text }) => text === '两侧留长一点')).toBe(false)
  })

  test('keeps adjust notes newer than the newest repeat record (revision 3)', () => {
    const repeat = repeatRecord('record-repeat', '2026-07-01')
    const adjust = adjustRecord('record-adjust', '2026-08-01', ['两侧留长一点'])
    const result = buildPlanMemorySuggestions({
      records: [repeat, adjust],
      avoidRules: [],
      briefsByPlanId: {},
    })
    expect(result.keep.map(({ text }) => text)).toContain('两侧留长一点')
    const adjustIndex = result.keep.findIndex(({ kind }) => kind === 'adjustment')
    const successIndex = result.keep.findIndex(({ kind }) => kind === 'success')
    expect(adjustIndex).toBeGreaterThanOrEqual(0)
    expect(successIndex).toBeGreaterThan(adjustIndex)
  })

  test('keeps avoid rules regardless of a newer repeat record (revision 3)', () => {
    const avoided = avoidRecord('record-avoid', '2026-07-01', ['两侧不要推白'])
    const repeat = repeatRecord('record-repeat', '2026-08-01')
    const result = buildPlanMemorySuggestions({
      records: [avoided, repeat],
      avoidRules: [avoidRule('rule-1', 'record-avoid', '两侧不要推白', '2026-07-01T10:00:00.000Z')],
      briefsByPlanId: {},
    })
    expect(result.avoid).toEqual([expect.objectContaining({
      kind: 'avoid',
      text: '两侧不要推白',
      source: 'avoid_rule',
      sourceRecordId: 'record-avoid',
      sourceRecordDate: '2026-07-01',
      sourceLabel: '翻车发型',
    })])
  })

  test('only inherits active avoid rules', () => {
    const avoided = avoidRecord('record-avoid', '2026-07-01', ['过期避雷', '仍然有效'])
    const result = buildPlanMemorySuggestions({
      records: [avoided],
      avoidRules: [
        avoidRule('rule-1', 'record-avoid', '过期避雷', '2026-07-01T10:00:00.000Z', false),
        avoidRule('rule-2', 'record-avoid', '仍然有效', '2026-07-01T10:00:00.000Z'),
      ],
      briefsByPlanId: {},
    })
    expect(result.avoid.map(({ text }) => text)).toEqual(['仍然有效'])
  })

  test('deduplicates identical trimmed texts keeping the newest source', () => {
    const older = avoidRecord('record-old', '2026-06-01', ['两侧不要推白'])
    const newer = avoidRecord('record-new', '2026-08-01', ['两侧不要推白 '])
    const result = buildPlanMemorySuggestions({
      records: [older, newer],
      avoidRules: [
        avoidRule('rule-old', 'record-old', '两侧不要推白', '2026-06-01T10:00:00.000Z'),
        avoidRule('rule-new', 'record-new', '两侧不要推白 ', '2026-08-01T10:00:00.000Z'),
      ],
      briefsByPlanId: {},
    })
    expect(result.avoid).toHaveLength(1)
    expect(result.avoid[0]).toMatchObject({
      text: '两侧不要推白',
      sourceRecordId: 'record-new',
    })
  })

  test('caps the keep group at three combined items', () => {
    const repeat = repeatRecord('record-repeat', '2026-07-01', { planId: 'plan-a' })
    const adjust = adjustRecord('record-adjust', '2026-08-01', ['调整一', '调整二', '调整三'])
    const result = buildPlanMemorySuggestions({
      records: [repeat, adjust],
      avoidRules: [],
      briefsByPlanId: { 'plan-a': brief('plan-a', ['重点一', '重点二']) },
    })
    expect(result.keep).toHaveLength(PLAN_MEMORY_GROUP_LIMIT)
    expect(result.keep.map(({ text }) => text)).toEqual(['调整一', '调整二', '调整三'])
  })

  test('moves the oldest avoids beyond three into a visible overflow set (revision 2)', () => {
    const records = [
      avoidRecord('record-1', '2026-05-01', ['避雷一']),
      avoidRecord('record-2', '2026-06-01', ['避雷二']),
      avoidRecord('record-3', '2026-07-01', ['避雷三']),
      avoidRecord('record-4', '2026-08-01', ['避雷四']),
    ]
    const rules = [
      avoidRule('rule-1', 'record-1', '避雷一', '2026-05-01T10:00:00.000Z'),
      avoidRule('rule-2', 'record-2', '避雷二', '2026-06-01T10:00:00.000Z'),
      avoidRule('rule-3', 'record-3', '避雷三', '2026-07-01T10:00:00.000Z'),
      avoidRule('rule-4', 'record-4', '避雷四', '2026-08-01T10:00:00.000Z'),
    ]
    const result = buildPlanMemorySuggestions({
      records,
      avoidRules: rules,
      briefsByPlanId: {},
    })
    expect(result.avoid.map(({ text }) => text)).toEqual(['避雷四', '避雷三', '避雷二'])
    expect(result.overflowAvoids.map(({ text }) => text)).toEqual(['避雷一'])
  })

  test('does not fabricate suggestions or semantic conflicts', () => {
    const result = buildPlanMemorySuggestions({
      records: [repeatRecord('record-repeat', '2026-08-10')],
      avoidRules: [],
      briefsByPlanId: {},
    })
    const allTexts = [...result.keep, ...result.avoid].map(({ text }) => text)
    expect(allTexts.some((text) => /适合|分析|冲突/.test(text))).toBe(false)
  })
})

describe('swapAvoidSuggestion', () => {
  test('swaps an overflow avoid with a chosen active one', () => {
    const active = [
      { text: '避雷四' },
      { text: '避雷三' },
      { text: '避雷二' },
    ]
    const overflow = [{ text: '避雷一' }]
    const result = swapAvoidSuggestion(active, overflow, 0, 2)
    expect(result.avoid.map(({ text }) => text)).toEqual(['避雷四', '避雷三', '避雷一'])
    expect(result.overflowAvoids.map(({ text }) => text)).toEqual(['避雷二'])
  })

  test('returns the original arrays when indexes are out of range', () => {
    const active = [{ text: 'a' }]
    const overflow = [{ text: 'b' }]
    const result = swapAvoidSuggestion(active, overflow, 5, 0)
    expect(result.avoid).toEqual(active)
    expect(result.overflowAvoids).toEqual(overflow)
  })
})
