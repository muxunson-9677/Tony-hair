import type { HaircutRecord } from './types'

type RecordOutcome = HaircutRecord['outcome']

// 归因反馈只存在内存里：刷新即消失，保证“只在刚保存后的导航中出现一次”。
let pending: { recordId: string, outcome: RecordOutcome } | null = null

const attributionMessages: Record<RecordOutcome, string> = {
  repeat: 'Tony 记住了：这次的成功剪法已存档，下次一句话复刻。',
  adjust: 'Tony 记住了：下次会带上你刚写的调整。',
  avoid: '这次的雷 Tony 记住了，下次替你挡。',
}

export const setPendingRecordAttribution = (recordId: string, outcome: RecordOutcome) => {
  pending = { recordId, outcome }
}

export const consumePendingRecordAttribution = (recordId: string): string | null => {
  if (!pending || pending.recordId !== recordId) {
    return null
  }
  const message = attributionMessages[pending.outcome]
  pending = null
  return message
}

export const clearPendingRecordAttribution = () => {
  pending = null
}
