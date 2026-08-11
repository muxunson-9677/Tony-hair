import { describe, expect, test } from 'vitest'

import { curatedHairstyles } from './curatedCatalog'
import {
  catalogToCandidateDraft,
  privateReferenceToCandidateDraft,
  resolveCatalogCandidateDraft,
  resolveLibraryCandidateDraft,
} from './libraryCandidates'
import type { CuratedHairstyle, PrivateHairstyleReference } from './types'

const referenceImage = new Blob(['private-reference'], { type: 'image/webp' })

const privateReference = (
  overrides: Partial<PrivateHairstyleReference> = {},
): PrivateHairstyleReference => ({
  id: 'reference-1',
  fingerprint: 'fingerprint-1',
  name: '我的私人参考',
  notes: '只参考轮廓，不要推太短',
  tags: ['通勤'],
  focusAreas: [],
  image: referenceImage,
  width: 900,
  height: 1200,
  bytes: referenceImage.size,
  processedAt: '2026-08-10T08:00:00.000Z',
  createdAt: '2026-08-10T08:00:00.000Z',
  updatedAt: '2026-08-10T08:00:00.000Z',
  ...overrides,
})

describe('hairstyle library candidate adapters', () => {
  test('maps an active catalog style to the existing demo candidate shape', () => {
    const style = curatedHairstyles.find(({ id }) => id === 'lin-bob')!

    expect(catalogToCandidateDraft(style)).toEqual({
      name: style.name,
      notes: `${style.reason} ${style.feasibility}`,
      source: 'demo_ai',
      demoImagePath: style.coverImage,
    })
  })

  test('maps a private reference to a prepared user-reference snapshot', () => {
    const source = privateReference()
    const draft = privateReferenceToCandidateDraft(source)

    expect(draft).toEqual({
      name: source.name,
      notes: source.notes,
      source: 'user_reference',
      referenceId: source.id,
      referenceImage: source.image,
      referenceImageWidth: source.width,
      referenceImageHeight: source.height,
      referenceImageBytes: source.bytes,
      referenceImageProcessedAt: source.processedAt,
    })
    expect(draft.referenceImage).toBe(source.image)
  })

  test('translates explicit private-reference regions into the candidate snapshot notes', () => {
    const source = privateReference({
      notes: '整体保持轻盈。',
      focusAreas: [
        { region: 'fringe', intent: 'keep', note: '保留自然碎刘海' },
        { region: 'sides', intent: 'avoid', note: '不要推得太高' },
      ],
    })

    const draft = privateReferenceToCandidateDraft(source)

    expect(draft.notes).toContain('整体保持轻盈。')
    expect(draft.notes).toContain('刘海想保留：保留自然碎刘海')
    expect(draft.notes).toContain('两侧不要照搬：不要推得太高')
  })

  test('resolves only canonical active catalog IDs before constructing a candidate', () => {
    const resolved = resolveCatalogCandidateDraft('lin-bob')
    const canonical = curatedHairstyles.find(({ id }) => id === 'lin-bob')!
    expect(resolved.demoImagePath).toBe(canonical.coverImage)

    expect(() => resolveCatalogCandidateDraft('missing-style')).toThrow(/catalog|style|unavailable/i)
    expect(() => resolveCatalogCandidateDraft(' lin-bob ')).toThrow(/catalog|style|unavailable/i)

    const retired = { ...canonical, status: 'retired' } satisfies CuratedHairstyle
    expect(() => resolveCatalogCandidateDraft(retired.id, [retired])).toThrow(
      /retired|unavailable/i,
    )
  })

  test('revalidates curated and private pointers against their authoritative sources', async () => {
    const source = privateReference()
    const resolver = {
      getPrivateReference: async (id: string) => id === source.id ? source : undefined,
    }

    await expect(resolveLibraryCandidateDraft(
      { itemType: 'curated_style', itemId: 'lin-bob' },
      resolver,
    )).resolves.toMatchObject({
      source: 'demo_ai',
      demoImagePath: '/demo/persona-lin-bob.webp',
    })
    await expect(resolveLibraryCandidateDraft(
      { itemType: 'private_reference', itemId: source.id },
      resolver,
    )).resolves.toMatchObject({
      source: 'user_reference',
      referenceId: source.id,
      referenceImage: source.image,
    })
    await expect(resolveLibraryCandidateDraft(
      { itemType: 'private_reference', itemId: 'missing' },
      resolver,
    )).rejects.toThrow(/private|reference|unavailable/i)
    await expect(resolveLibraryCandidateDraft(
      { itemType: 'unknown', itemId: 'lin-bob' } as never,
      resolver,
    )).rejects.toThrow(/pointer|type/i)
  })
})
