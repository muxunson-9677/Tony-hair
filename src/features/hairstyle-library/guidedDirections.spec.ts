import { describe, expect, test } from 'vitest'

import type { HairProfile } from '../archive/types'
import { curatedHairstyles } from './curatedCatalog'
import { recommendGuidedDirections } from './guidedDirections'

const profile = (overrides: Partial<HairProfile> = {}): HairProfile => ({
  id: 'profile-guided',
  name: '阿青',
  genderIdentity: 'unspecified',
  presentationPreference: 'masculine',
  hairTexture: 'straight',
  strandThickness: 'coarse',
  density: 'high',
  stylingMinutes: 5,
  washFrequency: 'every_other_day',
  preferenceNotes: '',
  createdAt: '2026-08-12T00:00:00.000Z',
  updatedAt: '2026-08-12T00:00:00.000Z',
  ...overrides,
})

describe('recommendGuidedDirections', () => {
  test('returns the three decision roles with unique active styles', () => {
    const recommendations = recommendGuidedDirections({
      profile: profile(),
      answers: { goal: 'easy', stylingBudget: 5, changeAppetite: 'balanced' },
      catalog: curatedHairstyles,
    })

    expect(recommendations.map(({ role }) => role)).toEqual(['safe', 'goal', 'try'])
    expect(new Set(recommendations.map(({ style }) => style.id)).size).toBe(3)
    expect(recommendations.every(({ style }) => style.status === 'active')).toBe(true)
  })

  test('is deterministic and lets a tight time budget influence the safest direction', () => {
    const input = {
      profile: profile(),
      answers: { goal: 'easy', stylingBudget: 5, changeAppetite: 'safe' } as const,
      catalog: curatedHairstyles,
    }

    const first = recommendGuidedDirections(input)
    const second = recommendGuidedDirections(input)

    expect(second.map(({ style }) => style.id)).toEqual(first.map(({ style }) => style.id))
    expect(first[0]?.style.stylingMinutes).toBeLessThanOrEqual(5)
    expect(first[0]?.style.genderPresentation).toBe('masculine')
  })

  test('uses the stated goal and change appetite instead of returning one fixed trio', () => {
    const conservative = recommendGuidedDirections({
      profile: profile({ presentationPreference: 'unspecified' }),
      answers: { goal: 'length', stylingBudget: 8, changeAppetite: 'safe' },
      catalog: curatedHairstyles,
    })
    const bold = recommendGuidedDirections({
      profile: profile({ presentationPreference: 'unspecified' }),
      answers: { goal: 'change', stylingBudget: 12, changeAppetite: 'bold' },
      catalog: curatedHairstyles,
    })

    expect(conservative.find(({ role }) => role === 'goal')?.style.goals)
      .toContain('keep_sides_longer')
    expect(bold.find(({ role }) => role === 'try')?.style.length).toBe('very_short')
    expect(bold.map(({ style }) => style.id)).not.toEqual(conservative.map(({ style }) => style.id))
  })

  test('does not invent personal facts when the profile is unknown', () => {
    const recommendations = recommendGuidedDirections({
      profile: profile({
        presentationPreference: 'unspecified',
        hairTexture: 'unsure',
        strandThickness: 'unsure',
        density: 'unsure',
        stylingMinutes: null,
      }),
      answers: { goal: 'easy', stylingBudget: 3, changeAppetite: 'balanced' },
      catalog: curatedHairstyles,
    })

    expect(recommendations).toHaveLength(3)
    expect(recommendations.every(({ reason }) => !/你的发质|你的发量|非常适合你/u.test(reason)))
      .toBe(true)
    expect(recommendations.every(({ reason }) => reason.length > 0)).toBe(true)
  })

  test('returns fewer honest results when the active catalog cannot supply three styles', () => {
    const recommendations = recommendGuidedDirections({
      profile: profile(),
      answers: { goal: 'easy', stylingBudget: 5, changeAppetite: 'balanced' },
      catalog: curatedHairstyles.slice(0, 2),
    })

    expect(recommendations).toHaveLength(2)
    expect(new Set(recommendations.map(({ style }) => style.id)).size).toBe(2)
  })
})
