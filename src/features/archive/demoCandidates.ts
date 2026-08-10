import { curatedHairstyles } from '../hairstyle-library/curatedCatalog'
import type { CuratedHairstyle } from '../hairstyle-library/types'

export interface ArchiveDemoCandidate {
  readonly catalogId: string
  readonly key: string
  readonly personaName: string
  readonly name: string
  readonly notes: string
  readonly image: string
  readonly imageAlt: string
}

const personaNames: Readonly<Record<CuratedHairstyle['demoPersonaId'], string>> = {
  lin: '林澄',
  qiao: '乔衡',
  ran: '冉青',
}

export const archiveDemoCandidates: readonly ArchiveDemoCandidate[] = curatedHairstyles
  .filter((style) => style.status === 'active')
  .map((style) => ({
    catalogId: style.id,
    key: style.demoPersonaId + ':' + style.demoOptionId,
    personaName: personaNames[style.demoPersonaId],
    name: style.name,
    notes: style.reason + ' ' + style.feasibility,
    image: style.coverImage,
    imageAlt: style.imageAlt,
  }))
