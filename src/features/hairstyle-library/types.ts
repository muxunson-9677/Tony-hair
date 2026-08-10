import type { HairDensity, HairTexture, StrandThickness } from '../archive/types'

export type StyleGoal =
  | 'low_maintenance'
  | 'no_perm_or_dye'
  | 'soften_hairline'
  | 'keep_sides_longer'
  | 'glasses_friendly'
  | 'commute_ready'
  | 'grow_out_gracefully'

export type MaintenanceLevel = 'low' | 'medium' | 'high'

export interface CuratedHairstyle {
  readonly id: string
  readonly status: 'active' | 'retired'
  readonly demoPersonaId: 'lin' | 'qiao' | 'ran'
  readonly demoOptionId: string
  readonly name: string
  readonly aliases: readonly string[]
  readonly coverImage: string
  readonly imageAlt: string
  readonly assetSource: 'project_generated_ai'
  readonly disclosure: string
  readonly genderPresentation: 'feminine' | 'masculine' | 'androgynous'
  readonly length: 'very_short' | 'short' | 'jaw_length'
  readonly hairTextures: readonly HairTexture[]
  readonly strandThicknesses: readonly StrandThickness[]
  readonly densities: readonly HairDensity[]
  readonly goals: readonly StyleGoal[]
  readonly maintenanceLevel: MaintenanceLevel
  readonly maintenanceSummary: string
  readonly stylingMinutes: number
  readonly trimIntervalWeeks: readonly [number, number]
  readonly requiresPerm: boolean
  readonly reason: string
  readonly feasibility: string
  readonly tradeoffs: readonly string[]
  readonly barberGuide: {
    readonly overall: string
    readonly top: string
    readonly fringe: string
    readonly sides: string
    readonly sideburns: string
    readonly back: string
    readonly topPriorities: readonly string[]
    readonly absoluteAvoids: readonly string[]
  }
}

export interface CuratedCatalogFilters {
  readonly query?: string
  readonly goals?: readonly StyleGoal[]
  readonly maintenanceLevels?: readonly MaintenanceLevel[]
  readonly hairTextures?: readonly HairTexture[]
}
