import { fireEvent, render, screen, within } from '@testing-library/vue'
import { describe, expect, test } from 'vitest'

import OptionCards from './OptionCards.vue'

const textureOptions = [
  { value: 'straight', label: '直发', hint: '自然垂下来', art: 'texture-straight' },
  { value: 'wavy', label: '有点弯', hint: '自然的弯度', art: 'texture-wavy' },
  { value: 'curly', label: '卷发', hint: '一圈一圈', art: 'texture-curly' },
  { value: 'unsure', label: '暂不确定', hint: '以后可以改', art: 'unsure' },
] as const

describe('OptionCards', () => {
  test('renders a labelled radio group with one radio per option', () => {
    render(OptionCards, {
      props: {
        legend: '你的头发平时是什么样？',
        name: 'hairTexture',
        modelValue: 'unsure',
        options: [...textureOptions],
      },
    })

    const group = screen.getByRole('group', { name: '你的头发平时是什么样？' })
    const radios = within(group).getAllByRole('radio')
    expect(radios).toHaveLength(4)
    radios.forEach((radio) => {
      expect(radio.getAttribute('name')).toBe('hairTexture')
    })
    expect(within(group).getByRole('radio', { name: /直发/ })).toBeTruthy()
    expect(within(group).getByRole('radio', { name: /有点弯/ })).toBeTruthy()
  })

  test('checks the radio that matches modelValue and marks the tile', () => {
    render(OptionCards, {
      props: {
        legend: '你的头发平时是什么样？',
        name: 'hairTexture',
        modelValue: 'wavy',
        options: [...textureOptions],
      },
    })

    const checked = screen.getByRole('radio', { name: /有点弯/ }) as HTMLInputElement
    expect(checked.checked).toBe(true)
    expect(checked.closest('.option-card')?.getAttribute('data-selected')).toBe('true')
    const other = screen.getByRole('radio', { name: /直发/ }) as HTMLInputElement
    expect(other.checked).toBe(false)
    expect(other.closest('.option-card')?.getAttribute('data-selected')).toBe('false')
  })

  test('emits update:modelValue when a different tile is chosen', async () => {
    const result = render(OptionCards, {
      props: {
        legend: '你的头发平时是什么样？',
        name: 'hairTexture',
        modelValue: 'unsure',
        options: [...textureOptions],
      },
    })

    await fireEvent.click(screen.getByRole('radio', { name: /卷发/ }))
    expect(result.emitted('update:modelValue')).toEqual([['curly']])
  })

  test('draws the option art so choices can be recognised without reading', () => {
    render(OptionCards, {
      props: {
        legend: '你的头发平时是什么样？',
        name: 'hairTexture',
        modelValue: 'unsure',
        options: [...textureOptions],
      },
    })

    expect(document.querySelector('[data-art="texture-straight"]')).toBeTruthy()
    expect(document.querySelector('[data-art="texture-wavy"]')).toBeTruthy()
    expect(document.querySelector('[data-art="unsure"]')).toBeTruthy()
    document.querySelectorAll('[data-art]').forEach((svg) => {
      expect(svg.getAttribute('aria-hidden')).toBe('true')
    })
  })

  test('renders text-only tiles when options carry no art', () => {
    render(OptionCards, {
      props: {
        legend: '性别（用于筛选，可不透露）',
        name: 'genderIdentity',
        modelValue: 'unspecified',
        options: [
          { value: 'woman', label: '女' },
          { value: 'man', label: '男' },
          { value: 'unspecified', label: '不透露' },
        ],
      },
    })

    expect(screen.getAllByRole('radio')).toHaveLength(3)
    expect(document.querySelector('[data-art]')).toBeNull()
  })
})
