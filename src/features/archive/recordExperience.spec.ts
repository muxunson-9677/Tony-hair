import { describe, expect, test } from 'vitest'

import { editableRecordPhotoStages, initialRecordDecision } from './recordExperience'

describe('haircut record experience', () => {
  test('asks only for before and after photos in a new record', () => {
    expect(editableRecordPhotoStages).toEqual([
      { stage: 'before', label: '剪前' },
      { stage: 'after', label: '剪后' },
    ])
  })

  test('does not preselect satisfaction or repeat/avoid for the user', () => {
    expect(initialRecordDecision()).toEqual({ satisfaction: '', outcome: '' })
  })
})
