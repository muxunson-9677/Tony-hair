import Dexie, { type DexieOptions, type Table } from 'dexie'

import type {
  AvoidRule,
  BarberBrief,
  Candidate,
  HairProfile,
  HaircutPhoto,
  HaircutPlan,
  HaircutRecord,
  StandardStyle,
} from './types'

const ARCHIVE_STORES_V1 = {
  profiles: 'id',
  plans: 'id, profileId, date, status',
  candidates: 'id, planId, &[planId+order]',
  briefs: 'id, &planId, profileId',
  records: 'id, profileId, planId, date, status',
  photos: 'id, recordId, stage',
  avoidRules: 'id, profileId, recordId',
  standardStyles: 'id, profileId, recordId',
} as const

const ARCHIVE_STORES_V2 = {
  ...ARCHIVE_STORES_V1,
  profiles: 'id, updatedAt',
  plans: 'id, profileId, date, status, updatedAt',
} as const

export class ZajianfaDb extends Dexie {
  profiles!: Table<HairProfile, string>
  plans!: Table<HaircutPlan, string>
  candidates!: Table<Candidate, string>
  briefs!: Table<BarberBrief, string>
  records!: Table<HaircutRecord, string>
  photos!: Table<HaircutPhoto, string>
  avoidRules!: Table<AvoidRule, string>
  standardStyles!: Table<StandardStyle, string>

  constructor(name = 'zajianfa-archive', options?: DexieOptions) {
    super(name, options)

    this.version(1).stores(ARCHIVE_STORES_V1)
    this.version(2).stores(ARCHIVE_STORES_V2).upgrade(async (transaction) => {
      const migratedAt = new Date().toISOString()

      await transaction.table('profiles').toCollection().modify((profile) => {
        profile.hairTexture ??= 'unsure'
        profile.strandThickness ??= 'unsure'
        profile.density ??= 'unsure'
        profile.stylingMinutes ??= null
        profile.washFrequency ??= 'unsure'
        profile.preferenceNotes ??= ''
        profile.createdAt ??= migratedAt
        profile.updatedAt ??= migratedAt
      })
      await transaction.table('plans').toCollection().modify((plan) => {
        plan.title ??= '未命名计划'
        plan.createdAt ??= migratedAt
        plan.updatedAt ??= migratedAt
      })
    })

    this.profiles = this.table('profiles')
    this.plans = this.table('plans')
    this.candidates = this.table('candidates')
    this.candidates.hook('reading', (candidate) => candidate && ({
      ...candidate,
      notes: candidate.notes ?? '',
    }))
    this.briefs = this.table('briefs')
    this.records = this.table('records')
    this.photos = this.table('photos')
    this.avoidRules = this.table('avoidRules')
    this.standardStyles = this.table('standardStyles')
  }
}

export type ArchiveStorageErrorCode = 'quota_exceeded' | 'unavailable'

export class ArchiveStorageError extends Error {
  readonly code: ArchiveStorageErrorCode
  readonly cause: unknown

  constructor(code: ArchiveStorageErrorCode, cause: unknown) {
    super(
      code === 'quota_exceeded'
        ? 'Local archive storage quota was exceeded'
        : 'Local archive storage is unavailable',
    )
    this.name = 'ArchiveStorageError'
    this.code = code
    this.cause = cause
  }
}

const CANDIDATE_SOURCES = new Set(['user_reference', 'past_record', 'demo_ai'])
const HAIR_TEXTURES = new Set(['straight', 'wavy', 'curly', 'coily', 'unsure'])
const STRAND_THICKNESSES = new Set(['fine', 'medium', 'coarse', 'unsure'])
const HAIR_DENSITIES = new Set(['low', 'medium', 'high', 'unsure'])
const WASH_FREQUENCIES = new Set([
  'daily',
  'every_other_day',
  'two_to_three_per_week',
  'weekly_or_less',
  'unsure',
])
const PHOTO_STAGES = new Set([
  'before',
  'during',
  'unstyled',
  'styled',
  'after_wash',
  'day_7',
])
const UNAVAILABLE_ERROR_NAMES = new Set([
  'DatabaseClosedError',
  'InvalidStateError',
  'MissingAPIError',
  'NotSupportedError',
  'OpenFailedError',
  'SecurityError',
])

const nestedErrors = (error: unknown): unknown[] => {
  if (typeof error !== 'object' || error === null) {
    return []
  }

  const value = error as {
    cause?: unknown
    failures?: unknown
    inner?: unknown
  }
  const failures = Array.isArray(value.failures) ? value.failures : []
  return [value.cause, value.inner, ...failures].filter(Boolean)
}

