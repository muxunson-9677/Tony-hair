import { fireEvent, render, screen } from '@testing-library/vue'
import { describe, expect, test } from 'vitest'

import PlanMemoryEditor, { type PlanMemoryEntry } from './PlanMemoryEditor.vue'

const entry = (overrides: Partial<PlanMemoryEntry>): PlanMemoryEntry => ({
  uiKey: 'memory-1',
  kind: 'avoid',
  text: '两侧不要推白',
  sourceRecordId: 'record-1',
  sourceRecordDate: '2026-08-01',
  sourceLabel: '翻车寸头',
  sourceExists: true,
  ...overrides,
})

const renderEditor = (props: {
  keepItems?: PlanMemoryEntry[]
  avoidItems?: PlanMemoryEntry[]
  overflowItems?: PlanMemoryEntry[]
  disabled?: boolean
}) => render(PlanMemoryEditor, {
  props: {
    keepItems: props.keepItems ?? [],
    avoidItems: props.avoidItems ?? [],
    overflowItems: props.overflowItems ?? [],
    disabled: props.disabled ?? false,
  },
  global: {
    stubs: {
      RouterLink: { template: '<a data-testid="memory-source-link"><slot /></a>' },
    },
  },
})

describe('PlanMemoryEditor', () => {
  test('shows both groups with kind labels, sources, and the single Tony line', () => {
    renderEditor({
      keepItems: [
        entry({ uiKey: 'k1', kind: 'adjustment', text: '两侧留长一点', sourceLabel: '夏季短发' }),
        entry({ uiKey: 'k2', kind: 'success', text: '整体照上次的「清爽短发」复刻', sourceLabel: '清爽短发' }),
      ],
      avoidItems: [entry({ uiKey: 'a1' })],
    })

    expect(screen.getByRole('heading', { name: '本次已带入' })).toBeTruthy()
    expect(screen.getByText('Tony 从你的剪后记录里带来了这些经验。保存前都可以改，不会改动原记录。')).toBeTruthy()
    expect(screen.getByRole('heading', { name: '这次继续保持' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: '这次一定避开' })).toBeTruthy()
    expect(screen.getByText('下次微调')).toBeTruthy()
    expect(screen.getByText('成功经验')).toBeTruthy()
    expect(screen.getByText('避雷')).toBeTruthy()
    expect(screen.getAllByTestId('memory-source-link')).toHaveLength(3)
    expect((screen.getByLabelText('保持经验 1') as HTMLTextAreaElement).value).toBe('两侧留长一点')
    expect((screen.getByLabelText('避开经验 1') as HTMLTextAreaElement).value).toBe('两侧不要推白')
  })

  test('hides an empty group and hides the whole module heading when nothing is inherited', () => {
    const { unmount } = renderEditor({ avoidItems: [entry({ uiKey: 'a1' })] })
    expect(screen.queryByRole('heading', { name: '这次继续保持' })).toBeNull()
    unmount()

    renderEditor({})
    expect(screen.queryByRole('heading', { name: '本次已带入' })).toBeNull()
  })

  test('emits update-text and remove for the right group and index', async () => {
    const { emitted } = renderEditor({
      keepItems: [entry({ uiKey: 'k1', kind: 'adjustment', text: '两侧留长一点' })],
      avoidItems: [entry({ uiKey: 'a1' }), entry({ uiKey: 'a2', text: '刘海别剪太短' })],
    })

    await fireEvent.update(screen.getByLabelText('保持经验 1'), '两侧保留 6mm')
    expect(emitted('update-text')).toEqual([['keep', 0, '两侧保留 6mm']])

    await fireEvent.click(screen.getByRole('button', { name: '删除避开经验 2' }))
    expect(emitted('remove')).toEqual([['avoid', 1]])
  })

  test('marks deleted sources with a snapshot note instead of a link', () => {
    renderEditor({
      avoidItems: [entry({ uiKey: 'a1', sourceExists: false })],
    })
    expect(screen.queryByTestId('memory-source-link')).toBeNull()
    expect(screen.getByText(/原记录已删除，保留当时快照/)).toBeTruthy()
  })

  test('shows the overflow entry only when there are overflow avoids and swaps in two steps', async () => {
    const { emitted } = renderEditor({
      avoidItems: [
        entry({ uiKey: 'a1', text: '避雷一' }),
        entry({ uiKey: 'a2', text: '避雷二' }),
        entry({ uiKey: 'a3', text: '避雷三' }),
      ],
      overflowItems: [entry({ uiKey: 'o1', text: '避雷四', sourceRecordDate: '2026-07-01' })],
    })

    const toggle = screen.getByText('还有 1 条避雷没带入，查看')
    expect(toggle).toBeTruthy()

    await fireEvent.click(screen.getByRole('button', { name: '换入：避雷四' }))
    expect(screen.getByText('点选下面要被替换的那条避雷')).toBeTruthy()

    await fireEvent.click(screen.getByRole('button', { name: '换成这条：避雷二' }))
    expect(emitted('swap')).toEqual([[0, 1]])
    expect(screen.queryByText('点选下面要被替换的那条避雷')).toBeNull()
  })

  test('does not render an overflow entry when every avoid fits', () => {
    renderEditor({ avoidItems: [entry({ uiKey: 'a1' })] })
    expect(screen.queryByText(/条避雷没带入/)).toBeNull()
  })

  test('lets the user cancel a pending swap', async () => {
    const { emitted } = renderEditor({
      avoidItems: [entry({ uiKey: 'a1', text: '避雷一' })],
      overflowItems: [entry({ uiKey: 'o1', text: '避雷四' })],
    })

    await fireEvent.click(screen.getByRole('button', { name: '换入：避雷四' }))
    await fireEvent.click(screen.getByRole('button', { name: '取消换入' }))
    expect(screen.queryByText('点选下面要被替换的那条避雷')).toBeNull()
    expect(emitted('swap')).toBeUndefined()
  })

  test('disables all inputs and buttons while saving', () => {
    renderEditor({
      avoidItems: [entry({ uiKey: 'a1' })],
      overflowItems: [entry({ uiKey: 'o1', text: '避雷四' })],
      disabled: true,
    })
    expect((screen.getByLabelText('避开经验 1') as HTMLTextAreaElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: '删除避开经验 1' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: '换入：避雷四' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
