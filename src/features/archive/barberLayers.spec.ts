import { describe, expect, it } from 'vitest'

import {
  BARBER_FACE_INFO_LIMIT,
  BARBER_FOCUS_LIMIT,
  buildBarberLayers,
} from './barberLayers'

const baseInput = {
  planTitle: '夏末短发计划',
  targetName: '齐颌短鲍伯',
  backupName: '纹理短碎发',
  topPriorities: ['露耳', '两侧保留 6mm'],
  absoluteAvoids: ['不要推白'],
  sections: [
    { label: '整体', text: '轻盈轮廓' },
    { label: '顶部', text: '保留支撑' },
    { label: '刘海', text: '自然露额' },
    { label: '两侧', text: '贴而不铲' },
    { label: '鬓角', text: '修顺即可' },
    { label: '后脑', text: '自然收' },
  ],
}

describe('buildBarberLayers', () => {
  it('puts identity info on the face and focus lists in layer two', () => {
    const layers = buildBarberLayers(baseInput)
    expect(layers.face.infoItems).toEqual([
      '夏末短发计划',
      '目标方案 · 齐颌短鲍伯',
      '备选 · 纹理短碎发',
      '请现场确认：结合真实发质、发量与头型再定长度和层次',
    ])
    expect(layers.focus.topPriorities).toEqual(['露耳', '两侧保留 6mm'])
    expect(layers.focus.absoluteAvoids).toEqual(['不要推白'])
    expect(layers.folded.sections).toEqual(baseInput.sections)
    expect(layers.folded.overflowPriorities).toEqual([])
    expect(layers.folded.overflowAvoids).toEqual([])
  })

  it('omits the backup line when no backup exists', () => {
    const layers = buildBarberLayers({ ...baseInput, backupName: undefined })
    expect(layers.face.infoItems).not.toContain('备选 · 纹理短碎发')
  })

  it('never exceeds one image worth of face info and folds instead of overflowing', () => {
    const layers = buildBarberLayers({
      ...baseInput,
      topPriorities: Array.from({ length: 10 }, (_, index) => `在意 ${index + 1}`),
      absoluteAvoids: Array.from({ length: 10 }, (_, index) => `避免 ${index + 1}`),
    })
    expect(layers.face.infoItems.length).toBeLessThanOrEqual(BARBER_FACE_INFO_LIMIT)
    expect(layers.focus.topPriorities).toHaveLength(BARBER_FOCUS_LIMIT)
    expect(layers.focus.absoluteAvoids).toHaveLength(BARBER_FOCUS_LIMIT)
    expect(layers.folded.overflowPriorities).toEqual(
      Array.from({ length: 7 }, (_, index) => `在意 ${index + 4}`),
    )
    expect(layers.folded.overflowAvoids).toEqual(
      Array.from({ length: 7 }, (_, index) => `避免 ${index + 4}`),
    )
  })

  it('keeps every input item somewhere: nothing is silently dropped', () => {
    const topPriorities = Array.from({ length: 8 }, (_, index) => `P${index}`)
    const absoluteAvoids = Array.from({ length: 5 }, (_, index) => `A${index}`)
    const layers = buildBarberLayers({ ...baseInput, topPriorities, absoluteAvoids })
    expect([...layers.focus.topPriorities, ...layers.folded.overflowPriorities]).toEqual(topPriorities)
    expect([...layers.focus.absoluteAvoids, ...layers.folded.overflowAvoids]).toEqual(absoluteAvoids)
  })

  it('drops blank entries and blank sections before layering', () => {
    const layers = buildBarberLayers({
      ...baseInput,
      topPriorities: ['  ', '露耳'],
      absoluteAvoids: [''],
      sections: [
        { label: '整体', text: ' ' },
        { label: '顶部', text: '保留支撑' },
      ],
    })
    expect(layers.focus.topPriorities).toEqual(['露耳'])
    expect(layers.focus.absoluteAvoids).toEqual([])
    expect(layers.folded.sections).toEqual([{ label: '顶部', text: '保留支撑' }])
  })
})