const hasErrorName = (error: unknown, names: ReadonlySet<string>): boolean => {
  const pending = [error]
  const visited = new Set<unknown>()

  while (pending.length > 0) {
    const current = pending.pop()
    if (visited.has(current)) {
      continue
    }
    visited.add(current)

    if (
      typeof current === 'object'
      && current !== null
      && 'name' in current
      && typeof current.name === 'string'
      && names.has(current.name)
    ) {
      return true
    }
    pending.push(...nestedErrors(current))
  }

  return false
}

const mapStorageError = (error: unknown): never => {
  if (error instanceof ArchiveStorageError) {
    throw error
  }
  if (hasErrorName(error, new Set(['QuotaExceededError']))) {
    throw new ArchiveStorageError('quota_exceeded', error)
  }
  if (hasErrorName(error, UNAVAILABLE_ERROR_NAMES)) {
    throw new ArchiveStorageError('unavailable', error)
  }
  throw error
}

const isDateValue = (value: string) => value.trim().length > 0 && !Number.isNaN(Date.parse(value))

const validateProfile = (profile: HairProfile) => {
  if (profile.name.trim().length === 0) {
    throw new RangeError('profile name must not be empty')
  }
  if (!HAIR_TEXTURES.has(profile.hairTexture)) {
    throw new Error('hair texture is invalid')
  }
  if (!STRAND_THICKNESSES.has(profile.strandThickness)) {
    throw new Error('strand thickness is invalid')
  }
  if (!HAIR_DENSITIES.has(profile.density)) {
    throw new Error('hair density is invalid')
  }
  if (
    profile.stylingMinutes !== null
    && (
      !Number.isInteger(profile.stylingMinutes)
      || profile.stylingMinutes < 0
      || profile.stylingMinutes > 180
    )
  ) {
    throw new RangeError('styling minutes must be null or an integer from 0 to 180')
  }
  if (!WASH_FREQUENCIES.has(profile.washFrequency)) {
    throw new Error('wash frequency is invalid')
  }
  if (!isDateValue(profile.createdAt) || !isDateValue(profile.updatedAt)) {
    throw new RangeError('profile timestamps must be valid dates')
  }
}

const validatePlanCandidates = (
  plan: HaircutPlan,
  candidates: readonly Candidate[],
) => {
  if (candidates.length < 2 || candidates.length > 4) {
    throw new RangeError('A plan must contain between 2 and 4 candidates')
  }
  if (plan.title.trim().length === 0) {
    throw new RangeError('plan title must not be empty')
  }
  if (!isDateValue(plan.date) || !isDateValue(plan.createdAt) || !isDateValue(plan.updatedAt)) {
    throw new RangeError('plan dates must be valid')
  }

  const orders = new Set<number>()
  const ids = new Set<string>()
  const demoImagePaths = new Set<string>()
  const pastRecordIds = new Set<string>()
  for (const candidate of candidates) {
    if (candidate.planId !== plan.id) {
      throw new Error('Every candidate must belong to the saved plan')
    }
    if (!Number.isInteger(candidate.order)) {
      throw new RangeError('candidate order must be an integer')
    }
    if (orders.has(candidate.order)) {
      throw new Error('candidate order must be unique within a plan')
    }
    if (ids.has(candidate.id)) {
      throw new Error('candidate id must be unique within a plan')
    }
    if (!CANDIDATE_SOURCES.has(candidate.source)) {
      throw new Error('candidate source is invalid')
    }
    if (candidate.demoImagePath && candidate.source !== 'demo_ai') {
      throw new Error('demo image path requires a demo candidate')
    }
    if (candidate.pastRecordId && candidate.source !== 'past_record') {
      throw new Error('past record id requires a past-record candidate')
    }
    if (candidate.demoImagePath && demoImagePaths.has(candidate.demoImagePath)) {
      throw new Error('demo candidates must be unique within a plan')
    }
    if (candidate.pastRecordId && pastRecordIds.has(candidate.pastRecordId)) {
      throw new Error('past-record candidates must be unique within a plan')
    }
    orders.add(candidate.order)
    ids.add(candidate.id)
    if (candidate.demoImagePath) {
      demoImagePaths.add(candidate.demoImagePath)
    }
    if (candidate.pastRecordId) {
      pastRecordIds.add(candidate.pastRecordId)
    }
  }
}

const validateBriefItems = (label: string, items: readonly string[]) => {
  if (
    items.length < 1
    || items.length > 3
    || items.some((item) => item.trim().length === 0)
  ) {
    throw new RangeError(`${label} must contain between 1 and 3 non-empty items`)
  }
}

const validateBrief = (brief: BarberBrief) => {
  validateBriefItems('top priorities', brief.topPriorities)
  validateBriefItems('absolute avoids', brief.absoluteAvoids)
}

