import { describe, expect, it } from 'vitest'

import {
  SHARE_BRAND_MARK,
  SHARE_CARD_HEIGHT,
  SHARE_CARD_WIDTH,
  SHARE_LIST_LIMIT,
  buildAvoidCard,
  buildBriefCard,
  buildChooseCard,
  buildCompareCard,
  buildReviewCard,
  truncateShareText,
  type ShareCardLayout,
} from './shareCards'

const allLayouts = (): ShareCardLayout[] => [
  buildCompareCard({
    styleName: '清爽短碎发', date: '2026-08-13', satisfaction: 5,
    beforeKey: 'before', afterKey: 'after',
  }),
  buildReviewCard({
    styleName: '清爽短碎发', date: '2026-08-13', satisfaction: 4,
    outcome: 'adjust', lines: ['两侧留长一点'], photoKey: 'after',
  }),
  buildAvoidCard({
    styleName: '翻车短发', date: '2026-08-13', avoidLines: ['两侧不要推白'],
    regionMarks: [{ id: 'm1', region: 'sides', issue: 'too_short', x: 0.4, y: 0.6 }],
    photoKey: 'after',
  }),
  buildBriefCard({
    planTitle: '下次这么剪', candidateName: '齐颌短鲍伯', referenceKey: 'reference',
    topPriorities: ['两侧不要炸'], absoluteAvoids: ['不要推白'],
  }),
  buildChooseCard({
    optionAName: '齐颌短鲍伯', optionBName: '纹理短碎发',
    optionAKey: 'a', optionBKey: 'b',
  }),
]

describe('share card layouts', () => {
  it('always renders in 3:4 at 1080x1440 with the brand mark and no QR element', () => {
    for (const layout of allLayouts()) {
      expect(layout.width).toBe(SHARE_CARD_WIDTH)
      expect(layout.height).toBe(SHARE_CARD_HEIGHT)
      expect(layout.texts.some(({ text }) => text === SHARE_BRAND_MARK)).toBe(true)
      const serialized = JSON.stringify(layout)
      expect(serialized).not.toMatch(/qr|二维码/i)
      expect(serialized).not.toMatch(/localhost|127\.0\.0\.1|http:/)
    }
  })

  it('truncates long Chinese titles and list lines with an ellipsis', () => {
    const longName = '超级无敌特别长的一个发型名称肯定放不下了吧'
    const layout = buildCompareCard({
      styleName: longName, date: '2026-08-13', satisfaction: 3,
      beforeKey: 'b', afterKey: 'a',
    })
    const title = layout.texts.find(({ fontSize }) => fontSize === 66)
    expect(title?.text.endsWith('…')).toBe(true)
    expect(title?.text.length).toBeLessThan(longName.length)
  })

  it('keeps review lists at three lines maximum', () => {
    const layout = buildReviewCard({
      styleName: '复盘', date: '2026-08-13', satisfaction: 3, outcome: 'adjust',
      lines: ['一', '二', '三', '四', '五'],
    })
    expect(layout.texts.filter(({ text }) => text.startsWith('· '))).toHaveLength(SHARE_LIST_LIMIT)
  })

  it('numbers region marks on the avoid card photo and in the legend', () => {
    const layout = buildAvoidCard({
      styleName: '翻车', date: '2026-08-13', avoidLines: [],
      regionMarks: [
        { id: 'm1', region: 'sides', issue: 'too_short', x: 0.4, y: 0.6 },
        { id: 'm2', region: 'sideburns', issue: 'custom', note: '剃成直角', x: 0.8, y: 0.7 },
      ],
      photoKey: 'after',
    })
    expect(layout.photos[0]?.dots).toEqual([
      { x: 0.4, y: 0.6, label: '1' },
      { x: 0.8, y: 0.7, label: '2' },
    ])
    expect(layout.texts.some(({ text }) => text === '1. 两侧 · 太短')).toBe(true)
    expect(layout.texts.some(({ text }) => text === '2. 鬓角 · 剃成直角')).toBe(true)
  })

  it('never fabricates an AI result: the brief effect slot is an explicit placeholder', () => {
    const layout = buildBriefCard({
      planTitle: '计划', candidateName: '齐颌短鲍伯', referenceKey: 'reference',
      topPriorities: [], absoluteAvoids: [],
    })
    expect(layout.texts.some(({ text }) => text === '效果位 · 期待剪后')).toBe(true)
    // 只有参考图一个照片槽，效果位不复制参考图冒充效果。
    expect(layout.photos).toHaveLength(1)
    expect(layout.photos[0]?.key).toBe('reference')
  })

  it('builds the choose card with exactly two labelled options and no poll wording', () => {
    const layout = buildChooseCard({
      optionAName: '方案甲', optionBName: '方案乙', optionAKey: 'a', optionBKey: 'b',
    })
    expect(layout.photos).toHaveLength(2)
    expect(layout.texts.some(({ text }) => text.startsWith('A · '))).toBe(true)
    expect(layout.texts.some(({ text }) => text.startsWith('B · '))).toBe(true)
    expect(JSON.stringify(layout)).not.toMatch(/投票|vote/i)
  })
})

describe('truncateShareText', () => {
  it('keeps short text untouched', () => {
    expect(truncateShareText('两侧不要推白', 22)).toBe('两侧不要推白')
  })

  it('counts ASCII as narrow characters', () => {
    const text = 'a'.repeat(40)
    expect(truncateShareText(text, 22)).toBe(text)
  })

  it('cuts overflowing text and appends an ellipsis', () => {
    const result = truncateShareText('这是一段非常非常非常非常长的中文文本内容', 10)
    expect(result.endsWith('…')).toBe(true)
    expect(result.length).toBeLessThanOrEqual(10)
  })
})
