import { BlobNotFoundError } from '@vercel/blob'
import { describe, expect, it } from 'vitest'

import { isMissingBlobError } from './blob'

describe('Blob deletion recovery', () => {
  it('treats an already-missing Blob as successful cleanup', () => {
    expect(isMissingBlobError(new BlobNotFoundError())).toBe(true)
    expect(isMissingBlobError(new Error('network failed'))).toBe(false)
  })
})
