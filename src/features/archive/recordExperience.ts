import type { HaircutPhoto } from './types'

export const editableRecordPhotoStages = [
  { stage: 'before', label: '剪前' },
  { stage: 'after', label: '剪后' },
] as const satisfies readonly { stage: HaircutPhoto['stage'], label: string }[]

export const initialRecordDecision = () => ({
  satisfaction: '',
  outcome: '',
} as const)
