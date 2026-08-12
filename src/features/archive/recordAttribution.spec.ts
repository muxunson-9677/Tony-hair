import { beforeEach, describe, expect, test } from 'vitest'

import {
  clearPendingRecordAttribution,
  consumePendingRecordAttribution,
  setPendingRecordAttribution,
} from './recordAttribution'

describe('record attribution feedback', () => {
  beforeEach(() => {
    clearPendingRecordAttribution()
  })

  test('returns the outcome message exactly once for the saved record', () => {
    setPendingRecordAttribution('record-1', 'repeat')
    expect(consumePendingRecordAttribution('record-1'))
      .toBe('Tony 记住了：这次的成功剪法已存档，下次一句话复刻。')
    expect(consumePendingRecordAttribution('record-1')).toBeNull()
  })

  test('uses restrained persona wording per outcome', () => {
    setPendingRecordAttribution('record-1', 'adjust')
    expect(consumePendingRecordAttribution('record-1'))
      .toBe('Tony 记住了：下次会带上你刚写的调整。')

    setPendingRecordAttribution('record-2', 'avoid')
    expect(consumePendingRecordAttribution('record-2'))
      .toBe('这次的雷 Tony 记住了，下次替你挡。')
  })

  test('does not leak the message to a different record', () => {
    setPendingRecordAttribution('record-1', 'repeat')
    expect(consumePendingRecordAttribution('record-2')).toBeNull()
    expect(consumePendingRecordAttribution('record-1')).not.toBeNull()
  })

  test('a newer save replaces the previous pending message', () => {
    setPendingRecordAttribution('record-1', 'repeat')
    setPendingRecordAttribution('record-2', 'avoid')
    expect(consumePendingRecordAttribution('record-1')).toBeNull()
    expect(consumePendingRecordAttribution('record-2'))
      .toBe('这次的雷 Tony 记住了，下次替你挡。')
  })
})
