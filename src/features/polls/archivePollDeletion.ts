import type { PollDraft } from './types'

export const shouldDiscardPollDraftOnArchiveDeletion = ({ status }: PollDraft) => (
  status === 'draft' || status === 'uploading' || status === 'revoked'
)
