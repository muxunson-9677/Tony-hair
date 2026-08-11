import type { HairProfile } from '../archive/types'
import { STYLE_GOAL_LABELS } from './curatedCatalog'
import type { CuratedHairstyle, StyleGoal } from './types'

export type GuidedGoal = 'easy' | 'length' | 'change'
export type GuidedChangeAppetite = 'safe' | 'balanced' | 'bold'
export type GuidedDirectionRole = 'safe' | 'goal' | 'try'

export interface GuidedDirectionAnswers {
  readonly goal: GuidedGoal
  readonly stylingBudget: 3 | 5 | 8 | 12
  readonly changeAppetite: GuidedChangeAppetite
}

export interface GuidedDirectionRecommendation {
  readonly role: GuidedDirectionRole
  readonly roleLabel: string
  readonly style: CuratedHairstyle
  readonly reason: string
  readonly dailyCost: string
  readonly risk: string
}

interface RecommendGuidedDirectionsInput {
  readonly profile: HairProfile
  readonly answers: GuidedDirectionAnswers
  readonly catalog: readonly CuratedHairstyle[]
}

const roleLabels: Readonly<Record<GuidedDirectionRole, string>> = {
  safe: '最稳妥',
  goal: '最符合目标',
  try: '最值得尝试',
}

const goalMap: Readonly<Partial<Record<GuidedGoal, StyleGoal>>> = {
  easy: 'low_maintenance',
  length: 'keep_sides_longer',
}

const knownMatchScore = <T>(value: T, unknown: T, accepted: readonly T[]) => {
  if (value === unknown) return 0
  return accepted.includes(value) ? 4 : -4
}

const profileScore = (style: CuratedHairstyle, profile: HairProfile) => (
  knownMatchScore(profile.hairTexture, 'unsure', style.hairTextures)
  + knownMatchScore(profile.strandThickness, 'unsure', style.strandThicknesses)
  + knownMatchScore(profile.density, 'unsure', style.densities)
  + (
    profile.presentationPreference === 'unspecified'
      ? 0
      : profile.presentationPreference === style.genderPresentation ? 4 : 0
  )
)

const timeScore = (style: CuratedHairstyle, budget: number) => (
  style.stylingMinutes <= budget
    ? 6 + Math.min(3, budget - style.stylingMinutes)
    : -(style.stylingMinutes - budget) * 3
)

const goalScore = (style: CuratedHairstyle, goal: GuidedGoal) => {
  if (goal === 'change') return style.length === 'very_short' ? 12 : style.length === 'short' ? 6 : 1
  const mappedGoal = goalMap[goal]
  return mappedGoal && style.goals.includes(mappedGoal) ? 14 : 0
}

const changeScore = (
  style: CuratedHairstyle,
  appetite: GuidedChangeAppetite,
) => {
  if (appetite === 'bold') return style.length === 'very_short' ? 18 : style.length === 'short' ? 7 : 0
  if (appetite === 'safe') return style.length === 'jaw_length' ? 9 : style.length === 'short' ? 6 : -2
  return style.length === 'short' ? 8 : 4
}

const scoreForRole = (
  role: GuidedDirectionRole,
  style: CuratedHairstyle,
  profile: HairProfile,
  answers: GuidedDirectionAnswers,
) => {
  const base = profileScore(style, profile)
  if (role === 'safe') {
    return base * 2 + timeScore(style, answers.stylingBudget) * 2 + changeScore(style, 'safe')
  }
  if (role === 'goal') {
    return base + timeScore(style, answers.stylingBudget) + goalScore(style, answers.goal) * 2
  }
  return base + timeScore(style, answers.stylingBudget) + goalScore(style, answers.goal) + changeScore(style, answers.changeAppetite) * 2
}

const knownProfileMatches = (style: CuratedHairstyle, profile: HairProfile) => [
  profile.hairTexture !== 'unsure' && style.hairTextures.includes(profile.hairTexture),
  profile.strandThickness !== 'unsure' && style.strandThicknesses.includes(profile.strandThickness),
  profile.density !== 'unsure' && style.densities.includes(profile.density),
  profile.presentationPreference !== 'unspecified'
    && profile.presentationPreference === style.genderPresentation,
].filter(Boolean).length

const reasonFor = (
  role: GuidedDirectionRole,
  style: CuratedHairstyle,
  profile: HairProfile,
  answers: GuidedDirectionAnswers,
) => {
  if (role === 'safe') {
    const matches = knownProfileMatches(style, profile)
    return matches > 0
      ? `已知资料中有 ${matches} 项与这个方向相符，并优先控制日常打理负担。`
      : '资料还不完整，先选日常负担较低、现实限制说明更清楚的方向。'
  }
  if (role === 'goal') {
    if (answers.goal === 'change') return '轮廓变化更明显，同时保留可以和理发师继续校正的空间。'
    const mappedGoal = goalMap[answers.goal]
    return mappedGoal
      ? `这个方向直接回应“${STYLE_GOAL_LABELS[mappedGoal]}”，并兼顾当前已知条件。`
      : '这个方向最直接回应你这次想解决的问题。'
  }
  return answers.changeAppetite === 'bold'
    ? '在保留现实说明的前提下，提供一个轮廓变化更明显的尝试。'
    : '和前两个方向保持差异，帮助你判断自己真正更喜欢哪种轮廓。'
}

export const recommendGuidedDirections = ({
  profile,
  answers,
  catalog,
}: RecommendGuidedDirectionsInput): readonly GuidedDirectionRecommendation[] => {
  const active = catalog.filter(({ status }) => status === 'active')
  const used = new Set<string>()

  return (['safe', 'goal', 'try'] as const).flatMap((role) => {
    const style = active
      .filter(({ id }) => !used.has(id))
      .map((candidate) => ({
        candidate,
        score: scoreForRole(role, candidate, profile, answers),
      }))
      .sort((left, right) => (
        right.score - left.score || left.candidate.id.localeCompare(right.candidate.id)
      ))[0]?.candidate

    if (!style) return []
    used.add(style.id)
    return [{
      role,
      roleLabel: roleLabels[role],
      style,
      reason: reasonFor(role, style, profile, answers),
      dailyCost: `每天约 ${style.stylingMinutes} 分钟 · ${style.maintenanceSummary}`,
      risk: style.tradeoffs[0] ?? '这款方向仍需理发师结合现场头型确认。',
    }]
  })
}
