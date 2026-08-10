import { render, screen } from '@testing-library/vue'
import { defineComponent, h, nextTick } from 'vue'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { useLocalDayClock } from './useLocalDayClock'

afterEach(() => {
  vi.useRealTimers()
})

describe('useLocalDayClock', () => {
  test('refreshes the reactive date when the local calendar day rolls over', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 10, 23, 59, 59, 900))

    const Probe = defineComponent({
      setup() {
        const currentTime = useLocalDayClock()
        return () => h('output', currentTime.value.getDate())
      },
    })

    render(Probe)
    expect(screen.getByText('10')).toBeTruthy()

    await vi.advanceTimersByTimeAsync(200)
    await nextTick()

    expect(screen.getByText('11')).toBeTruthy()
  })
})
