import { render } from '@testing-library/vue'
import { describe, expect, test } from 'vitest'

import AppIcon from './AppIcon.vue'

describe('AppIcon', () => {
  test.each([
    'home',
    'styles',
    'archive',
    'me',
    'search',
    'heart',
    'heart-filled',
    'filter',
    'upload',
    'eye',
    'back',
    'scissors',
    'photo',
    'edit',
    'trash',
    'check',
    'warning',
    'folder',
    'print',
  ] as const)('renders the local %s icon as decorative SVG', (name) => {
    const { container } = render(AppIcon, { props: { name } })
    const icon = container.querySelector('svg')

    expect(icon?.getAttribute('aria-hidden')).toBe('true')
    expect(icon?.getAttribute('data-icon')).toBe(name)
    expect(icon?.querySelectorAll('path, circle, rect, polyline, line').length).toBeGreaterThan(0)
  })
})
