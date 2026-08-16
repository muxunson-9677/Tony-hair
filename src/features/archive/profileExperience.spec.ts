import { describe, expect, test } from 'vitest'

import {
  buildKnownProfileTraits,
  describeProfilePhotoCoverage,
  genderIdentityLabel,
  presentationPreferenceLabel,
} from './profileExperience'
import type { HairProfile, HairProfilePhoto } from './types'

const profile = (overrides: Partial<HairProfile> = {}): HairProfile => ({
  id: 'profile-1',
  name: '小林',
  genderIdentity: 'woman',
  presentationPreference: 'androgynous',
  hairTexture: 'straight',
  strandThickness: 'fine',
  density: 'medium',
  stylingMinutes: 5,
  washFrequency: 'every_other_day',
  preferenceNotes: '',
  createdAt: '2026-08-12T00:00:00.000Z',
  updatedAt: '2026-08-12T00:00:00.000Z',
  ...overrides,
})

const photo = (angle: HairProfilePhoto['angle']): HairProfilePhoto => ({
  id: `photo-${angle}`,
  angle,
  image: new Blob([angle], { type: 'image/webp' }),
  width: 900,
  height: 1200,
  bytes: angle.length,
  processedAt: '2026-08-12T00:00:00.000Z',
})

describe('personal profile experience', () => {
  test('shows presentation preference without turning gender into a hard style rule', () => {
    expect(genderIdentityLabel(profile())).toBe('女')
    expect(genderIdentityLabel(profile({ genderIdentity: 'unspecified' }))).toBeNull()
    expect(presentationPreferenceLabel(profile())).toBe('中性都行')
    expect(presentationPreferenceLabel(profile({ presentationPreference: 'unspecified' })))
      .toBe('柔和利落都可以')
  })

  test('only describes hair facts the user actually confirmed', () => {
    expect(buildKnownProfileTraits(profile())).toEqual(['直发', '发丝细', '发量正常'])
    expect(buildKnownProfileTraits(profile({
      hairTexture: 'unsure',
      strandThickness: 'unsure',
      density: 'unsure',
    }))).toEqual([])
  })

  test('explains photo completeness and the next useful angles', () => {
    expect(describeProfilePhotoCoverage([])).toEqual({
      count: 0,
      missingAngles: ['正面', '侧面', '后脑'],
      message: '先补一张正面照，让档案一眼就是你的。',
    })
    expect(describeProfilePhotoCoverage([photo('front')])).toEqual({
      count: 1,
      missingAngles: ['侧面', '后脑'],
      message: '已保存正面照；以后可以再补侧面、后脑。',
    })
    expect(describeProfilePhotoCoverage([photo('front'), photo('side'), photo('back')])).toEqual({
      count: 3,
      missingAngles: [],
      message: '正面、侧面和后脑都已保存。',
    })
  })
})
