import { describe, expect, test } from 'vitest'

import { resolveHomeFavorite } from './resolveHomeFavorite'

const favorite = (itemId: string, itemType: 'curated_style' | 'private_reference' = 'curated_style') => ({
  itemId,
  itemType,
})

const catalog = [
  { id: 'retired-style', status: 'retired' as const, name: '已下架方向' },
  { id: 'active-style', status: 'active' as const, name: '有效方向' },
]

describe('resolveHomeFavorite', () => {
  test('returns the first active curated favorite while ignoring private references', () => {
    expect(resolveHomeFavorite([
      favorite('private-1', 'private_reference'),
      favorite('active-style'),
    ], catalog)).toEqual(catalog[1])
  })

  test('returns null for a missing favorite instead of claiming another catalog style', () => {
    expect(resolveHomeFavorite([favorite('missing-style')], catalog)).toBeNull()
  })

  test('returns null for a retired favorite instead of claiming an active replacement', () => {
    expect(resolveHomeFavorite([favorite('retired-style')], catalog)).toBeNull()
  })
})
