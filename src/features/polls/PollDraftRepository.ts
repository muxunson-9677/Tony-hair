import Dexie, { type DexieOptions, type Table } from 'dexie'

import type { MaskExportResult } from '../privacy/types'
import type { PollCandidateSeed, PollDraft, UploadedMaskedAsset } from './types'

export class PollDraftDb extends Dexie {
  drafts!: Table<PollDraft, string>

  constructor(name = 'zajianfa-poll-drafts', options?: DexieOptions) {
    super(name, options)
    this.version(1).stores({ drafts: 'id, &planId, pollId, status, updatedAt' })
    this.drafts = this.table('drafts')
  }
}

const randomBase64Url = (bytes: number) => {
  const value = new Uint8Array(bytes)
  crypto.getRandomValues(value)
  let binary = ''
  value.forEach((item) => { binary += String.fromCharCode(item) })
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')
}

const defaultDependencies = {
  now: () => new Date().toISOString(),
  randomToken: randomBase64Url,
}

export class PollDraftCandidatesChangedError extends Error {
  readonly name = 'PollDraftCandidatesChangedError'

  constructor(readonly draftStatus: PollDraft['status']) {
    super('计划候选已变化，需要确认后重新开始投票草稿')
  }
}

export class PollDraftRepository {
  constructor(
    private readonly db = new PollDraftDb(),
    private readonly dependencies: {
      now: () => string
      randomToken: (bytes: number) => string
    } = defaultDependencies,
  ) {}

  async createDraft(
    input: { planId: string; title: string },
    candidates: readonly PollCandidateSeed[],
  ): Promise<PollDraft> {
    this.assertCandidateCount(candidates)
    return this.db.transaction('rw', this.db.drafts, async () => {
      const existing = await this.db.drafts.where('planId').equals(input.planId).first()
      if (existing && existing.status !== 'revoked') {
        if (existing.status === 'active' || this.candidatesMatch(existing, candidates)) return existing
        throw new PollDraftCandidatesChangedError(existing.status)
      }
      const draft = this.newDraft(input, candidates)
      await this.db.drafts.put(draft)
      return draft
    })
  }

  async restartDraft(
    input: { planId: string; title: string },
    candidates: readonly PollCandidateSeed[],
  ): Promise<PollDraft> {
    this.assertCandidateCount(candidates)
    return this.db.transaction('rw', this.db.drafts, async () => {
      const existing = await this.db.drafts.where('planId').equals(input.planId).first()
      if (existing?.status === 'active') throw new Error('Active polls must be revoked before restart')
      if (existing?.status === 'creating') throw new Error('Creating polls must be reconciled before restart')
      const draft = this.newDraft(input, candidates)
      await this.db.drafts.put(draft)
      return draft
    })
  }

  async get(id: string): Promise<PollDraft | undefined> {
    return this.db.drafts.get(id)
  }

  async getByPlanId(planId: string): Promise<PollDraft | undefined> {
    return this.db.drafts.where('planId').equals(planId).first()
  }

  async getByPollId(pollId: string): Promise<PollDraft | undefined> {
    return this.db.drafts.where('pollId').equals(pollId).first()
  }

  async saveMaskedImage(
    draftId: string,
    candidateId: string,
    result: MaskExportResult,
  ): Promise<PollDraft> {
    return this.updateDraft(draftId, (draft) => ({
      ...draft,
      status: 'draft',
      options: draft.options.map((option) => option.candidateId === candidateId ? {
        ...option,
        uploadStatus: 'masked',
        maskedImage: result.blob,
        maskedMimeType: result.mimeType,
        maskedWidth: result.width,
        maskedHeight: result.height,
        maskedBytes: result.bytes,
        maskedAt: result.processedAt,
        assetId: undefined,
        imageUrl: undefined,
        errorCode: undefined,
      } : option),
    }))
  }

