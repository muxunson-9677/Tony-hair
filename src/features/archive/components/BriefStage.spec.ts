import { render, fireEvent } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'

import BriefStage from './BriefStage.vue'

const referenceState = {
  id: 'reference',
  label: '参考原图',
  imageSource: 'blob:reference-url',
  imageAlt: '齐颌短鲍伯目标参考图',
  available: true,
}

const dailyState = {
  id: 'daily',
  label: '日常状态',
  imageSource: 'blob:daily-url',
  imageAlt: '日常状态图',
  available: true,
}

const aiState = {
  id: 'ai_preview',
  label: 'AI 效果图',
  imageAlt: 'AI 效果图',
  available: false,
}

describe('BriefStage', () => {
  it('renders exactly one image and no switcher for a single available state', () => {
    const { container, queryByRole } = render(BriefStage, {
      props: { states: [referenceState, aiState], modelValue: 'reference' },
    })
    expect(container.querySelectorAll('img')).toHaveLength(1)
    expect(container.querySelector('img')?.getAttribute('src')).toBe('blob:reference-url')
    expect(queryByRole('tablist')).toBeNull()
    expect(container.textContent).not.toContain('AI 效果图')
  })

  it('shows a segmented switcher for multiple available states and still renders one image', async () => {
    const { container, getByRole, emitted } = render(BriefStage, {
      props: { states: [referenceState, dailyState], modelValue: 'reference' },
    })
    expect(getByRole('tablist')).toBeTruthy()
    expect(container.querySelectorAll('img')).toHaveLength(1)

    await fireEvent.click(getByRole('tab', { name: '日常状态' }))
    expect(emitted()['update:modelValue']).toEqual([['daily']])
  })

  it('renders the newly selected state image after the model changes', async () => {
    const { container, rerender } = render(BriefStage, {
      props: { states: [referenceState, dailyState], modelValue: 'reference' },
    })
    await rerender({ states: [referenceState, dailyState], modelValue: 'daily' })
    expect(container.querySelectorAll('img')).toHaveLength(1)
    expect(container.querySelector('img')?.getAttribute('src')).toBe('blob:daily-url')
  })

  it('shows the placeholder when the active state has no image', () => {
    const { container, getByText } = render(BriefStage, {
      props: {
        states: [{ ...referenceState, imageSource: undefined }],
        modelValue: 'reference',
      },
    })
    expect(container.querySelectorAll('img')).toHaveLength(0)
    expect(getByText('目标候选暂无可显示图片')).toBeTruthy()
  })
})
