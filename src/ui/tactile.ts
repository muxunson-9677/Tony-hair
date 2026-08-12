import type { ObjectDirective } from 'vue'

const HIT_SLOP = 10
const RELEASE_KEYFRAMES: Keyframe[] = [
  { transform: 'scale(0.96)' },
  { transform: 'scale(1.012)', offset: 0.72 },
  { transform: 'scale(1)' },
]

type TactileElement = HTMLElement & {
  disabled?: boolean
}

interface TactileState {
  activePointerId: number | null
  bounds: DOMRect | null
  releaseAnimation: Animation | null
  suppressNextClick: boolean
  suppressionTimer: number | null
}

const cleanupByElement = new WeakMap<HTMLElement, () => void>()

const prefersReducedMotion = () => (
  typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches
)

const isDisabled = (element: TactileElement) => (
  element.disabled === true
  || element.getAttribute('aria-disabled') === 'true'
)

const isInsideHitSlop = (event: PointerEvent, bounds: DOMRect) => (
  event.clientX >= bounds.left - HIT_SLOP
  && event.clientX <= bounds.right + HIT_SLOP
  && event.clientY >= bounds.top - HIT_SLOP
  && event.clientY <= bounds.bottom + HIT_SLOP
)

const setPressOrigin = (element: HTMLElement, event: PointerEvent, bounds: DOMRect) => {
  element.style.setProperty('--press-origin-x', `${Math.round(event.clientX - bounds.left)}px`)
  element.style.setProperty('--press-origin-y', `${Math.round(event.clientY - bounds.top)}px`)
}

const clearPress = (element: HTMLElement, state: TactileState, animate: boolean) => {
  delete element.dataset.pressing
  state.activePointerId = null
  state.bounds = null

  if (!animate || prefersReducedMotion() || typeof element.animate !== 'function') return

  state.releaseAnimation?.cancel()
  state.releaseAnimation = element.animate(RELEASE_KEYFRAMES, {
    duration: 260,
    easing: 'cubic-bezier(.2,.8,.2,1)',
  })
}

export const tactileDirective: ObjectDirective<HTMLElement, boolean | undefined> = {
  mounted(element, binding) {
    if (binding.value === false) return

    element.dataset.tactile = 'true'

    const target = element as TactileElement
    const state: TactileState = {
      activePointerId: null,
      bounds: null,
      releaseAnimation: null,
      suppressNextClick: false,
      suppressionTimer: null,
    }

    const onClick = (event: MouseEvent) => {
      if (!state.suppressNextClick) return

      state.suppressNextClick = false
      if (state.suppressionTimer !== null) window.clearTimeout(state.suppressionTimer)
      state.suppressionTimer = null
      event.preventDefault()
      event.stopImmediatePropagation()
    }

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || isDisabled(target)) return

      state.releaseAnimation?.cancel()
      state.releaseAnimation = null
      state.activePointerId = event.pointerId
      state.bounds = element.getBoundingClientRect()
      setPressOrigin(element, event, state.bounds)
      element.dataset.pressing = 'true'
      element.setPointerCapture?.(event.pointerId)
    }

    const onPointerMove = (event: PointerEvent) => {
      if (state.activePointerId !== event.pointerId || !state.bounds) return

      if (isInsideHitSlop(event, state.bounds)) {
        element.dataset.pressing = 'true'
      } else {
        delete element.dataset.pressing
      }
    }

    const onPointerUp = (event: PointerEvent) => {
      if (state.activePointerId !== event.pointerId) return

      const commits = element.dataset.pressing === 'true'
      element.releasePointerCapture?.(event.pointerId)
      if (!commits) {
        state.suppressNextClick = true
        if (state.suppressionTimer !== null) window.clearTimeout(state.suppressionTimer)
        state.suppressionTimer = window.setTimeout(() => {
          state.suppressNextClick = false
          state.suppressionTimer = null
        })
      }
      clearPress(element, state, commits)
    }

    const onPointerCancel = (event: PointerEvent) => {
      if (state.activePointerId !== event.pointerId) return
      clearPress(element, state, false)
    }

    const onLostPointerCapture = () => {
      if (state.activePointerId === null) return
      clearPress(element, state, false)
    }

    element.addEventListener('pointerdown', onPointerDown)
    element.addEventListener('pointermove', onPointerMove)
    element.addEventListener('pointerup', onPointerUp)
    element.addEventListener('pointercancel', onPointerCancel)
    element.addEventListener('lostpointercapture', onLostPointerCapture)
    element.addEventListener('click', onClick, true)

    cleanupByElement.set(element, () => {
      state.releaseAnimation?.cancel()
      if (state.suppressionTimer !== null) window.clearTimeout(state.suppressionTimer)
      delete element.dataset.tactile
      delete element.dataset.pressing
      element.removeEventListener('pointerdown', onPointerDown)
      element.removeEventListener('pointermove', onPointerMove)
      element.removeEventListener('pointerup', onPointerUp)
      element.removeEventListener('pointercancel', onPointerCancel)
      element.removeEventListener('lostpointercapture', onLostPointerCapture)
      element.removeEventListener('click', onClick, true)
    })
  },
  unmounted(element) {
    cleanupByElement.get(element)?.()
    cleanupByElement.delete(element)
  },
}
