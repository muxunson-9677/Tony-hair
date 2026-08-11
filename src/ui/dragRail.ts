import type { ObjectDirective } from 'vue'

const INTENT_THRESHOLD = 10
const STOP_VELOCITY = 2
const STOP_DISTANCE = 0.5

interface PositionSample {
  readonly x: number
  readonly time: number
}

interface DragRailState {
  pointerId: number | null
  startX: number
  startY: number
  startScrollLeft: number
  dragging: boolean
  cancelled: boolean
  samples: PositionSample[]
  frame: number
  edgeAnimation: Animation | null
}

const cleanupByElement = new WeakMap<HTMLElement, () => void>()

export function projectVelocity(velocity: number, decelerationRate = 0.99) {
  return (velocity / 1000) * decelerationRate / (1 - decelerationRate)
}

export function rubberband(overshoot: number, dimension: number, constant = 0.55) {
  return (overshoot * dimension * constant)
    / (dimension + constant * Math.abs(overshoot))
}

const prefersReducedMotion = () => (
  typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches
)

const maximumScroll = (element: HTMLElement) => (
  Math.max(0, element.scrollWidth - element.clientWidth)
)

const clamp = (value: number, minimum: number, maximum: number) => (
  Math.min(maximum, Math.max(minimum, value))
)

const settleEdge = (element: HTMLElement, state: DragRailState) => {
  const currentTranslate = element.style.getPropertyValue('translate') || '0px 0px'
  state.edgeAnimation?.cancel()
  element.style.removeProperty('translate')

  if (
    currentTranslate === '0px 0px'
    || prefersReducedMotion()
    || typeof element.animate !== 'function'
  ) return

  state.edgeAnimation = element.animate(
    [
      { translate: currentTranslate },
      { translate: '0px 0px' },
    ],
    { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)' },
  )
}

const releaseVelocity = (samples: readonly PositionSample[]) => {
  if (samples.length < 2) return 0
  const first = samples[0]
  const last = samples[samples.length - 1]
  const elapsed = last.time - first.time
  if (elapsed <= 0) return 0
  return -((last.x - first.x) / elapsed) * 1000
}

const startMomentum = (
  element: HTMLElement,
  state: DragRailState,
  initialVelocity: number,
) => {
  if (prefersReducedMotion()) return

  let position = element.scrollLeft
  let velocity = initialVelocity
  const target = clamp(
    position + projectVelocity(initialVelocity),
    0,
    maximumScroll(element),
  )
  let previousTime = 0

  const tick = (time: number) => {
    const elapsed = previousTime === 0 ? 1 / 60 : Math.min((time - previousTime) / 1000, 1 / 30)
    previousTime = time
    const acceleration = ((target - position) * 150) - (velocity * 24)
    velocity += acceleration * elapsed
    position += velocity * elapsed
    element.scrollLeft = clamp(position, 0, maximumScroll(element))

    if (Math.abs(velocity) <= STOP_VELOCITY && Math.abs(target - position) <= STOP_DISTANCE) {
      element.scrollLeft = target
      state.frame = 0
      return
    }

    state.frame = window.requestAnimationFrame(tick)
  }

  state.frame = window.requestAnimationFrame(tick)
}

export const dragRailDirective: ObjectDirective<HTMLElement, boolean | undefined> = {
  mounted(element, binding) {
    if (binding.value === false) return

    element.dataset.dragRail = 'true'

    const state: DragRailState = {
      pointerId: null,
      startX: 0,
      startY: 0,
      startScrollLeft: 0,
      dragging: false,
      cancelled: false,
      samples: [],
      frame: 0,
      edgeAnimation: null,
    }

    const cancelMomentum = () => {
      if (state.frame !== 0) window.cancelAnimationFrame(state.frame)
      state.frame = 0
      state.edgeAnimation?.cancel()
      state.edgeAnimation = null
    }

    const resetPointer = () => {
      state.pointerId = null
      state.dragging = false
      state.cancelled = false
      state.samples = []
      delete element.dataset.dragging
    }

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return
      cancelMomentum()
      state.pointerId = event.pointerId
      state.startX = event.clientX
      state.startY = event.clientY
      state.startScrollLeft = element.scrollLeft
      state.dragging = false
      state.cancelled = false
      state.samples = [{ x: event.clientX, time: performance.now() }]
    }

    const onPointerMove = (event: PointerEvent) => {
      if (state.pointerId !== event.pointerId || state.cancelled) return

      const deltaX = event.clientX - state.startX
      const deltaY = event.clientY - state.startY

      if (!state.dragging) {
        if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < INTENT_THRESHOLD) return
        if (Math.abs(deltaY) >= Math.abs(deltaX)) {
          state.cancelled = true
          return
        }
        state.dragging = true
        element.dataset.dragging = 'true'
        element.setPointerCapture?.(event.pointerId)
      }

      event.preventDefault()
      const desiredScroll = state.startScrollLeft - deltaX
      const maximum = maximumScroll(element)
      element.scrollLeft = clamp(desiredScroll, 0, maximum)

      if (desiredScroll < 0) {
        const resistance = rubberband(-desiredScroll, Math.max(element.clientWidth, 1))
        element.style.setProperty('translate', `${resistance}px 0px`)
      } else if (desiredScroll > maximum) {
        const resistance = rubberband(desiredScroll - maximum, Math.max(element.clientWidth, 1))
        element.style.setProperty('translate', `${-resistance}px 0px`)
      } else {
        element.style.removeProperty('translate')
      }

      state.samples.push({ x: event.clientX, time: performance.now() })
      state.samples = state.samples.slice(-5)
    }

    const onPointerUp = (event: PointerEvent) => {
      if (state.pointerId !== event.pointerId) return
      element.releasePointerCapture?.(event.pointerId)

      if (state.dragging) {
        settleEdge(element, state)
        startMomentum(element, state, releaseVelocity(state.samples))
      }

      resetPointer()
    }

    const onPointerCancel = (event: PointerEvent) => {
      if (state.pointerId !== event.pointerId) return
      settleEdge(element, state)
      resetPointer()
    }

    element.addEventListener('pointerdown', onPointerDown)
    element.addEventListener('pointermove', onPointerMove)
    element.addEventListener('pointerup', onPointerUp)
    element.addEventListener('pointercancel', onPointerCancel)

    cleanupByElement.set(element, () => {
      cancelMomentum()
      delete element.dataset.dragRail
      resetPointer()
      element.style.removeProperty('translate')
      element.removeEventListener('pointerdown', onPointerDown)
      element.removeEventListener('pointermove', onPointerMove)
      element.removeEventListener('pointerup', onPointerUp)
      element.removeEventListener('pointercancel', onPointerCancel)
    })
  },
  unmounted(element) {
    cleanupByElement.get(element)?.()
    cleanupByElement.delete(element)
  },
}
