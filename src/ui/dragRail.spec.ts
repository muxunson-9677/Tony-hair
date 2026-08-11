import type { DirectiveBinding } from 'vue'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { dragRailDirective, projectVelocity, rubberband } from './dragRail'

const pointer = (
  type: string,
  options: MouseEventInit & { pointerId?: number } = {},
) => {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    ...options,
  })
  Object.defineProperty(event, 'pointerId', {
    configurable: true,
    value: options.pointerId ?? 1,
  })
  return event as PointerEvent
}

const createRail = () => {
  const rail = document.createElement('div')
  let capturedPointer: number | null = null
  Object.defineProperties(rail, {
    scrollWidth: { configurable: true, value: 600 },
    clientWidth: { configurable: true, value: 200 },
    scrollLeft: { configurable: true, value: 100, writable: true },
    setPointerCapture: {
      configurable: true,
      value: vi.fn((pointerId: number) => { capturedPointer = pointerId }),
    },
    releasePointerCapture: {
      configurable: true,
      value: vi.fn(() => { capturedPointer = null }),
    },
    hasPointerCapture: {
      configurable: true,
      value: vi.fn((pointerId: number) => capturedPointer === pointerId),
    },
  })
  const vnode = {} as Parameters<NonNullable<typeof dragRailDirective.mounted>>[2]
  dragRailDirective.mounted?.(
    rail,
    { value: true } as DirectiveBinding<boolean>,
    vnode,
    null,
  )
  return rail
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('drag rail physics', () => {
  test('projects velocity and progressively resists an overdrag', () => {
    expect(projectVelocity(1_000, 0.99)).toBeCloseTo(99)
    expect(rubberband(80, 200)).toBeGreaterThan(0)
    expect(rubberband(80, 200)).toBeLessThan(80)
  })

  test('tracks a horizontal pointer one-to-one after intent is clear', () => {
    const rail = createRail()

    rail.dispatchEvent(pointer('pointerdown', { clientX: 100, clientY: 20 }))
    const move = pointer('pointermove', { clientX: 70, clientY: 22 })
    rail.dispatchEvent(move)

    expect(rail.dataset.dragging).toBe('true')
    expect(rail.scrollLeft).toBe(130)
    expect(move.defaultPrevented).toBe(true)
  })

  test('leaves vertical scrolling alone', () => {
    const rail = createRail()

    rail.dispatchEvent(pointer('pointerdown', { clientX: 100, clientY: 20 }))
    const move = pointer('pointermove', { clientX: 96, clientY: 48 })
    rail.dispatchEvent(move)

    expect(rail.dataset.dragging).toBeUndefined()
    expect(rail.scrollLeft).toBe(100)
    expect(move.defaultPrevented).toBe(false)
  })

  test('starts momentum on release and cancels pending work on unmount', () => {
    const callbacks = new Map<number, FrameRequestCallback>()
    let frameId = 0
    const request = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frameId += 1
      callbacks.set(frameId, callback)
      return frameId
    })
    const cancel = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      callbacks.delete(id)
    })
    const rail = createRail()

    rail.dispatchEvent(pointer('pointerdown', { clientX: 100, clientY: 20 }))
    rail.dispatchEvent(pointer('pointermove', { clientX: 60, clientY: 20 }))
    rail.dispatchEvent(pointer('pointerup', { clientX: 52, clientY: 20 }))

    expect(request).toHaveBeenCalled()
    expect(rail.dataset.dragging).toBeUndefined()

    const vnode = {} as Parameters<NonNullable<typeof dragRailDirective.unmounted>>[2]
    dragRailDirective.unmounted?.(
      rail,
      { value: true } as DirectiveBinding<boolean>,
      vnode,
      null,
    )
    expect(cancel).toHaveBeenCalled()
  })
})
