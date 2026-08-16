import { fireEvent, render } from '@testing-library/vue'
import { describe, expect, it, vi } from 'vitest'

import RegionMarkAnnotator from './RegionMarkAnnotator.vue'
import type { RegionMark } from '../types'

const baseProps = {
  photoUrl: 'blob:after-photo',
  photoAlt: '剪后照片',
  marks: [] as RegionMark[],
  photoId: 'photo-after',
}

const stubStageRect = (stage: HTMLElement) => {
  vi.spyOn(stage, 'getBoundingClientRect').mockReturnValue({
    left: 0, top: 0, width: 200, height: 400,
    right: 200, bottom: 400, x: 0, y: 0,
    toJSON: () => ({}),
  })
}

const openPanelAt = async (
  utils: ReturnType<typeof render>,
  clientX: number,
  clientY: number,
) => {
  const stage = utils.getByRole('button', { name: '在剪后照片上点选问题位置' })
  stubStageRect(stage)
  await fireEvent.click(stage, { clientX, clientY })
}

describe('RegionMarkAnnotator', () => {
  it('adds a mark with relative coordinates after picking region and issue', async () => {
    const utils = render(RegionMarkAnnotator, { props: { ...baseProps } })
    await openPanelAt(utils, 100, 100)

    await fireEvent.click(utils.getByRole('button', { name: '两侧' }))
    await fireEvent.click(utils.getByRole('button', { name: '太短' }))
    await fireEvent.click(utils.getByRole('button', { name: '添加标注' }))

    const events = utils.emitted('update:marks')
    expect(events).toHaveLength(1)
    const [marks] = events![0] as [RegionMark[]]
    expect(marks).toHaveLength(1)
    expect(marks[0]).toMatchObject({
      region: 'sides',
      issue: 'too_short',
      x: 0.5,
      y: 0.25,
      photoId: 'photo-after',
    })
  })

  it('blocks confirming until region and issue are chosen', async () => {
    const utils = render(RegionMarkAnnotator, { props: { ...baseProps } })
    await openPanelAt(utils, 50, 50)

    await fireEvent.click(utils.getByRole('button', { name: '添加标注' }))
    expect(utils.getByRole('alert').textContent).toContain('问题区域')
    expect(utils.emitted('update:marks')).toBeUndefined()
  })

  it('requires a note for custom issues', async () => {
    const utils = render(RegionMarkAnnotator, { props: { ...baseProps } })
    await openPanelAt(utils, 50, 50)

    await fireEvent.click(utils.getByRole('button', { name: '鬓角' }))
    await fireEvent.click(utils.getByRole('button', { name: '自定义' }))
    await fireEvent.click(utils.getByRole('button', { name: '添加标注' }))
    expect(utils.getByRole('alert').textContent).toContain('自定义')

    await fireEvent.update(utils.getByLabelText('一句话说明'), '剃成直角了')
    await fireEvent.click(utils.getByRole('button', { name: '添加标注' }))
    const [marks] = utils.emitted('update:marks')![0] as [RegionMark[]]
    expect(marks[0]).toMatchObject({ issue: 'custom', note: '剃成直角了' })
  })

  it('cancels a pending mark without emitting', async () => {
    const utils = render(RegionMarkAnnotator, { props: { ...baseProps } })
    await openPanelAt(utils, 50, 50)
    await fireEvent.click(utils.getByRole('button', { name: '取消' }))
    expect(utils.emitted('update:marks')).toBeUndefined()
    expect(utils.queryByRole('group', { name: '新标注' })).toBeNull()
  })

  it('lists existing marks and removes one on demand', async () => {
    const marks: RegionMark[] = [
      { id: 'm1', region: 'sides', issue: 'too_short', x: 0.2, y: 0.3 },
      { id: 'm2', region: 'top', issue: 'too_thin', x: 0.6, y: 0.1 },
    ]
    const utils = render(RegionMarkAnnotator, { props: { ...baseProps, marks } })
    expect(utils.getByText('两侧 · 太短')).toBeTruthy()
    expect(utils.getByText('顶部 · 太薄')).toBeTruthy()

    await fireEvent.click(utils.getByRole('button', { name: /删除标注 1/ }))
    const [next] = utils.emitted('update:marks')![0] as [RegionMark[]]
    expect(next.map(({ id }) => id)).toEqual(['m2'])
  })

  it('stops accepting new taps at the five mark limit', async () => {
    const marks: RegionMark[] = Array.from({ length: 5 }, (_, index) => ({
      id: `m${index}`,
      region: 'sides',
      issue: 'too_short',
      x: 0.1 * (index + 1),
      y: 0.5,
    }))
    const utils = render(RegionMarkAnnotator, { props: { ...baseProps, marks } })
    const stage = utils.getByRole('button', { name: '在剪后照片上点选问题位置' })
    expect((stage as HTMLButtonElement).disabled).toBe(true)
    expect(utils.container.textContent).toContain('最多标注 5 个位置')
  })
})
