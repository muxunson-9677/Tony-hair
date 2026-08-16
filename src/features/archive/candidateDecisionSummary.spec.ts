import { describe, expect, test } from 'vitest'

import type { Candidate } from './types'
import { resolveCandidateDecisionSummary } from './candidateDecisionSummary'

const candidate = (overrides: Partial<Candidate> = {}): Candidate => ({
  id: 'candidate-1',
  planId: 'plan-1',
  order: 1,
  name: '参考方向',
  notes: '喜欢两侧，刘海不要照搬',
  source: 'user_reference',
  referenceId: 'ref-1',
  referenceImage: new Blob(['image'], { type: 'image/webp' }),
  referenceImageWidth: 800,
  referenceImageHeight: 1200,
  referenceImageBytes: 5,
  referenceImageProcessedAt: '2026-08-12T00:00:00.000Z',
  ...overrides,
})

describe('resolveCandidateDecisionSummary', () => {
  test('never invents feasibility for a private reference', () => {
    expect(resolveCandidateDecisionSummary(candidate())).toEqual({
      feasibility: '尚未评估',
      maintenance: '到店前确认',
      change: '按你的参考图校正',
      risk: '不要把整张图原样照搬',
    })
  })

  test('uses the maintained catalog facts for a known demo direction', () => {
    const summary = resolveCandidateDecisionSummary(candidate({
      source: 'demo_ai',
      referenceId: undefined,
      referenceImage: undefined,
      referenceImageWidth: undefined,
      referenceImageHeight: undefined,
      referenceImageBytes: undefined,
      referenceImageProcessedAt: undefined,
      demoImagePath: '/demo/persona-lin-bob.webp',
    }))
    expect(summary.feasibility).toMatch(/保留耳前重量/)
    expect(summary.maintenance).toMatch(/8 分钟/)
    expect(summary.risk).toMatch(/齐颌轮廓/)
  })
})
