import { fireEvent, render, screen, within } from '@testing-library/vue'
import { describe, expect, test } from 'vitest'

import ReferenceRegionEditor from './ReferenceRegionEditor.vue'

describe('ReferenceRegionEditor', () => {
  test('edits one region at a time and emits a concise user-stated area', async () => {
    const result = render(ReferenceRegionEditor, { props: { modelValue: [] } })

    const regions = screen.getByRole('group', { name: '参考图部位' })
    expect(within(regions).getAllByRole('button')).toHaveLength(4)
    await fireEvent.click(within(regions).getByRole('button', { name: '刘海' }))

    const editor = screen.getByRole('group', { name: '刘海怎么参考？' })
    await fireEvent.click(within(editor).getByRole('radio', { name: '喜欢这里' }))
    await fireEvent.update(within(editor).getByLabelText('刘海说明'), '保留自然碎刘海')
    await fireEvent.click(within(editor).getByRole('button', { name: '记下刘海' }))

    const emitted = result.emitted('update:modelValue')
    const saved = emitted?.at(-1) as [unknown[]] | undefined
    expect(saved?.[0]).toEqual([
      { region: 'fringe', intent: 'keep', note: '保留自然碎刘海' },
    ])
  })

  test('restores an area for editing and can remove it without touching other regions', async () => {
    const initial = [
      { region: 'fringe' as const, intent: 'keep' as const, note: '保留自然碎刘海' },
      { region: 'sides' as const, intent: 'avoid' as const, note: '不要推太高' },
    ]
    const result = render(ReferenceRegionEditor, { props: { modelValue: initial } })

    await fireEvent.click(screen.getByRole('button', { name: '编辑刘海' }))
    expect((screen.getByLabelText('刘海说明') as HTMLTextAreaElement).value)
      .toBe('保留自然碎刘海')
    await fireEvent.click(screen.getByRole('button', { name: '删除刘海说明' }))

    const removed = result.emitted('update:modelValue')?.at(-1) as [unknown[]] | undefined
    expect(removed?.[0]).toEqual([initial[1]])
    expect(screen.getByText('两侧不要照搬')).toBeTruthy()
  })

  test('requires a short explanation and exposes the 80-character boundary', async () => {
    const result = render(ReferenceRegionEditor, { props: { modelValue: [] } })
    await fireEvent.click(screen.getByRole('button', { name: '顶部' }))

    const note = screen.getByLabelText('顶部说明') as HTMLTextAreaElement
    expect(note.maxLength).toBe(80)
    await fireEvent.click(screen.getByRole('button', { name: '记下顶部' }))

    expect(screen.getByRole('alert').textContent).toContain('写一句')
    expect(result.emitted('update:modelValue')).toBeUndefined()
  })
})
