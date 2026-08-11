import { describe, expect, test } from 'vitest'

import type {
  BarberBrief,
  Candidate,
  HairProfile,
  HaircutPhoto,
  HaircutPlan,
  HaircutRecord,
  StandardStyle,
} from '../archive/types'
import { resolveHomeAction, resolveHomeEntrances } from './resolveHomeAction'

const now = new Date(2026, 7, 10, 12, 0, 0)

const profile: HairProfile = {
  id: 'profile-1',
  name: '阿青',
  hairTexture: 'wavy',
  strandThickness: 'medium',
  density: 'medium',
  stylingMinutes: 8,
  washFrequency: 'every_other_day',
  preferenceNotes: '',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
}

const plan = (overrides: Partial<HaircutPlan> = {}): HaircutPlan => ({
  id: 'plan-1',
  profileId: profile.id,
  title: '下次理发',
  date: '2026-08-20',
  mode: 'exploration',
  status: 'draft',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-09T00:00:00.000Z',
  ...overrides,
})

const candidate = (id: string): Candidate => ({
  id,
  planId: 'plan-1',
  order: Number(id.slice(-1)) || 1,
  name: `候选 ${id}`,
  notes: '',
  source: 'demo_ai',
  demoImagePath: '/demo/persona-lin-bob.webp',
})

const record = (
  overrides: Partial<Extract<HaircutRecord, { outcome: 'repeat' }>> = {},
): HaircutRecord => ({
  id: 'record-1',
  profileId: profile.id,
  date: '2026-08-04',
  status: 'completed',
  satisfaction: 4,
  styleName: '短碎发',
  outcome: 'repeat',
  createdAt: '2026-08-04T08:00:00.000Z',
  updatedAt: '2026-08-04T08:00:00.000Z',
  ...overrides,
})

const photo = (stage: HaircutPhoto['stage']): HaircutPhoto => ({
  id: `photo-${stage}`,
  recordId: 'record-1',
  stage,
  image: new Blob(['photo'], { type: 'image/webp' }),
  capturedAt: '2026-08-04T08:00:00.000Z',
})

const standardStyle: StandardStyle = {
  id: 'standard-1',
  profileId: profile.id,
  recordId: 'record-1',
  name: '短碎发',
  createdAt: '2026-08-04T08:00:00.000Z',
  active: true,
}

const brief = (planId = 'plan-1'): BarberBrief => ({
  id: 'brief-1',
  profileId: profile.id,
  planId,
  targetCandidateId: 'candidate-1',
  overall: '整体',
  top: '顶部',
  fringe: '刘海',
  sides: '两侧',
  sideburns: '鬓角',
  back: '后脑',
  topPriorities: ['轮廓'],
  absoluteAvoids: ['推高'],
  createdAt: '2026-08-09T00:00:00.000Z',
  updatedAt: '2026-08-09T00:00:00.000Z',
})

const resolve = (overrides: Partial<Parameters<typeof resolveHomeAction>[0]> = {}) => (
  resolveHomeAction({
    now,
    profile,
    plans: [],
    candidatesByPlanId: {},
    briefsByPlanId: {},
    records: [],
    photosByRecordId: {},
    standardStyles: [],
    ...overrides,
  })
)

