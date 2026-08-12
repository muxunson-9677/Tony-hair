import { describe, expect, test } from 'vitest'

import {
  BARBER_CARD_NAME,
  PRODUCT_NAME,
  PRODUCT_PERSONA,
  PRODUCT_PROMISE,
  PRODUCT_PROMISE_SHORT,
  pageTitle,
} from './brand'

describe('brand constants', () => {
  test('exposes the approved brand names', () => {
    expect(PRODUCT_NAME).toBe('Tony宝')
    expect(PRODUCT_PERSONA).toBe('Tony')
    expect(BARBER_CARD_NAME).toBe('Tony卡')
  })

  test('keeps the full promise sentence intact', () => {
    expect(PRODUCT_PROMISE).toBe('剪前帮你定，剪时替你说，剪后帮你记。每剪一次，Tony 更懂你一分。')
  })

  test('derives the short promise from the full constant instead of a second copy', () => {
    expect(PRODUCT_PROMISE_SHORT).toBe('剪前帮你定，剪时替你说，剪后帮你记')
    expect(PRODUCT_PROMISE.startsWith(PRODUCT_PROMISE_SHORT)).toBe(true)
  })

  test('builds page titles with and without a prefix', () => {
    expect(pageTitle()).toBe('Tony宝')
    expect(pageTitle('找发型')).toBe('找发型｜Tony宝')
  })
})