const validateRecord = (
  record: HaircutRecord,
  photos: readonly HaircutPhoto[],
) => {
  if (
    !Number.isInteger(record.satisfaction)
    || record.satisfaction < 1
    || record.satisfaction > 5
  ) {
    throw new RangeError('satisfaction must be an integer from 1 to 5')
  }
  if (record.outcome !== 'repeat' && record.outcome !== 'avoid') {
    throw new Error('record outcome must be repeat or avoid')
  }
  if (photos.length < 1) {
    throw new RangeError('A record must contain at least one photo')
  }
  if (
    record.outcome === 'avoid'
    && (
      record.avoidRules.length < 1
      || record.avoidRules.length > 3
      || record.avoidRules.some((rule) => rule.trim().length === 0)
    )
  ) {
    throw new RangeError('An avoid outcome must contain between 1 and 3 non-empty rules')
  }

  const photoIds = new Set<string>()
  for (const photo of photos) {
    if (photo.recordId !== record.id) {
      throw new Error('Every photo must belong to the saved record')
    }
    if (photoIds.has(photo.id)) {
      throw new Error('photo id must be unique within a record')
    }
    if (!PHOTO_STAGES.has(photo.stage)) {
      throw new Error('photo stage is invalid')
    }
    photoIds.add(photo.id)
  }
}

export class ArchiveRepository {
  constructor(private readonly db: ZajianfaDb) {}

