import { DemoProvider } from '../try-on/DemoProvider'

export interface ArchiveDemoCandidate {
  readonly key: string
  readonly personaName: string
  readonly name: string
  readonly notes: string
  readonly image: string
  readonly imageAlt: string
}

export const archiveDemoCandidates: readonly ArchiveDemoCandidate[] = new DemoProvider()
  .getPersonas()
  .flatMap((persona) => persona.options.map((option) => ({
    key: `${persona.id}:${option.id}`,
    personaName: persona.name,
    name: option.name,
    notes: `${option.reason} ${option.feasibility}`,
    image: option.image,
    imageAlt: option.imageAlt,
  })))