describe('resolveHomeAction', () => {
  test('starts with the device hair profile when none exists', () => {
    expect(resolve({ profile: null })).toEqual({
      kind: 'create_profile',
      label: '先认识一下我的头发',
      to: '/archive/profile',
    })
  })

  test('sends a profiled user without a plan to discovery', () => {
    expect(resolve()).toEqual({
      kind: 'discover_styles',
      label: '帮我选',
      to: '/archive/plans/new?intent=choose',
    })
  })

  test('prioritizes an active standard style when there is no active plan', () => {
    expect(resolve({ standardStyles: [standardStyle] })).toEqual({
      kind: 'repeat_standard',
      label: '照上次剪',
      to: '/archive/plans/new?intent=repeat',
    })
  })

  test('routes an incomplete exploration plan to the curated library', () => {
    expect(resolve({
      plans: [plan()],
      candidatesByPlanId: { 'plan-1': [candidate('candidate-1')] },
    })).toEqual({
      kind: 'add_candidates',
      label: '添加候选',
      to: '/styles',
    })
  })

  test('routes an empty repeat plan to its StandardStyle selection form', () => {
    expect(resolve({ plans: [plan({ mode: 'repeat' })] })).toEqual({
      kind: 'choose_standard',
      label: '选择标准发型',
      to: '/archive/plans/plan-1/edit',
    })
  })

  test('asks for the main choice when a mode-valid plan has no brief', () => {
    expect(resolve({
      plans: [plan()],
      candidatesByPlanId: {
        'plan-1': [candidate('candidate-1'), candidate('candidate-2')],
      },
    })).toEqual({
      kind: 'choose_primary',
      label: '确定主方案',
      to: '/archive/plans/plan-1/brief',
    })
  })

  test('opens the existing brief when the plan already has one', () => {
    expect(resolve({
      plans: [plan()],
      candidatesByPlanId: {
        'plan-1': [candidate('candidate-1'), candidate('candidate-2')],
      },
      briefsByPlanId: { 'plan-1': brief() },
    })).toEqual({
      kind: 'open_brief',
      label: '打开沟通卡',
      to: '/archive/plans/plan-1/brief',
    })
  })

  test('opens a single repeat snapshot and repairs repeat plans with two or more candidates', () => {
    const repeatPlan = plan({ mode: 'repeat' })
    const oneCandidate = [candidate('candidate-1')]

    expect(resolve({
      plans: [repeatPlan],
      candidatesByPlanId: { 'plan-1': oneCandidate },
    })).toEqual({
      kind: 'choose_primary',
      label: '确定主方案',
      to: '/archive/plans/plan-1/brief',
    })

    expect(resolve({
      plans: [repeatPlan],
      candidatesByPlanId: { 'plan-1': oneCandidate },
      briefsByPlanId: { 'plan-1': brief() },
    })).toEqual({
      kind: 'open_brief',
      label: '打开沟通卡',
      to: '/archive/plans/plan-1/brief',
    })

    expect(resolve({
      plans: [repeatPlan],
      candidatesByPlanId: {
        'plan-1': [candidate('candidate-1'), candidate('candidate-2')],
      },
    })).toEqual({
      kind: 'continue_plan',
      label: '继续完善计划',
      to: '/archive/plans/plan-1/edit',
    })

    expect(resolve({
      plans: [plan({ mode: 'repeat', status: 'ready', date: '2026-08-10' })],
      candidatesByPlanId: {
        'plan-1': [candidate('candidate-1'), candidate('candidate-2')],
      },
      briefsByPlanId: { 'plan-1': brief() },
    })).toMatchObject({ kind: 'continue_plan' })
  })

  test('opens a ready plan due within three local calendar days, including overdue plans', () => {
    for (const date of ['2026-07-20', '2026-08-10', '2026-08-13']) {
      expect(resolve({
        plans: [plan({ date, status: 'ready' })],
        candidatesByPlanId: { 'plan-1': [] },
      })).toEqual({
        kind: 'open_ready_brief',
        label: '打开理发师沟通卡',
        to: '/archive/plans/plan-1/brief',
      })
    }
  })

  test('does not apply the ready-plan shortcut beyond the third local calendar day', () => {
    expect(resolve({
      plans: [plan({ date: '2026-08-14', status: 'ready' })],
      candidatesByPlanId: { 'plan-1': [] },
    })).toMatchObject({ kind: 'add_candidates' })
  })

  test('never silently chooses between multiple active plans', () => {
    expect(resolve({
      plans: [plan(), plan({ id: 'plan-2', status: 'ready', date: '2026-08-10' })],
      standardStyles: [standardStyle],
    })).toEqual({
      kind: 'choose_plan',
      label: '选择继续哪个计划',
      to: '/archive',
    })
  })

  test('does not nag for after-wash photos and keeps the real plan task first', () => {
    expect(resolve({
      plans: [plan(), plan({ id: 'plan-2' })],
      records: [record()],
      photosByRecordId: { 'record-1': [photo('styled')] },
    })).toMatchObject({ kind: 'choose_plan' })
  })

  test('does not create a day-7 follow-up task', () => {
    expect(resolve({
      records: [record({ date: '2026-08-03' })],
      photosByRecordId: { 'record-1': [photo('after_wash')] },
    })).toMatchObject({ kind: 'discover_styles' })

    expect(resolve({
      records: [record({ date: '2026-07-27' })],
      photosByRecordId: { 'record-1': [photo('day_7')] },
    })).toMatchObject({ kind: 'discover_styles' })
  })

  test('offers plain-language starting points only when no active task needs attention', () => {
    expect(resolveHomeEntrances({ profile: null, hasRepeatableStyle: false, hasActivePlan: false }))
      .toEqual([])

    expect(resolveHomeEntrances({ profile, hasRepeatableStyle: false, hasActivePlan: false }))
      .toEqual([
        { kind: 'choose', label: '帮我选', hint: '我还不知道剪什么', to: '/archive/plans/new?intent=choose' },
        { kind: 'reference', label: '我有参考图', hint: '从一张喜欢的图开始', to: '/styles/references/new?intent=plan' },
      ])

    expect(resolveHomeEntrances({ profile, hasRepeatableStyle: true, hasActivePlan: false }))
      .toEqual([
        { kind: 'choose', label: '帮我选', hint: '我还不知道剪什么', to: '/archive/plans/new?intent=choose' },
        { kind: 'reference', label: '我有参考图', hint: '从一张喜欢的图开始', to: '/styles/references/new?intent=plan' },
        { kind: 'repeat', label: '照上次剪', hint: '沿用满意的版本', to: '/archive/plans/new?intent=repeat' },
      ])

    expect(resolveHomeEntrances({ profile, hasRepeatableStyle: true, hasActivePlan: true }))
      .toEqual([])
  })
})
