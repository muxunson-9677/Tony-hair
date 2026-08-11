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

export interface HomeEntranceInput {
  readonly profile: HairProfile | null
  readonly hasRepeatableStyle: boolean
  readonly hasActivePlan: boolean
}

export interface HomeEntrance {
  readonly kind: 'choose' | 'reference' | 'repeat'
  readonly label: string
  readonly hint: string
  readonly to: string
}

export const resolveHomeEntrances = (input: HomeEntranceInput): readonly HomeEntrance[] => {
  if (!input.profile || input.hasActivePlan) {
    return []
  }

  const entrances: HomeEntrance[] = [
    {
      kind: 'choose',
      label: '帮我选',
      hint: '我还不知道剪什么',
      to: '/archive/plans/new?intent=choose',
    },
    {
      kind: 'reference',
      label: '我有参考图',
      hint: '从一张喜欢的图开始',
      to: '/styles/references/new?intent=plan',
    },
  ]

  if (input.hasRepeatableStyle) {
    entrances.push({
      kind: 'repeat',
      label: '照上次剪',
      hint: '沿用满意的版本',
      to: '/archive/plans/new?intent=repeat',
    })
  }

  return entrances
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

export const resolveHomeAction = (input: HomeActionInput): HomeAction => {
  if (!input.profile) {
    return {
      kind: 'create_profile',
      label: '先认识一下我的头发',
      to: '/archive/profile',
    }
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
      label: '照上次剪',
      to: '/archive/plans/new?intent=repeat',
    }
  }

  return {
    kind: 'discover_styles',
    label: '帮我选',
    to: '/archive/plans/new?intent=choose',
  }
}
