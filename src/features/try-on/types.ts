export type DemoImageSource = 'demo_ai'
export type GenderPresentation = 'feminine' | 'masculine' | 'androgynous'

export interface HairstyleOption {
  readonly id: string
  readonly name: string
  readonly length: 'short'
  readonly image: string
  readonly imageAlt: string
  readonly source: DemoImageSource
  readonly reason: string
  readonly feasibility: string
  readonly maintenance: string
  readonly barberConfirmation: '需理发师现场确认'
}

export interface DemoPersona {
  readonly id: string
  readonly name: string
  readonly age: number
  readonly isAdult: true
  readonly isFictional: true
  readonly ethnicity: 'east_asian'
  readonly genderPresentation: GenderPresentation
  readonly genderPresentationLabel: string
  readonly hairTexture: string
  readonly baseImage: string
  readonly baseAlt: string
  readonly options: readonly [HairstyleOption, HairstyleOption]
}

export interface ImageProvider {
  getPersonas(): readonly DemoPersona[]
}
