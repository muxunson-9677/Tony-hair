import type {
  BarberBrief,
  Candidate,
  HairProfile,
  HaircutPhoto,
  HaircutPlan,
  HaircutRecord,
  StandardStyle,
} from '../archive/types'
import { isValidPlanCandidateCount } from '../archive/types'

export interface HomeActionInput {
  readonly now: Date
  readonly profile: HairProfile | null
  readonly plans: readonly HaircutPlan[]
  readonly candidatesByPlanId: Readonly<Record<string, readonly Candidate[]>>
  readonly briefsByPlanId: Readonly<Record<string, BarberBrief>>
  readonly records: readonly HaircutRecord[]
  readonly photosByRecordId: Readonly<Record<string, readonly HaircutPhoto[]>>
  readonly standardStyles: readonly StandardStyle[]
}

export type HomeAction = {
  readonly kind:
    | 'record_follow_up'
    | 'choose_plan'
    | 'open_ready_brief'
    | 'add_candidates'
    | 'choose_standard'
    | 'choose_primary'
    | 'open_brief'
    | 'continue_plan'
    | 'repeat_standard'
    | 'discover_styles'
    | 'create_profile'
  readonly label: string
  readonly to: string
}

const DAY_MS = 86_400_000

const localDayOrdinal = (date: Date) => (
  Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS
)

const calendarDateOrdinal = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value)
  if (!match) {
    return null
  }
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(year, month - 1, day)
  if (
    date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
  ) {
    return null
  }
  return localDayOrdinal(date)
}

const latestRecord = (records: readonly HaircutRecord[]) => (
  [...records].sort((left, right) => (
    right.date.localeCompare(left.date) || right.updatedAt.localeCompare(left.updatedAt)
  ))[0]
)

const followUpAction = (input: HomeActionInput): HomeAction | null => {
  const record = latestRecord(input.records)
  const recordDay = record ? calendarDateOrdinal(record.date) : null
  if (!record || recordDay === null) {
    return null
  }

  const age = localDayOrdinal(input.now) - recordDay
  const stages = new Set((input.photosByRecordId[record.id] ?? []).map(({ stage }) => stage))
  const needsAfterWash = age >= 1 && age <= 6 && !stages.has('after_wash')
  const needsDaySeven = age >= 7 && age <= 14 && !stages.has('day_7')
  return needsAfterWash || needsDaySeven
    ? {
        kind: 'record_follow_up',
        label: '补一张真实状态',
        to: `/archive/records/${record.id}/edit`,
      }
    : null
}

export const resolveHomeAction = (input: HomeActionInput): HomeAction => {
  if (!input.profile) {
    return {
      kind: 'create_profile',
      label: '建立我的头发档案',
      to: '/archive/profile',
    }
  }

  const followUp = followUpAction(input)
  if (followUp) {
    return followUp
  }

  const activePlans = input.plans
    .filter(({ profileId, status }) => (
      profileId === input.profile?.id && (status === 'draft' || status === 'ready')
    ))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))

  if (activePlans.length > 1) {
    return {
      kind: 'choose_plan',
      label: '选择继续哪个计划',
      to: '/archive',
    }
  }

  const activePlan = activePlans[0]
  if (activePlan) {
    const candidates = input.candidatesByPlanId[activePlan.id] ?? []
    const planDay = calendarDateOrdinal(activePlan.date)
    if (
      activePlan.status === 'ready'
      && planDay !== null
      && planDay <= localDayOrdinal(input.now) + 3
      && (
        activePlan.mode !== 'repeat'
        || isValidPlanCandidateCount(activePlan.mode, candidates.length)
      )
    ) {
      return {
        kind: 'open_ready_brief',
        label: '打开理发师沟通卡',
        to: `/archive/plans/${activePlan.id}/brief`,
      }
    }

    if (activePlan.mode === 'exploration' && candidates.length < 2) {
      return {
        kind: 'add_candidates',
        label: '添加候选',
        to: '/styles',
      }
    }
    if (activePlan.mode === 'repeat' && candidates.length === 0) {
      return {
        kind: 'choose_standard',
        label: '选择标准发型',
        to: `/archive/plans/${activePlan.id}/edit`,
      }
    }

    const hasValidCount = isValidPlanCandidateCount(activePlan.mode, candidates.length)
    if (hasValidCount) {
      return input.briefsByPlanId[activePlan.id]
        ? {
            kind: 'open_brief',
            label: '打开沟通卡',
            to: `/archive/plans/${activePlan.id}/brief`,
          }
        : {
            kind: 'choose_primary',
            label: '确定主方案',
            to: `/archive/plans/${activePlan.id}/brief`,
          }
    }

    return {
      kind: 'continue_plan',
      label: '继续完善计划',
      to: `/archive/plans/${activePlan.id}/edit`,
    }
  }

  if (input.standardStyles.some(({ profileId, active }) => (
    active && profileId === input.profile?.id
  ))) {
    return {
      kind: 'repeat_standard',
      label: '照上次再剪',
      to: '/archive/plans/new',
    }
  }

  return {
    kind: 'discover_styles',
    label: '准备下次理发',
    to: '/styles',
  }
}
