export type HairTexture = 'straight' | 'wavy' | 'curly' | 'coily' | 'unsure'
export type StrandThickness = 'fine' | 'medium' | 'coarse' | 'unsure'
export type HairDensity = 'low' | 'medium' | 'high' | 'unsure'
export type WashFrequency =
  | 'daily'
  | 'every_other_day'
  | 'two_to_three_per_week'
  | 'weekly_or_less'
  | 'unsure'

export interface HairProfile {
  readonly id: string
  readonly name: string
  readonly hairTexture: HairTexture
  readonly strandThickness: StrandThickness
  readonly density: HairDensity
  readonly stylingMinutes: number | null
  readonly washFrequency: WashFrequency
  readonly preferenceNotes: string
  readonly createdAt: string
  readonly updatedAt: string
}

export interface HaircutPlan {
  readonly id: string
  readonly profileId: string
  readonly title: string
  readonly date: string
  readonly status: 'draft' | 'ready' | 'completed'
  readonly createdAt: string
  readonly updatedAt: string
}

export interface Candidate {
  readonly id: string
  readonly planId: string
  readonly order: number
  readonly name: string
  readonly notes: string
  readonly source: 'user_reference' | 'past_record' | 'demo_ai'
  readonly demoImagePath?: string
  readonly pastRecordId?: string
  readonly referenceImage?: Blob
}

export interface BarberBrief {
  readonly id: string
  readonly profileId: string
  readonly planId: string
  readonly overall: string
  readonly top: string
  readonly fringe: string
  readonly sides: string
  readonly sideburns: string
  readonly back: string
  readonly topPriorities: readonly string[]
  readonly absoluteAvoids: readonly string[]
}

interface HaircutRecordBase {
  readonly id: string
  readonly profileId: string
  readonly planId: string
  readonly date: string
  readonly status: 'completed'
  readonly satisfaction: 1 | 2 | 3 | 4 | 5
  readonly styleName: string
}

interface RepeatHaircutRecord extends HaircutRecordBase {
  readonly outcome: 'repeat'
  readonly avoidRules?: never
}

interface AvoidHaircutRecord extends HaircutRecordBase {
  readonly outcome: 'avoid'
  readonly avoidRules: readonly string[]
}

export type HaircutRecord = RepeatHaircutRecord | AvoidHaircutRecord

export interface HaircutPhoto {
  readonly id: string
  readonly recordId: string
  readonly stage: 'before' | 'during' | 'unstyled' | 'styled' | 'after_wash' | 'day_7'
  readonly image: Blob
}

export interface AvoidRule {
  readonly id: string
  readonly profileId: string
  readonly recordId: string
  readonly text: string
}

export interface StandardStyle {
  readonly id: string
  readonly profileId: string
  readonly recordId: string
  readonly name: string
}
