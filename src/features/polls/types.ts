import type { MaskExportResult } from '../privacy/types'

export type PollDisclosure = 'demo' | 'reference'
export type PollDraftStatus = 'draft' | 'uploading' | 'creating' | 'active' | 'revoking' | 'revoked'
export type PollUploadStatus = 'pending' | 'masked' | 'uploading' | 'uploaded' | 'failed'

export interface PollCandidateSeed {
  readonly candidateId: string
  readonly label: string
  readonly disclosure: PollDisclosure
}

export interface PollDraftOption extends PollCandidateSeed {
  readonly uploadId: string
  readonly uploadStatus: PollUploadStatus
  readonly maskedImage?: Blob
  readonly maskedMimeType?: MaskExportResult['mimeType']
  readonly maskedWidth?: number
  readonly maskedHeight?: number
  readonly maskedBytes?: number
  readonly maskedAt?: string
  readonly assetId?: string
  readonly imageUrl?: string
  readonly errorCode?: string
}

export interface PollDraft {
  readonly id: string
  readonly planId: string
  readonly title: string
  readonly clientRequestId: string
  readonly managementToken: string
  readonly status: PollDraftStatus
  readonly options: readonly PollDraftOption[]
  readonly pollId?: string
  readonly expiresAt?: string
  readonly createdAt: string
  readonly updatedAt: string
}

export interface UploadedMaskedAsset {
  readonly assetId: string
  readonly imageUrl: string
}

