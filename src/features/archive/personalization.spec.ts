import { describe, expect, test } from 'vitest'

import { personalizedStyleReason, rankStylesForProfile } from './personalization'
import type { HairProfile } from './types'
import { curatedHairstyles } from '../hairstyle-library/curatedCatalog'

const profile: HairProfile = {
  id: 'profile-1',
  name: '小沐',
  genderIdentity: 'woman',
  presentationPreference: 'androgynous',
  hairTexture: 'wavy',
  strandThickness: 'fine',
  density: 'medium',
  stylingMinutes: 5,
  washFrequency: 'every_other_day',
  preferenceNotes: '',
  profilePhotos: [],
  createdAt: '2026-08-11T00:00:00.000Z',
  updatedAt: '2026-08-11T00:00:00.000Z',
}

describe('local hairstyle personalization', () => {
  test('ranks compatible presentation, texture and routine ahead of generic catalog order', () => {
    const ranked = rankStylesForProfile(curatedHairstyles, profile)

    expect(ranked[0]?.style.genderPresentation).toBe('androgynous')
    expect(ranked[0]?.score).toBeGreaterThan(ranked.at(-1)?.score ?? 0)
  })

  test('explains the match using only facts actually stored in the profile', () => {
    const style = curatedHairstyles.find(({ id }) => id === 'ran-crop')!

    expect(personalizedStyleReason(style, profile)).toContain('有点弯')
    expect(personalizedStyleReason(style, profile)).toContain('5 分钟')
    expect(personalizedStyleReason(style, { ...profile, presentationPreference: 'unspecified' }))
      .not.toContain('中性')
  })
})
