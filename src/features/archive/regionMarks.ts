import type {
  HairRegion,
  HaircutRecord,
  PlanRegionRequest,
  RegionMark,
  RegionMarkIssue,
  RegionRequestDirection,
} from './types'
import type { PlanMemorySuggestion } from './planMemory'

export const REGION_MARK_LIMIT = 5
export const REGION_MARK_NOTE_LIMIT = 160

export const REGION_LABELS: Record<HairRegion, string> = {
  top: '顶部',
  sides: '两侧',
  fringe: '刘海',
  back: '后脑',
  sideburns: '鬓角',
}

export const ISSUE_LABELS: Record<RegionMarkIssue, string> = {
  too_short: '太短',
  too_thin: '太薄',
  wrong_shape: '形状不对',
  harsh_transition: '衔接生硬',
  custom: '自定义',
}

export const DIRECTION_LABELS: Record<RegionRequestDirection, string> = {
  cut_shorter: '剪更短·铲短',
  thin_out: '打薄',
  keep_length: '保留长度',
  keep_volume: '保留厚度',
}

export const HAIR_REGIONS = Object.keys(REGION_LABELS) as readonly HairRegion[]
export const REGION_MARK_ISSUES = Object.keys(ISSUE_LABELS) as readonly RegionMarkIssue[]
export const REGION_REQUEST_DIRECTIONS = Object.keys(DIRECTION_LABELS) as readonly RegionRequestDirection[]

export type RegionMarkDraft = Omit<RegionMark, 'id'> & { readonly id?: string }

export const regionMarkValidationError = (mark: RegionMarkDraft): string | null => {
  if (!(mark.region in REGION_LABELS) || !(mark.issue in ISSUE_LABELS)) {
    return '请选择问题区域和问题类型。'
  }
  if (
    !Number.isFinite(mark.x) || !Number.isFinite(mark.y)
    || mark.x < 0 || mark.x > 1 || mark.y < 0 || mark.y > 1
  ) {
    return '标注位置无效，请重新在照片上点选。'
  }
  const note = mark.note?.trim() ?? ''
  if (mark.issue === 'custom' && !note) {
    return '自定义问题请写一句话说明。'
  }
  if (note.length > REGION_MARK_NOTE_LIMIT) {
    return `说明最多 ${REGION_MARK_NOTE_LIMIT} 字。`
  }
  return null
}

export const regionMarkSummary = (mark: Pick<RegionMark, 'region' | 'issue' | 'note'>) => (
  mark.issue === 'custom'
    ? `${REGION_LABELS[mark.region]} · ${mark.note?.trim() ?? ''}`
    : `${REGION_LABELS[mark.region]} · ${ISSUE_LABELS[mark.issue]}`
)

// 确定性文案模板：区域 × 问题 → 记忆建议文本。不做任何自由文本语义判断。
const suggestionText = (mark: Pick<RegionMark, 'region' | 'issue' | 'note'>) => {
  const region = REGION_LABELS[mark.region]
  switch (mark.issue) {
    case 'too_short':
      return `${region}：上次剪太短，这次保留长度`
    case 'too_thin':
      return `${region}：上次打太薄，这次保留厚度`
    case 'wrong_shape':
      return `${region}：上次形状不对，这次先确认轮廓再动手`
    case 'harsh_transition':
      return `${region}：上次衔接生硬，这次要求过渡自然`
    case 'custom':
      return `${region}：${mark.note?.trim() ?? ''}`
  }
}

const byRecencyDesc = (left: HaircutRecord, right: HaircutRecord) => (
  right.date.localeCompare(left.date) || right.updatedAt.localeCompare(left.updatedAt)
)

const recordRegionMarks = (record: HaircutRecord): readonly RegionMark[] => (
  record.outcome === 'repeat' ? [] : record.regionMarks ?? []
)

export const buildRegionMarkSuggestions = (
  records: readonly HaircutRecord[],
): PlanMemorySuggestion[] => {
  const seen = new Set<string>()
  const suggestions: PlanMemorySuggestion[] = []
  for (const record of [...records].sort(byRecencyDesc)) {
    for (const mark of recordRegionMarks(record)) {
      const dedupeKey = mark.issue === 'custom'
        ? `${mark.region}:custom:${mark.note?.trim() ?? ''}`
        : `${mark.region}:${mark.issue}`
      if (seen.has(dedupeKey)) {
        continue
      }
      seen.add(dedupeKey)
      suggestions.push({
        kind: 'avoid',
        text: suggestionText(mark),
        source: 'region_mark',
        sourceRecordId: record.id,
        sourceRecordDate: record.date.slice(0, 10),
        sourceLabel: record.styleName,
      })
    }
  }
  return suggestions
}

// 冲突白名单：只有这些「问题 × 方向」组合会被判为矛盾，其余一律不判。
const CONFLICT_MATRIX: readonly { issue: RegionMarkIssue, direction: RegionRequestDirection }[] = [
  { issue: 'too_short', direction: 'cut_shorter' },
  { issue: 'too_thin', direction: 'thin_out' },
]

export interface RegionConflict {
  readonly region: HairRegion
  readonly issue: RegionMarkIssue
  readonly direction: RegionRequestDirection
  readonly markRecordId: string
  readonly markRecordDate: string
  readonly markRecordLabel: string
}

export const detectRegionConflicts = (
  regionRequests: readonly PlanRegionRequest[],
  records: readonly HaircutRecord[],
): RegionConflict[] => {
  const conflicts: RegionConflict[] = []
  const sortedRecords = [...records].sort(byRecencyDesc)
  for (const request of regionRequests) {
    const rule = CONFLICT_MATRIX.find(({ direction }) => direction === request.direction)
    if (!rule) {
      continue
    }
    for (const record of sortedRecords) {
      const mark = recordRegionMarks(record).find((candidate) => (
        candidate.region === request.region && candidate.issue === rule.issue
      ))
      if (mark) {
        conflicts.push({
          region: request.region,
          issue: rule.issue,
          direction: request.direction,
          markRecordId: record.id,
          markRecordDate: record.date.slice(0, 10),
          markRecordLabel: record.styleName,
        })
        break
      }
    }
  }
  return conflicts
}

export const describeRegionConflict = (conflict: RegionConflict) => (
  `${REGION_LABELS[conflict.region]}：上次（${conflict.markRecordDate} · ${conflict.markRecordLabel}）`
  + `标了「${ISSUE_LABELS[conflict.issue]}」，这次又要求「${DIRECTION_LABELS[conflict.direction]}」。确定要这样吗？`
)
