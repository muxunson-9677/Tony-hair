export interface HairProfile {
  readonly id: string
  readonly name: string
}

export interface HaircutPlan {
  readonly id: string
  readonly profileId: string
  readonly date: string
  readonly status: 'draft' | 'ready' | 'completed'
}

export interface Candidate {
  readonly id: string
  readonly planId: string
  readonly order: number
  readonly name: string
  readonly source: 'user_reference' | 'past_record' | 'demo_ai'
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
