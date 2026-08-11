import type { CandidateDraft } from '../archive/archiveStore'
import { curatedHairstyles } from './curatedCatalog'
import type {
  CuratedHairstyle,
  HairstyleFavoriteTarget,
  PrivateHairstyleReference,
} from './types'

const REGION_LABELS = {
  fringe: '刘海',
  top: '顶部',
  sides: '两侧',
  back: '后脑',
} as const

export const formatPrivateReferenceNotes = (
  reference: PrivateHairstyleReference,
) => [
  reference.notes.trim(),
  ...(reference.focusAreas ?? []).map((area) => (
    `${REGION_LABELS[area.region]}${area.intent === 'keep' ? '想保留' : '不要照搬'}：${area.note}`
  )),
].filter(Boolean).join('\n')

export interface PrivateReferenceLookup {
  getPrivateReference(id: string): Promise<PrivateHairstyleReference | undefined>
}

const unavailableCatalogStyle = (id: unknown) => new Error(
  `catalog style is unavailable: ${String(id)}`,
)

const unavailablePrivateReference = (id: unknown) => new Error(
  `private reference is unavailable: ${String(id)}`,
)

export const catalogToCandidateDraft = (
  style: CuratedHairstyle,
): CandidateDraft => {
  if (style.status !== 'active') {
    throw unavailableCatalogStyle(style.id)
  }
  return {
    name: style.name,
    notes: `${style.reason} ${style.feasibility}`,
    source: 'demo_ai',
    demoImagePath: style.coverImage,
  }
}

export const privateReferenceToCandidateDraft = (
  reference: PrivateHairstyleReference,
): CandidateDraft => ({
  name: reference.name,
  notes: formatPrivateReferenceNotes(reference),
  source: 'user_reference',
  referenceId: reference.id,
  referenceImage: reference.image,
  referenceImageWidth: reference.width,
  referenceImageHeight: reference.height,
  referenceImageBytes: reference.bytes,
  referenceImageProcessedAt: reference.processedAt,
})

export const resolveCatalogCandidateDraft = (
  catalogId: string,
  catalog: readonly CuratedHairstyle[] = curatedHairstyles,
): CandidateDraft => {
  if (typeof catalogId !== 'string' || catalogId.trim() !== catalogId || !catalogId) {
    throw unavailableCatalogStyle(catalogId)
  }
  const style = catalog.find(({ id }) => id === catalogId)
  if (!style || style.status !== 'active') {
    throw unavailableCatalogStyle(catalogId)
  }
  return catalogToCandidateDraft(style)
}

const assertPointer = (pointer: HairstyleFavoriteTarget) => {
  if (
    !pointer
    || typeof pointer !== 'object'
    || !['curated_style', 'private_reference'].includes(pointer.itemType)
  ) {
    throw new Error('hairstyle library pointer type is invalid')
  }
  if (
    typeof pointer.itemId !== 'string'
    || !pointer.itemId
    || pointer.itemId.trim() !== pointer.itemId
  ) {
    throw new Error('hairstyle library pointer id is invalid')
  }
}

export const resolveLibraryCandidateDraft = async (
  pointer: HairstyleFavoriteTarget,
  references: PrivateReferenceLookup,
  catalog: readonly CuratedHairstyle[] = curatedHairstyles,
): Promise<CandidateDraft> => {
  assertPointer(pointer)
  if (pointer.itemType === 'curated_style') {
    return resolveCatalogCandidateDraft(pointer.itemId, catalog)
  }

  const reference = await references.getPrivateReference(pointer.itemId)
  if (!reference) {
    throw unavailablePrivateReference(pointer.itemId)
  }
  return privateReferenceToCandidateDraft(reference)
}
