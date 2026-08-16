import { curatedHairstyles, MAINTENANCE_LEVEL_LABELS } from '../hairstyle-library/curatedCatalog'
import type { Candidate } from './types'

export interface CandidateDecisionSummary {
  readonly feasibility: string
  readonly maintenance: string
  readonly change: string
  readonly risk: string
}

export const resolveCandidateDecisionSummary = (
  candidate: Candidate,
): CandidateDecisionSummary => {
  const catalogStyle = candidate.source === 'demo_ai'
    ? curatedHairstyles.find(({ coverImage }) => coverImage === candidate.demoImagePath)
    : undefined

  if (!catalogStyle) {
    return {
      feasibility: '尚未评估',
      maintenance: candidate.source === 'past_record' ? '沿用真实历史' : '到店前确认',
      change: candidate.source === 'past_record' ? '熟悉、变化较小' : '按你的参考图校正',
      risk: candidate.source === 'past_record'
        ? '先确认这次是否需要微调'
        : '不要把整张图原样照搬',
    }
  }

  return {
    feasibility: catalogStyle.feasibility.replace(/^可剪参考：/u, ''),
    maintenance: `${MAINTENANCE_LEVEL_LABELS[catalogStyle.maintenanceLevel]} · 约 ${catalogStyle.stylingMinutes} 分钟/天`,
    change: catalogStyle.length === 'very_short' ? '变化明显' : catalogStyle.length === 'jaw_length' ? '保留长度' : '中等变化',
    risk: catalogStyle.tradeoffs[0] ?? '尚未评估',
  }
}
