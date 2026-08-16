import type { Candidate, HaircutPhoto } from '../archive/types'
import { resolveCandidateImageBlob } from '../archive/candidateSources'
import type { PollCandidateSeed } from './types'

export const buildPollCandidateSeeds = (candidates: readonly Candidate[]): PollCandidateSeed[] => (
  candidates.map((candidate) => ({
    candidateId: candidate.id,
    label: candidate.name.trim(),
    disclosure: candidate.source === 'demo_ai' ? 'demo' : 'reference',
  }))
)

export const loadPollCandidateBlob = async (
  candidate: Candidate,
  photosByRecordId: Readonly<Record<string, readonly HaircutPhoto[]>>,
  fetchImpl: typeof fetch = fetch,
): Promise<Blob> => {
  const local = resolveCandidateImageBlob(candidate, photosByRecordId)
  if (local) return local

  if (!candidate.demoImagePath?.startsWith('/demo/')) {
    throw new Error('候选图片读取失败')
  }
  let response: Response
  try {
    response = await fetchImpl(candidate.demoImagePath, { credentials: 'same-origin' })
  } catch {
    throw new Error('候选图片读取失败')
  }
  if (!response.ok) throw new Error('候选图片读取失败')
  const blob = await response.blob()
  if (blob.size === 0) throw new Error('候选图片读取失败')
  return blob
}