  private async run<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation()
    } catch (error) {
      return mapStorageError(error)
    }
  }

  createProfile(profile: HairProfile): Promise<string> {
    validateProfile(profile)
    return this.run(() => this.db.profiles.add(profile))
  }

  getProfile(id: string): Promise<HairProfile | undefined> {
    return this.run(() => this.db.profiles.get(id))
  }

  listProfiles(): Promise<HairProfile[]> {
    return this.run(() => this.db.profiles.toArray())
  }

  updateProfile(profile: HairProfile): Promise<string> {
    validateProfile(profile)
    return this.run(async () => {
      if (!(await this.db.profiles.get(profile.id))) {
        throw new Error(`Profile not found: ${profile.id}`)
      }
      await this.db.profiles.put(profile)
      return profile.id
    })
  }

  deleteProfile(profileId: string): Promise<void> {
    return this.run(() => this.db.transaction(
      'rw',
      [
        this.db.profiles,
        this.db.plans,
        this.db.candidates,
        this.db.briefs,
        this.db.records,
        this.db.photos,
        this.db.avoidRules,
        this.db.standardStyles,
      ],
      async () => {
        const plans = await this.db.plans.where('profileId').equals(profileId).toArray()
        const records = await this.db.records.where('profileId').equals(profileId).toArray()

        for (const plan of plans) {
          await this.db.candidates.where('planId').equals(plan.id).delete()
          await this.db.briefs.where('planId').equals(plan.id).delete()
        }
        for (const record of records) {
          await this.db.photos.where('recordId').equals(record.id).delete()
          await this.db.avoidRules.where('recordId').equals(record.id).delete()
          await this.db.standardStyles.where('recordId').equals(record.id).delete()
        }

        await this.db.plans.bulkDelete(plans.map(({ id }) => id))
        await this.db.records.bulkDelete(records.map(({ id }) => id))
        await this.db.briefs.where('profileId').equals(profileId).delete()
        await this.db.avoidRules.where('profileId').equals(profileId).delete()
        await this.db.standardStyles.where('profileId').equals(profileId).delete()
        await this.db.profiles.delete(profileId)
      },
    ))
  }

  async savePlanWithCandidates(
    plan: HaircutPlan,
    candidates: readonly Candidate[],
  ): Promise<{ plan: HaircutPlan, candidates: Candidate[] }> {
    validatePlanCandidates(plan, candidates)
    return this.run(() => this.db.transaction(
      'rw',
      [this.db.profiles, this.db.plans, this.db.candidates],
      async () => {
        if (!(await this.db.profiles.get(plan.profileId))) {
          throw new Error(`Profile not found: ${plan.profileId}`)
        }
        await this.db.plans.put(plan)
        await this.db.candidates.where('planId').equals(plan.id).delete()
        await this.db.candidates.bulkAdd([...candidates])
        return { plan, candidates: [...candidates] }
      },
    ))
  }

  getPlan(id: string): Promise<HaircutPlan | undefined> {
    return this.run(() => this.db.plans.get(id))
  }

  listPlans(profileId: string): Promise<HaircutPlan[]> {
    return this.run(() => this.db.plans.where('profileId').equals(profileId).toArray())
  }

  getCandidate(id: string): Promise<Candidate | undefined> {
    return this.run(() => this.db.candidates.get(id))
  }

  listCandidates(planId: string): Promise<Candidate[]> {
    return this.run(() => this.db.candidates.where('planId').equals(planId).sortBy('order'))
  }

  deletePlan(planId: string): Promise<void> {
    return this.run(() => this.db.transaction(
      'rw',
      [this.db.plans, this.db.candidates, this.db.briefs],
      async () => {
        await this.db.candidates.where('planId').equals(planId).delete()
        await this.db.briefs.where('planId').equals(planId).delete()
        await this.db.plans.delete(planId)
      },
    ))
  }

  async saveBrief(brief: BarberBrief): Promise<BarberBrief> {
    validateBrief(brief)
    return this.run(() => this.db.transaction(
      'rw',
      [this.db.plans, this.db.briefs],
      async () => {
        const plan = await this.db.plans.get(brief.planId)
        if (!plan || plan.profileId !== brief.profileId) {
          throw new Error(`Plan not found for brief: ${brief.planId}`)
        }
        const existingById = await this.db.briefs.get(brief.id)
        if (
          existingById
          && (
            existingById.planId !== brief.planId
            || existingById.profileId !== brief.profileId
          )
        ) {
          throw new Error('Brief id already belongs to another plan')
        }
        const existing = await this.db.briefs.where('planId').equals(brief.planId).first()
        if (existing && existing.id !== brief.id) {
          await this.db.briefs.delete(existing.id)
        }
        await this.db.briefs.put(brief)
        return brief
      },
    ))
  }

  getBrief(planId: string): Promise<BarberBrief | undefined> {
    return this.run(() => this.db.briefs.where('planId').equals(planId).first())
  }

  listBriefs(profileId: string): Promise<BarberBrief[]> {
    return this.run(() => this.db.briefs.where('profileId').equals(profileId).toArray())
  }

  deleteBrief(planId: string): Promise<void> {
    return this.run(async () => {
      await this.db.briefs.where('planId').equals(planId).delete()
    })
  }

  async saveRecordWithPhotos(
    record: HaircutRecord,
    photos: readonly HaircutPhoto[],
  ): Promise<{ record: HaircutRecord, photos: HaircutPhoto[] }> {
    validateRecord(record, photos)
    return this.run(() => this.db.transaction(
      'rw',
      [
        this.db.profiles,
        this.db.records,
        this.db.photos,
        this.db.avoidRules,
        this.db.standardStyles,
      ],
      async () => {
        if (!(await this.db.profiles.get(record.profileId))) {
          throw new Error(`Profile not found: ${record.profileId}`)
        }

        await this.db.records.put(record)
        await this.db.photos.where('recordId').equals(record.id).delete()
        await this.db.avoidRules.where('recordId').equals(record.id).delete()
        await this.db.standardStyles.where('recordId').equals(record.id).delete()
        await this.db.photos.bulkAdd([...photos])

        if (record.outcome === 'repeat') {
          await this.db.standardStyles.add({
            id: `standard-style:${record.id}`,
            profileId: record.profileId,
            recordId: record.id,
            name: record.styleName,
          })
        } else {
          await this.db.avoidRules.bulkAdd(record.avoidRules.map((text, index) => ({
            id: `avoid-rule:${record.id}:${index + 1}`,
            profileId: record.profileId,
            recordId: record.id,
            text,
          })))
        }

        return { record, photos: [...photos] }
      },
    ))
  }

  getRecord(id: string): Promise<HaircutRecord | undefined> {
    return this.run(() => this.db.records.get(id))
  }

  listRecords(profileId: string): Promise<HaircutRecord[]> {
    return this.run(() => this.db.records.where('profileId').equals(profileId).toArray())
  }

  getPhoto(id: string): Promise<HaircutPhoto | undefined> {
    return this.run(() => this.db.photos.get(id))
  }

  listPhotos(recordId: string): Promise<HaircutPhoto[]> {
    return this.run(() => this.db.photos.where('recordId').equals(recordId).toArray())
  }

  listAvoidRules(recordId: string): Promise<AvoidRule[]> {
    return this.run(() => this.db.avoidRules.where('recordId').equals(recordId).sortBy('id'))
  }

  listStandardStyles(recordId: string): Promise<StandardStyle[]> {
    return this.run(() => this.db.standardStyles.where('recordId').equals(recordId).sortBy('id'))
  }

  deleteRecord(recordId: string): Promise<void> {
    return this.run(() => this.db.transaction(
      'rw',
      [this.db.records, this.db.photos, this.db.avoidRules, this.db.standardStyles],
      async () => {
        await this.db.photos.where('recordId').equals(recordId).delete()
        await this.db.avoidRules.where('recordId').equals(recordId).delete()
        await this.db.standardStyles.where('recordId').equals(recordId).delete()
        await this.db.records.delete(recordId)
      },
    ))
  }
}
