import type { HaircutPhoto, HaircutRecord } from '../archive/types'

const localMidnight = (year: number, monthIndex: number, day: number) => (
  new Date(year, monthIndex, day).getTime()
)

export const daysSinceLastHaircut = (
  latestRecordDate: string | undefined,
  now: Date,
): number | null => {
  if (!latestRecordDate) {
    return null
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(latestRecordDate)
  if (!match) {
    return null
  }
  const recordMidnight = localMidnight(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  const todayMidnight = localMidnight(now.getFullYear(), now.getMonth(), now.getDate())
  const diffDays = Math.round((todayMidnight - recordMidnight) / 86_400_000)
  return Math.max(diffDays, 0)
}

const thumbnailStagePriority: readonly HaircutPhoto['stage'][] = ['after', 'styled', 'unstyled']

export const selectRepeatThumbnailPhoto = (
  records: readonly HaircutRecord[],
  photosByRecordId: Readonly<Record<string, readonly HaircutPhoto[]>>,
): HaircutPhoto | undefined => {
  const latestRepeat = [...records]
    .filter(({ outcome }) => outcome === 'repeat')
    .sort((left, right) => (
      right.date.localeCompare(left.date) || right.updatedAt.localeCompare(left.updatedAt)
    ))[0]
  if (!latestRepeat) {
    return undefined
  }
  const photos = photosByRecordId[latestRepeat.id] ?? []
  for (const stage of thumbnailStagePriority) {
    const found = photos.find((photo) => photo.stage === stage)
    if (found) {
      return found
    }
  }
  return undefined
}
