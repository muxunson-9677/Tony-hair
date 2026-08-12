import type { PlanMemoryItem } from './types'

export interface BriefListDefaults {
  readonly topPriorities: string[]
  readonly absoluteAvoids: string[]
}

const dedupeTrimmed = (texts: readonly string[]): string[] => {
  const seen = new Set<string>()
  const result: string[] = []
  for (const text of texts) {
    const normalized = text.trim()
    if (!normalized || seen.has(normalized)) {
      continue
    }
    seen.add(normalized)
    result.push(normalized)
  }
  return result
}

export interface BriefListDefaultsInput {
  readonly planMemoryItems: readonly PlanMemoryItem[]
  readonly guideTopPriorities: readonly string[]
  readonly guideAbsoluteAvoids: readonly string[]
  readonly activeAvoidTexts: readonly string[]
}

/**
 * 新 Tony卡的“最在意/绝对不要”默认值。
 * 有记忆快照的计划只用计划确认保留的记忆（修订 1：无快照旧计划
 * 兜底回全局活动避雷合并，行为与升级前一致）。
 */
export const buildBriefListDefaults = (
  input: BriefListDefaultsInput,
): BriefListDefaults => {
  const sorted = [...input.planMemoryItems].sort((left, right) => left.order - right.order)
  const hasSnapshot = sorted.length > 0
  const keepTexts = sorted
    .filter(({ kind }) => kind !== 'avoid')
    .map(({ text }) => text)
  const avoidTexts = sorted
    .filter(({ kind }) => kind === 'avoid')
    .map(({ text }) => text)

  const topPriorities = hasSnapshot
    ? dedupeTrimmed([...keepTexts, ...input.guideTopPriorities]).slice(0, 3)
    : dedupeTrimmed(input.guideTopPriorities).slice(0, 3)

  const absoluteAvoids = hasSnapshot
    ? dedupeTrimmed([...avoidTexts, ...input.guideAbsoluteAvoids]).slice(0, 3)
    : dedupeTrimmed([...input.guideAbsoluteAvoids, ...input.activeAvoidTexts]).slice(0, 3)

  return { topPriorities, absoluteAvoids }
}
