import { curatedHairstyles } from '../hairstyle-library/curatedCatalog'
import type { CuratedHairstyle } from '../hairstyle-library/types'
import type { DemoPersona, ImageProvider } from './types'

const barberConfirmation = '需理发师现场确认' as const

type DemoPersonaBase = Omit<DemoPersona, 'id' | 'options'> & {
  readonly id: CuratedHairstyle['demoPersonaId']
}

const demoPersonaBases: readonly DemoPersonaBase[] = [
  {
    id: 'lin',
    name: '林澄',
    age: 32,
    isAdult: true,
    isFictional: true,
    ethnicity: 'east_asian',
    genderPresentation: 'feminine',
    genderPresentationLabel: '女性化呈现',
    hairTexture: '细软直发',
    baseImage: '/demo/persona-lin-base.webp',
    baseAlt: 'AI 生成的虚构成年人物林澄，女性化呈现、细软直发的基础肖像',
  },
  {
    id: 'qiao',
    name: '乔衡',
    age: 41,
    isAdult: true,
    isFictional: true,
    ethnicity: 'east_asian',
    genderPresentation: 'masculine',
    genderPresentationLabel: '男性化呈现',
    hairTexture: '厚硬直发',
    baseImage: '/demo/persona-qiao-base.webp',
    baseAlt: 'AI 生成的虚构成年人物乔衡，男性化呈现、厚硬直发的基础肖像',
  },
  {
    id: 'ran',
    name: '冉青',
    age: 28,
    isAdult: true,
    isFictional: true,
    ethnicity: 'east_asian',
    genderPresentation: 'androgynous',
    genderPresentationLabel: '中性呈现',
    hairTexture: '自然微卷',
    baseImage: '/demo/persona-ran-base.webp',
    baseAlt: 'AI 生成的虚构成年人物冉青，中性呈现、自然微卷发质的基础肖像',
  },
]

const toHairstyleOption = (style: CuratedHairstyle) => ({
  catalogId: style.id,
  id: style.demoOptionId,
  name: style.name,
  length: 'short' as const,
  image: style.coverImage,
  imageAlt: style.imageAlt,
  source: 'demo_ai' as const,
  reason: style.reason,
  feasibility: style.feasibility,
  maintenance: style.maintenanceSummary,
  barberConfirmation,
})

const optionsForPersona = (
  personaId: CuratedHairstyle['demoPersonaId'],
): DemoPersona['options'] => {
  const options = curatedHairstyles
    .filter((style) => style.status === 'active' && style.demoPersonaId === personaId)
    .map(toHairstyleOption)
  const [first, second] = options
  if (options.length !== 2 || !first || !second) {
    throw new Error('Demo persona ' + personaId + ' must have exactly two active catalog styles.')
  }
  return [first, second]
}

const demoPersonas: readonly DemoPersona[] = demoPersonaBases.map((persona) => ({
  ...persona,
  options: optionsForPersona(persona.id),
}))

export class DemoProvider implements ImageProvider {
  getPersonas(): readonly DemoPersona[] {
    return demoPersonas
  }
}
