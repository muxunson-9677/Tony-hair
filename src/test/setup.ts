import 'fake-indexeddb/auto'

import { cleanup } from '@testing-library/vue'
import { afterEach, vi } from 'vitest'

let objectUrlIndex = 0
Object.defineProperty(URL, 'createObjectURL', {
  configurable: true,
  value: vi.fn(() => `blob:test-${objectUrlIndex += 1}`),
})
Object.defineProperty(URL, 'revokeObjectURL', {
  configurable: true,
  value: vi.fn(),
})

afterEach(() => {
  cleanup()
  vi.mocked(URL.createObjectURL).mockClear()
  vi.mocked(URL.revokeObjectURL).mockClear()
})
