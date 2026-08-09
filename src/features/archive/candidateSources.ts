import type { Candidate, HaircutPhoto } from './types'

type DigestBytes = (bytes: ArrayBuffer) => Promise<ArrayBuffer>

const digestSha256: DigestBytes = async (bytes) => {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return digest.slice(0)
}

export const createLocalReferenceId = async (
  blob: Blob,
  digest: DigestBytes = digestSha256,
) => {
  const bytes = new Uint8Array(await digest(await blob.arrayBuffer()))
  const fingerprint = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `local-${fingerprint}`
}

export const nextUserReferenceName = (existingNames: readonly string[]) => {
  const used = new Set(existingNames.flatMap((name) => {
    const match = /^我的参考图 (\d+)$/.exec(name)
    return match?.[1] ? [Number(match[1])] : []
  }))
  let next = 1
  while (used.has(next)) {
    next += 1
  }
  return `我的参考图 ${next}`
}

type CandidateSourcePointer = Pick<
  Candidate,
  'source' | 'referenceId' | 'demoImagePath' | 'pastRecordId'
>

type PreparedReferenceCandidate = Pick<
  Candidate,
  | 'referenceImage'
  | 'referenceImageWidth'
  | 'referenceImageHeight'
  | 'referenceImageBytes'
  | 'referenceImageProcessedAt'
>

const PREPARED_REFERENCE_TYPES = new Set(['image/webp', 'image/jpeg'])
const MAX_REFERENCE_BYTES = 1_500_000
const MAX_REFERENCE_LONG_EDGE = 1920
const CURRENT_CANDIDATE_KEYS = new Set<keyof Candidate>([
  'id',
  'planId',
  'order',
  'name',
  'notes',
  'source',
  'referenceId',
  'demoImagePath',
  'pastRecordId',
  'referenceImage',
  'referenceImageWidth',
  'referenceImageHeight',
  'referenceImageBytes',
  'referenceImageProcessedAt',
])

export const meetsPreparedReferenceContract = (candidate: PreparedReferenceCandidate) => Boolean(
  candidate.referenceImage
  && PREPARED_REFERENCE_TYPES.has(candidate.referenceImage.type)
  && candidate.referenceImage.size >= 1
  && candidate.referenceImage.size <= MAX_REFERENCE_BYTES
  && Number.isInteger(candidate.referenceImageWidth)
  && (candidate.referenceImageWidth ?? 0) > 0
  && (candidate.referenceImageWidth ?? 0) <= MAX_REFERENCE_LONG_EDGE
  && Number.isInteger(candidate.referenceImageHeight)
  && (candidate.referenceImageHeight ?? 0) > 0
  && (candidate.referenceImageHeight ?? 0) <= MAX_REFERENCE_LONG_EDGE
  && candidate.referenceImageBytes === candidate.referenceImage.size
  && candidate.referenceImageProcessedAt
  && !Number.isNaN(Date.parse(candidate.referenceImageProcessedAt)),
)

export const candidateSourceKey = (candidate: CandidateSourcePointer) => {
  if (candidate.source === 'user_reference') {
    return candidate.referenceId ? `user_reference:${candidate.referenceId}` : null
  }
  if (candidate.source === 'past_record') {
    return candidate.pastRecordId ? `past_record:${candidate.pastRecordId}` : null
  }
  return candidate.demoImagePath ? `demo_ai:${candidate.demoImagePath}` : null
}

export const isSafelyEditableCandidate = (
  candidate: Candidate,
  knownDemoPaths: ReadonlySet<string>,
) => {
  if (Object.keys(candidate).some((key) => !CURRENT_CANDIDATE_KEYS.has(key as keyof Candidate))) {
    return false
  }
  switch (candidate.source) {
    case 'demo_ai':
      return Boolean(
        candidate.demoImagePath
        && knownDemoPaths.has(candidate.demoImagePath)
        && !candidate.pastRecordId
        && !candidate.referenceId
        && candidate.referenceImage === undefined
        && candidate.referenceImageWidth === undefined
        && candidate.referenceImageHeight === undefined
        && candidate.referenceImageBytes === undefined
        && candidate.referenceImageProcessedAt === undefined,
      )
    case 'past_record':
      return Boolean(
        candidate.pastRecordId
        && candidate.referenceImage?.size
        && !candidate.demoImagePath
        && !candidate.referenceId,
      )
    case 'user_reference':
      return Boolean(
        candidate.referenceId
        && !candidate.demoImagePath
        && !candidate.pastRecordId
        && meetsPreparedReferenceContract(candidate),
      )
    default:
      return false
  }
}

export const resolveCandidateImageBlob = (
  candidate: Pick<Candidate, 'source' | 'referenceImage' | 'pastRecordId'>,
  photosByRecordId: Readonly<Record<string, readonly HaircutPhoto[]>>,
) => candidate.source === 'demo_ai'
  ? undefined
  : candidate.referenceImage
    ?? (candidate.pastRecordId ? photosByRecordId[candidate.pastRecordId]?.[0]?.image : undefined)

const PAST_RECORD_STAGE_PRIORITY = new Map<HaircutPhoto['stage'], number>([
  ['styled', 0],
  ['unstyled', 1],
  ['after_wash', 2],
  ['day_7', 3],
  ['during', 4],
  ['before', 5],
])

export const selectPastRecordReferencePhoto = (photos: readonly HaircutPhoto[]) => (
  [...photos].sort((left, right) => (
    (PAST_RECORD_STAGE_PRIORITY.get(left.stage) ?? 99)
    - (PAST_RECORD_STAGE_PRIORITY.get(right.stage) ?? 99)
    || left.capturedAt.localeCompare(right.capturedAt)
  ))[0]
)
