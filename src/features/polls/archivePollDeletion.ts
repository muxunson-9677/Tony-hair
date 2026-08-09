import type { PollDraft } from './types'

export const blocksArchiveDeletion = ({ status }: PollDraft) => (
  status === 'creating' || status === 'active' || status === 'revoking'
)

export const isLocalPollDraft = ({ status }: PollDraft) => (
  status === 'draft' || status === 'uploading'
)

export const pollDraftRecoveryPath = (draft: PollDraft) => (
  draft.pollId
    ? `/polls/${encodeURIComponent(draft.pollId)}/manage`
    : `/archive/plans/${encodeURIComponent(draft.planId)}/poll/new`
)