  async saveUploadedAsset(
    draftId: string,
    candidateId: string,
    asset: UploadedMaskedAsset,
  ): Promise<PollDraft> {
    return this.updateDraft(draftId, (draft) => ({
      ...draft,
      status: 'uploading',
      options: draft.options.map((option) => option.candidateId === candidateId ? {
        ...option,
        uploadStatus: 'uploaded',
        assetId: asset.assetId,
        imageUrl: asset.imageUrl,
        errorCode: undefined,
      } : option),
    }))
  }

  async markOptionUploading(draftId: string, candidateId: string): Promise<PollDraft> {
    return this.updateDraft(draftId, (draft) => ({
      ...draft,
      status: 'uploading',
      options: draft.options.map((option) => option.candidateId === candidateId ? {
        ...option,
        uploadStatus: 'uploading',
        errorCode: undefined,
      } : option),
    }))
  }

  async markOptionFailed(draftId: string, candidateId: string, errorCode: string): Promise<PollDraft> {
    return this.updateDraft(draftId, (draft) => ({
      ...draft,
      status: 'uploading',
      options: draft.options.map((option) => option.candidateId === candidateId ? {
        ...option,
        uploadStatus: 'failed',
        errorCode,
      } : option),
    }))
  }

  async markCreating(draftId: string): Promise<PollDraft> {
    return this.updateDraft(draftId, (draft) => ({ ...draft, status: 'creating' }))
  }

  async markActive(draftId: string, pollId: string, expiresAt: string): Promise<PollDraft> {
    return this.updateDraft(draftId, (draft) => ({
      ...draft,
      status: 'active',
      pollId,
      expiresAt,
      options: draft.options.map(this.withoutMaskedImage),
    }))
  }

  async markRevoked(draftId: string): Promise<PollDraft> {
    return this.updateDraft(draftId, (draft) => ({
      ...draft,
      status: 'revoked',
      managementToken: undefined,
      options: draft.options.map(this.withoutMaskedImage),
    }))
  }

  private readonly withoutMaskedImage = (option: PollDraft['options'][number]) => ({
    ...option,
    maskedImage: undefined,
    maskedMimeType: undefined,
    maskedWidth: undefined,
    maskedHeight: undefined,
    maskedBytes: undefined,
    maskedAt: undefined,
  })

  private assertCandidateCount(candidates: readonly PollCandidateSeed[]) {
    if (candidates.length < 2 || candidates.length > 4) {
      throw new RangeError('A poll draft must contain between 2 and 4 candidates')
    }
  }

  private candidatesMatch(draft: PollDraft, candidates: readonly PollCandidateSeed[]) {
    return draft.options.length === candidates.length && draft.options.every((option, index) => {
      const candidate = candidates[index]
      return option.candidateId === candidate?.candidateId
        && option.label === candidate.label
        && option.disclosure === candidate.disclosure
    })
  }

  private newDraft(
    input: { planId: string; title: string },
    candidates: readonly PollCandidateSeed[],
  ): PollDraft {
    const timestamp = this.dependencies.now()
    return {
      id: `poll-draft:${input.planId}`,
      planId: input.planId,
      title: input.title.trim(),
      managementToken: this.dependencies.randomToken(32),
      clientRequestId: this.dependencies.randomToken(18),
      status: 'draft',
      options: candidates.map((candidate) => ({
        ...candidate,
        uploadId: this.dependencies.randomToken(18),
        uploadStatus: 'pending',
      })),
      createdAt: timestamp,
      updatedAt: timestamp,
    }
  }

  private async updateDraft(
    draftId: string,
    update: (draft: PollDraft) => PollDraft,
  ): Promise<PollDraft> {
    return this.db.transaction('rw', this.db.drafts, async () => {
      const current = await this.db.drafts.get(draftId)
      if (!current) throw new Error(`Poll draft not found: ${draftId}`)
      const next = { ...update(current), updatedAt: this.dependencies.now() }
      await this.db.drafts.put(next)
      return next
    })
  }
}
