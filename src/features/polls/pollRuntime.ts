import type { InjectionKey } from 'vue'

import type { MaskExportResult } from '../privacy/types'
import { PollDraftDb, PollDraftRepository } from './PollDraftRepository'
import {
  PollService,
  type CreatedPollResponse,
  type PollResults,
  type PublicPoll,
  type UploadedMaskedResponse,
} from './PollService'
import type { PollCandidateSeed, PollDraft, UploadedMaskedAsset } from './types'

export interface PollDraftRepositoryPort {
  getByPlanId(planId: string): Promise<PollDraft | undefined>
  getByPollId(pollId: string): Promise<PollDraft | undefined>
  createDraft(
    input: { planId: string; title: string },
    candidates: readonly PollCandidateSeed[],
  ): Promise<PollDraft>
  saveMaskedImage(draftId: string, candidateId: string, result: MaskExportResult): Promise<PollDraft>
  markOptionUploading(draftId: string, candidateId: string): Promise<PollDraft>
  markOptionFailed(draftId: string, candidateId: string, errorCode: string): Promise<PollDraft>
  saveUploadedAsset(draftId: string, candidateId: string, asset: UploadedMaskedAsset): Promise<PollDraft>
  markCreating(draftId: string): Promise<PollDraft>
  markActive(draftId: string, pollId: string, expiresAt: string): Promise<PollDraft>
  markRevoked(draftId: string): Promise<PollDraft>
}

export interface PollServicePort {
  verifyAccess(code: string): Promise<{ expiresAt: string }>
  uploadMasked(input: { uploadId: string; image: Blob }): Promise<UploadedMaskedResponse>
  createPoll(draft: PollDraft): Promise<CreatedPollResponse>
  getPoll(pollId: string): Promise<PublicPoll>
  vote(pollId: string, input: { optionId: string | null; comment: string }): Promise<void>
  getResults(pollId: string, managementToken: string): Promise<PollResults>
  revoke(pollId: string, managementToken: string): Promise<void>
}

export const defaultPollDraftRepository = new PollDraftRepository(new PollDraftDb())
export const defaultPollService = new PollService()

export const POLL_DRAFT_REPOSITORY_KEY: InjectionKey<PollDraftRepositoryPort> = Symbol('poll-draft-repository')
export const POLL_SERVICE_KEY: InjectionKey<PollServicePort> = Symbol('poll-service')
