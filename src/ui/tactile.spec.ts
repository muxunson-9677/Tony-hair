import type { DirectiveBinding } from 'vue'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { tactileDirective } from './tactile'

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

const mountDirective = (element: HTMLElement) => {
  const binding = { value: true } as DirectiveBinding<boolean>
  const vnode = {} as Parameters<NonNullable<typeof tactileDirective.mounted>>[2]
  tactileDirective.mounted?.(
    element,
    binding,
    vnode,
    null,
  )
}

const unmountDirective = (element: HTMLElement) => {
  const vnode = {} as Parameters<NonNullable<typeof tactileDirective.unmounted>>[2]
  tactileDirective.unmounted?.(
    element,
    { value: true } as DirectiveBinding<boolean>,
    vnode,
    null,
  )
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('tactileDirective', () => {
  test('responds on pointer down, cancels outside the hit slop, and restores when dragged back', () => {
    const button = document.createElement('button')
    Object.defineProperty(button, 'getBoundingClientRect', {
      value: () => ({
        x: 10,
        y: 10,
        top: 10,
        right: 54,
        bottom: 54,
        left: 10,
        width: 44,
        height: 44,
        toJSON: () => ({}),
      }),
    })
    mountDirective(button)

    button.dispatchEvent(pointer('pointerdown', { clientX: 22, clientY: 24 }))
    expect(button.dataset.pressing).toBe('true')
    expect(button.style.getPropertyValue('--press-origin-x')).toBe('12px')
    expect(button.style.getPropertyValue('--press-origin-y')).toBe('14px')

    button.dispatchEvent(pointer('pointermove', { clientX: 80, clientY: 24 }))
    expect(button.dataset.pressing).toBeUndefined()

    button.dispatchEvent(pointer('pointermove', { clientX: 18, clientY: 20 }))
    expect(button.dataset.pressing).toBe('true')
  })

  test('hands pointer release to one interruptible animation without synthesizing a click', () => {
    const button = document.createElement('button')
    const cancel = vi.fn()
    const animate = vi.fn(() => ({ cancel }) as unknown as Animation)
    Object.defineProperty(button, 'animate', { configurable: true, value: animate })
    Object.defineProperty(button, 'getBoundingClientRect', {
      value: () => ({
        x: 0,
        y: 0,
        top: 0,
        right: 44,
        bottom: 44,
        left: 0,
        width: 44,
        height: 44,
        toJSON: () => ({}),
      }),
    })
    const click = vi.fn()
    button.addEventListener('click', click)
    mountDirective(button)

    button.dispatchEvent(pointer('pointerdown', { clientX: 20, clientY: 20 }))
    button.dispatchEvent(pointer('pointerup', { clientX: 20, clientY: 20 }))

    expect(button.dataset.pressing).toBeUndefined()
    expect(animate).toHaveBeenCalledTimes(1)
    expect(click).not.toHaveBeenCalled()

    button.dispatchEvent(pointer('pointerdown', { clientX: 20, clientY: 20 }))
    expect(cancel).toHaveBeenCalledTimes(1)
  })

  test('does not animate disabled controls and removes listeners on unmount', () => {
    const button = document.createElement('button')
    button.disabled = true
    mountDirective(button)

    button.dispatchEvent(pointer('pointerdown', { clientX: 20, clientY: 20 }))
    expect(button.dataset.pressing).toBeUndefined()

    button.disabled = false
    unmountDirective(button)
    button.dispatchEvent(pointer('pointerdown', { clientX: 20, clientY: 20 }))
    expect(button.dataset.pressing).toBeUndefined()
  })
})
