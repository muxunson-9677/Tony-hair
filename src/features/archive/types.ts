export type HairTexture = 'straight' | 'wavy' | 'curly' | 'coily' | 'unsure'
export type StrandThickness = 'fine' | 'medium' | 'coarse' | 'unsure'
export type HairDensity = 'low' | 'medium' | 'high' | 'unsure'
export type WashFrequency =
  | 'daily'
  | 'every_other_day'
  | 'two_to_three_per_week'
  | 'weekly_or_less'
  | 'unsure'

export type GenderIdentity = 'woman' | 'man' | 'nonbinary' | 'unspecified'
export type PresentationPreference = 'feminine' | 'masculine' | 'androgynous' | 'unspecified'

export interface HairProfilePhoto {
  readonly id: string
  readonly angle: 'front' | 'side' | 'back'
  readonly image: Blob
  readonly width: number
  readonly height: number
  readonly bytes: number
  readonly processedAt: string
}

export interface HairProfile {
  readonly id: string
  readonly name: string
  readonly genderIdentity?: GenderIdentity
  readonly presentationPreference?: PresentationPreference
  readonly hairTexture: HairTexture
  readonly strandThickness: StrandThickness
  readonly density: HairDensity
  readonly stylingMinutes: number | null
  readonly washFrequency: WashFrequency
  readonly preferenceNotes: string
  readonly profilePhotos?: readonly HairProfilePhoto[]
  readonly createdAt: string
  readonly updatedAt: string
}

export interface HaircutPlan {
  readonly id: string
  readonly profileId: string
  readonly title: string
  readonly date: string
  readonly mode: 'exploration' | 'repeat'
  readonly status: 'draft' | 'ready' | 'completed'
  readonly createdAt: string
  readonly updatedAt: string
}

export const isValidPlanCandidateCount = (
  mode: HaircutPlan['mode'],
  count: number,
) => (
  mode === 'exploration'
    ? count >= 2 && count <= 4
    : mode === 'repeat' && count === 1
)

export interface Candidate {
  readonly id: string
  readonly planId: string
  readonly order: number
  readonly name: string
  readonly notes: string
  readonly source: 'user_reference' | 'past_record' | 'demo_ai'
  readonly referenceId?: string
  readonly demoImagePath?: string
  readonly pastRecordId?: string
  readonly referenceImage?: Blob
  readonly referenceImageWidth?: number
  readonly referenceImageHeight?: number
  readonly referenceImageBytes?: number
  readonly referenceImageProcessedAt?: string
}

export interface BarberBrief {
  readonly id: string
  readonly profileId: string
  readonly planId: string
  readonly targetCandidateId?: string
  readonly backupCandidateId?: string
  readonly overall: string
  readonly top: string
  readonly fringe: string
  readonly sides: string
  readonly sideburns: string
  readonly back: string
  readonly topPriorities: readonly string[]
  readonly absoluteAvoids: readonly string[]
  readonly createdAt: string
  readonly updatedAt: string
}

export type BarberBriefWrite = Omit<BarberBrief, 'targetCandidateId'> & {
  readonly targetCandidateId: string
}

interface HaircutRecordBase {
  readonly id: string
  readonly profileId: string
  readonly planId?: string
  readonly date: string
  readonly status: 'completed'
  readonly satisfaction: 1 | 2 | 3 | 4 | 5
  readonly styleName: string
  readonly salonName?: string
  readonly salonLocation?: string
  readonly barberName?: string
  readonly serviceName?: string
  readonly priceCents?: number
  readonly durationMinutes?: number
  readonly notes?: string
  readonly createdAt: string
  readonly updatedAt: string
}

interface RepeatHaircutRecord extends HaircutRecordBase {
  readonly outcome: 'repeat'
  readonly avoidRules?: never
}

interface AvoidHaircutRecord extends HaircutRecordBase {
  readonly outcome: 'avoid'
  readonly avoidRules: readonly string[]
}

interface AdjustHaircutRecord extends HaircutRecordBase {
  readonly outcome: 'adjust'
  readonly adjustmentNotes: readonly string[]
  readonly avoidRules?: never
}

export type HaircutRecord = RepeatHaircutRecord | AdjustHaircutRecord | AvoidHaircutRecord

export interface HaircutPhoto {
  readonly id: string
  readonly recordId: string
  readonly stage: 'before' | 'after' | 'during' | 'unstyled' | 'styled' | 'after_wash' | 'day_7'
  readonly image: Blob
  readonly capturedAt: string
  readonly width?: number
  readonly height?: number
  readonly bytes?: number
  readonly processedAt?: string
}

export interface AvoidRule {
  readonly id: string
  readonly profileId: string
  readonly recordId: string
  readonly text: string
  readonly createdAt: string
  readonly active: boolean
}

export interface StandardStyle {
  readonly id: string
  readonly profileId: string
  readonly recordId: string
  readonly name: string
  readonly createdAt: string
  readonly active: boolean
}

export interface HaircutRecordBundle {
  readonly record: HaircutRecord
  readonly photos: HaircutPhoto[]
  readonly avoidRules: AvoidRule[]
  readonly standardStyles: StandardStyle[]
}
