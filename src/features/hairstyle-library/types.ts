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

export interface PrivateHairstyleReference {
  readonly id: string
  readonly fingerprint: string
  readonly name: string
  readonly notes: string
  readonly tags: readonly string[]
  readonly focusAreas?: readonly PrivateReferenceFocusArea[]
  readonly image: Blob
  readonly width: number
  readonly height: number
  readonly bytes: number
  readonly processedAt: string
  readonly createdAt: string
  readonly updatedAt: string
}

export type PrivateReferenceRegion = 'fringe' | 'top' | 'sides' | 'back'
export type PrivateReferenceIntent = 'keep' | 'avoid'

export interface PrivateReferenceFocusArea {
  readonly region: PrivateReferenceRegion
  readonly intent: PrivateReferenceIntent
  readonly note: string
}

export type PrivateHairstyleReferenceWrite = Omit<
  PrivateHairstyleReference,
  'id' | 'fingerprint' | 'createdAt' | 'updatedAt'
>

export type PrivateHairstyleReferenceDetailsWrite = Pick<
  PrivateHairstyleReference,
  'name' | 'notes' | 'tags'
> & {
  readonly focusAreas?: readonly PrivateReferenceFocusArea[]
}

export type PrivateHairstyleReferenceImageWrite = Pick<
  PrivateHairstyleReference,
  'image' | 'width' | 'height' | 'bytes' | 'processedAt'
>

export interface FavoriteFolder {
  readonly id: string
  readonly name: string
  readonly createdAt: string
  readonly updatedAt: string
}

export type FavoriteFolderWrite = Pick<FavoriteFolder, 'name'>

export type HairstyleFavoriteItemType = 'curated_style' | 'private_reference'

export interface HairstyleFavoriteTarget {
  readonly itemType: HairstyleFavoriteItemType
  readonly itemId: string
}

export interface HairstyleFavorite extends HairstyleFavoriteTarget {
  readonly id: string
  readonly itemKey: string
  readonly folderId: string | null
  readonly createdAt: string
  readonly updatedAt: string
}
