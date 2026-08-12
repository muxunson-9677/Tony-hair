import type {
  AvoidRule,
  BarberBrief,
  HaircutRecord,
  PlanMemoryKind,
  PlanMemorySource,
} from './types'

export const PLAN_MEMORY_GROUP_LIMIT = 3
export const PLAN_MEMORY_TEXT_LIMIT = 160

export interface PlanMemorySuggestion {
  readonly kind: PlanMemoryKind
  readonly text: string
  readonly source: PlanMemorySource
  readonly sourceRecordId: string
  readonly sourceRecordDate: string
  readonly sourceLabel: string
}

export interface PlanMemorySuggestions {
  readonly keep: readonly PlanMemorySuggestion[]
  readonly avoid: readonly PlanMemorySuggestion[]
  readonly overflowAvoids: readonly PlanMemorySuggestion[]
}

export interface PlanMemorySuggestionInput {
  readonly records: readonly HaircutRecord[]
  readonly avoidRules: readonly AvoidRule[]
  readonly briefsByPlanId: Readonly<Record<string, BarberBrief>>
}

const byRecencyDesc = (left: HaircutRecord, right: HaircutRecord) => (
  right.date.localeCompare(left.date) || right.updatedAt.localeCompare(left.updatedAt)
)

const isNewerRecord = (candidate: HaircutRecord, reference: HaircutRecord) => (
  byRecencyDesc(reference, candidate) > 0
)

const dedupeByTrimmedText = (
  suggestions: readonly PlanMemorySuggestion[],
): PlanMemorySuggestion[] => {
  const seen = new Set<string>()
  const result: PlanMemorySuggestion[] = []
  for (const suggestion of suggestions) {
    const normalized = suggestion.text.trim()
    if (!normalized || seen.has(normalized)) {
      continue
    }
    seen.add(normalized)
    result.push({ ...suggestion, text: normalized })
  }
  return result
}

export const buildPlanMemorySuggestions = (
  input: PlanMemorySuggestionInput,
): PlanMemorySuggestions => {
  const sortedRecords = [...input.records].sort(byRecencyDesc)
  const latestRepeat = sortedRecords.find(({ outcome }) => outcome === 'repeat')
  const latestAdjust = sortedRecords.find(({ outcome }) => outcome === 'adjust')

  const successItems: PlanMemorySuggestion[] = []
  if (latestRepeat) {
    const originBrief = latestRepeat.planId
      ? input.briefsByPlanId[latestRepeat.planId]
      : undefined
    const priorities = originBrief?.topPriorities
      .map((item) => item.trim())
      .filter(Boolean) ?? []
    if (priorities.length > 0) {
      successItems.push(...priorities.map((text): PlanMemorySuggestion => ({
        kind: 'success',
        text,
        source: 'brief_priority',
        sourceRecordId: latestRepeat.id,
        sourceRecordDate: latestRepeat.date.slice(0, 10),
        sourceLabel: latestRepeat.styleName,
      })))
    } else {
      successItems.push({
        kind: 'success',
        text: `整体照上次的「${latestRepeat.styleName}」复刻`,
        source: 'repeat_record',
        sourceRecordId: latestRepeat.id,
        sourceRecordDate: latestRepeat.date.slice(0, 10),
        sourceLabel: latestRepeat.styleName,
      })
    }
  }

  // 修订 3：早于最新 repeat 记录的 adjust 笔记视为已被满意结果覆盖，不再带入。
  const adjustmentItems: PlanMemorySuggestion[] = []
  if (
    latestAdjust
    && latestAdjust.outcome === 'adjust'
    && (!latestRepeat || isNewerRecord(latestAdjust, latestRepeat))
  ) {
    adjustmentItems.push(...latestAdjust.adjustmentNotes.map((text): PlanMemorySuggestion => ({
      kind: 'adjustment',
      text,
      source: 'adjustment_note',
      sourceRecordId: latestAdjust.id,
      sourceRecordDate: latestAdjust.date.slice(0, 10),
      sourceLabel: latestAdjust.styleName,
    })))
  }

  // 最近的明确反馈优先：能带入的 adjust 一定晚于 repeat，所以排在前面。
  const keep = dedupeByTrimmedText([...adjustmentItems, ...successItems])
    .slice(0, PLAN_MEMORY_GROUP_LIMIT)

  const recordsById = new Map(sortedRecords.map((record) => [record.id, record]))
  const activeAvoidRules = [...input.avoidRules]
    .filter(({ active }) => active)
    .sort((left, right) => (
      right.createdAt.localeCompare(left.createdAt) || left.id.localeCompare(right.id)
    ))
  const avoidItems = dedupeByTrimmedText(activeAvoidRules.map((rule): PlanMemorySuggestion => {
    const record = recordsById.get(rule.recordId)
    return {
      kind: 'avoid',
      text: rule.text,
      source: 'avoid_rule',
      sourceRecordId: rule.recordId,
      sourceRecordDate: (record?.date ?? rule.createdAt).slice(0, 10),
      sourceLabel: record?.styleName ?? '避雷记录',
    }
  }))

  return {
    keep,
    avoid: avoidItems.slice(0, PLAN_MEMORY_GROUP_LIMIT),
    overflowAvoids: avoidItems.slice(PLAN_MEMORY_GROUP_LIMIT),
  }
}

export const swapAvoidSuggestion = <Item>(
  avoid: readonly Item[],
  overflowAvoids: readonly Item[],
  overflowIndex: number,
  avoidIndex: number,
): { avoid: Item[], overflowAvoids: Item[] } => {
  const incoming = overflowAvoids[overflowIndex]
  const outgoing = avoid[avoidIndex]
  if (incoming === undefined || outgoing === undefined) {
    return { avoid: [...avoid], overflowAvoids: [...overflowAvoids] }
  }
  const nextAvoid = [...avoid]
  nextAvoid[avoidIndex] = incoming
  const nextOverflow = [...overflowAvoids]
  nextOverflow[overflowIndex] = outgoing
  return { avoid: nextAvoid, overflowAvoids: nextOverflow }
}
