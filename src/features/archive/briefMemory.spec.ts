import { describe, expect, test } from 'vitest'

import { buildBriefListDefaults } from './briefMemory'
import type { PlanMemoryItem } from './types'

const memoryItem = (overrides: Partial<PlanMemoryItem>): PlanMemoryItem => ({
  id: 'memory-1',
  profileId: 'profile-1',
  planId: 'plan-1',
  order: 1,
  kind: 'avoid',
  text: '两侧不要推白',
  originalText: '两侧不要推白',
  source: 'avoid_rule',
  sourceRecordId: 'record-1',
  sourceRecordDate: '2026-08-01',
  sourceLabel: '翻车寸头',
  createdAt: '2026-08-13T00:00:00.000Z',
  updatedAt: '2026-08-13T00:00:00.000Z',
  ...overrides,
})

describe('buildBriefListDefaults', () => {
  test('uses plan memories ahead of the curated guide when a snapshot exists', () => {
    const result = buildBriefListDefaults({
      planMemoryItems: [
        memoryItem({ id: 'm1', order: 1, kind: 'adjustment', text: '两侧留长一点' }),
        memoryItem({ id: 'm2', order: 2, kind: 'success', text: '整体照上次的「清爽短发」复刻' }),
        memoryItem({ id: 'm3', order: 3, kind: 'avoid', text: '别再打薄' }),
      ],
      guideTopPriorities: ['顶部保留长度', '两侧留长一点'],
      guideAbsoluteAvoids: ['不要推太高'],
      activeAvoidTexts: ['这条全局避雷不该出现'],
    })

    expect(result.topPriorities).toEqual([
      '两侧留长一点',
      '整体照上次的「清爽短发」复刻',
      '顶部保留长度',
    ])
    expect(result.absoluteAvoids).toEqual(['别再打薄', '不要推太高'])
    expect(result.absoluteAvoids).not.toContain('这条全局避雷不该出现')
  })

  test('falls back to guide plus global active avoids when the plan has no snapshot', () => {
    const result = buildBriefListDefaults({
      planMemoryItems: [],
      guideTopPriorities: ['顶部保留长度'],
      guideAbsoluteAvoids: ['不要推太高'],
      activeAvoidTexts: ['两侧不要推白', '别再打薄'],
    })

    expect(result.topPriorities).toEqual(['顶部保留长度'])
    expect(result.absoluteAvoids).toEqual(['不要推太高', '两侧不要推白', '别再打薄'])
  })

  test('deduplicates trimmed texts and keeps at most three per list', () => {
    const result = buildBriefListDefaults({
      planMemoryItems: [
        memoryItem({ id: 'm1', order: 1, kind: 'avoid', text: ' 别再打薄 ' }),
        memoryItem({ id: 'm2', order: 2, kind: 'avoid', text: '别再打薄' }),
        memoryItem({ id: 'm3', order: 3, kind: 'avoid', text: '避雷二' }),
        memoryItem({ id: 'm4', order: 4, kind: 'avoid', text: '避雷三' }),
      ],
      guideTopPriorities: [],
      guideAbsoluteAvoids: ['避雷四'],
      activeAvoidTexts: [],
    })

    expect(result.absoluteAvoids).toEqual(['别再打薄', '避雷二', '避雷三'])
  })

  test('sorts memories by their saved order before merging', () => {
    const result = buildBriefListDefaults({
      planMemoryItems: [
        memoryItem({ id: 'm2', order: 2, kind: 'success', text: '第二条' }),
        memoryItem({ id: 'm1', order: 1, kind: 'adjustment', text: '第一条' }),
      ],
      guideTopPriorities: [],
      guideAbsoluteAvoids: [],
      activeAvoidTexts: [],
    })

    expect(result.topPriorities).toEqual(['第一条', '第二条'])
  })

  test('returns empty lists when nothing is available', () => {
    const result = buildBriefListDefaults({
      planMemoryItems: [],
      guideTopPriorities: [],
      guideAbsoluteAvoids: [],
      activeAvoidTexts: [],
    })

    expect(result.topPriorities).toEqual([])
    expect(result.absoluteAvoids).toEqual([])
  })
})
