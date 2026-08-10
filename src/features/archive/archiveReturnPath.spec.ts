import { describe, expect, test } from 'vitest'

import { curatedHairstyles } from '../hairstyle-library/curatedCatalog'
import {
  buildArchivePlanReturnPath,
  parseArchivePlanAddQuery,
  parseArchivePlanReturnPath,
} from './archiveReturnPath'

const catalogPointer = { kind: 'catalog', id: 'lin-bob' } as const
const privatePointer = { kind: 'private_reference', id: 'reference_1-2' } as const

const catalogPath = '/archive/plans/new?add=catalog:lin-bob'
const privatePath = '/archive/plans/new?add=private_reference:reference_1-2'

describe('archive plan return-path boundary', () => {
  test('builds only canonical plan-create paths for valid pointers', () => {
    expect(buildArchivePlanReturnPath(catalogPointer)).toBe(catalogPath)
    expect(buildArchivePlanReturnPath(privatePointer)).toBe(privatePath)

    expect(buildArchivePlanReturnPath({ kind: 'catalog', id: 'missing-style' })).toBeNull()
    expect(buildArchivePlanReturnPath({ kind: 'private_reference', id: '' })).toBeNull()
    expect(buildArchivePlanReturnPath({ kind: 'private_reference', id: '../reference' })).toBeNull()
    expect(buildArchivePlanReturnPath({ kind: 'other', id: 'reference-1' } as never)).toBeNull()
    expect(buildArchivePlanReturnPath(null as never)).toBeNull()
  })

  test('rejects a catalog pointer when the current catalog entry is retired', () => {
    const style = curatedHairstyles.find(({ id }) => id === catalogPointer.id)!
    const originalStatus = style.status

    try {
      Reflect.set(style, 'status', 'retired')
      expect(buildArchivePlanReturnPath(catalogPointer)).toBeNull()
      expect(parseArchivePlanAddQuery('catalog:lin-bob')).toBeNull()
    } finally {
      Reflect.set(style, 'status', originalStatus)
    }
  })

  test('parses canonical Vue route add-query values into validated pointers', () => {
    expect(parseArchivePlanAddQuery('catalog:lin-bob')).toEqual(catalogPointer)
    expect(parseArchivePlanAddQuery('private_reference:reference_1-2')).toEqual(privatePointer)
  })

  test.each([
    undefined,
    null,
    '',
    ['catalog:lin-bob'],
    ['catalog:lin-bob', 'catalog:qiao-ivy'],
    'catalog',
    'catalog:',
    'catalog:missing-style',
    'catalog%3Alin-bob',
    'private_reference:',
    'private_reference: reference-1',
    'private_reference:reference 1',
    'private_reference:reference/1',
    'private_reference:reference\\1',
    'private_reference:reference?next=1',
    'private_reference:reference#1',
    'private_reference:reference%2F1',
    'private_reference:reference\u00001',
    `private_reference:${'a'.repeat(129)}`,
    'unknown:reference-1',
  ])('rejects malformed or ambiguous add-query input %#', (value) => {
    expect(parseArchivePlanAddQuery(value)).toBeNull()
  })

  test('accepts decoded or exactly once encoded next values and rebuilds the target', () => {
    expect(parseArchivePlanReturnPath(catalogPath)).toEqual({
      path: catalogPath,
      pointer: catalogPointer,
    })
    expect(parseArchivePlanReturnPath(encodeURIComponent(privatePath))).toEqual({
      path: privatePath,
      pointer: privatePointer,
    })
  })

  test.each([
    undefined,
    null,
    '',
    [catalogPath],
    [catalogPath, privatePath],
    ` ${catalogPath}`,
    `${catalogPath} `,
    `${catalogPath}\n`,
    `${catalogPath}#fragment`,
    '/archive\\plans\\new?add=catalog:lin-bob',
    '/archive/plans/new',
    '/archive/plans/new?add=catalog:missing-style',
    '/archive/plans/new?add=private_reference:',
    '/archive/plans/new?add=private_reference:reference/1',
    '/archive/plans/new?add=catalog:lin-bob&add=catalog:qiao-ivy',
    '/archive/plans/new?add=catalog:lin-bob&next=%2Farchive',
    '/archive/plans/new?next=%2Farchive%2Fplans%2Fnew',
    '/archive/plans/new?add=catalog%3Alin-bob',
    '/archive/plans/../plans/new?add=catalog:lin-bob',
    '/archive//plans/new?add=catalog:lin-bob',
    'https://example.com/archive/plans/new?add=catalog:lin-bob',
    '//example.com/archive/plans/new?add=catalog:lin-bob',
    encodeURIComponent(`https://example.com${catalogPath}`),
    encodeURIComponent(`${catalogPath}#fragment`),
    encodeURIComponent(`${catalogPath}\u0000`),
    encodeURIComponent(encodeURIComponent(catalogPath)),
    '%E0%A4%A',
  ])('rejects unsafe, noncanonical or ambiguous next input %#', (value) => {
    expect(parseArchivePlanReturnPath(value)).toBeNull()
  })
})
