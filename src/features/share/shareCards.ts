import { BARBER_CARD_NAME, PRODUCT_NAME } from '../../config/brand'
import { regionMarkSummary } from '../archive/regionMarks'
import type { RegionMark } from '../archive/types'
import type { MaskTransform } from '../privacy/types'

// 3:4 小红书封面主规格。
export const SHARE_CARD_WIDTH = 1080
export const SHARE_CARD_HEIGHT = 1440

export const SHARE_TITLE_LIMIT = 16
export const SHARE_LINE_LIMIT = 22
export const SHARE_CAPTION_LIMIT = 18
export const SHARE_LIST_LIMIT = 3

export const SHARE_BRAND_MARK = `${PRODUCT_NAME} · 本地生成`

export type ShareKind = 'compare' | 'review' | 'avoid' | 'brief' | 'choose'

export const SHARE_KIND_LABELS: Record<ShareKind, string> = {
  compare: '剪前剪后对比图',
  review: '本次复盘图',
  avoid: '翻车避雷图',
  brief: `${BARBER_CARD_NAME}分享图`,
  choose: '「帮我选」求助图',
}

export interface SharePhotoSlot {
  readonly key: string
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly maskTransform?: MaskTransform
  readonly dots?: readonly { readonly x: number, readonly y: number, readonly label: string }[]
}

export interface ShareTextItem {
  readonly text: string
  readonly x: number
  readonly y: number
  readonly fontSize: number
  readonly fontWeight: number
  readonly color: string
  readonly align?: 'left' | 'center' | 'right'
}

export interface ShareRectItem {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly color: string
  readonly radius?: number
}

export interface ShareCardLayout {
  readonly kind: ShareKind
  readonly width: number
  readonly height: number
  readonly background: string
  readonly rects: readonly ShareRectItem[]
  readonly photos: readonly SharePhotoSlot[]
  readonly texts: readonly ShareTextItem[]
}

const charWidth = (character: string) => (character.charCodeAt(0) <= 0x2ff ? 0.55 : 1)

export const truncateShareText = (value: string, maxChars: number) => {
  const text = value.trim()
  let used = 0
  let cut = text.length
  for (let index = 0; index < text.length; index += 1) {
    used += charWidth(text[index]!)
    if (used > maxChars + 1e-9) {
      cut = index
      break
    }
  }
  return cut >= text.length ? text : `${text.slice(0, Math.max(cut - 1, 0))}…`
}

const INK = '#1d2530'
const SOFT = '#5c6672'
const PAPER = '#f6f4ef'
const CARDBG = '#ffffff'
const ACCENT = '#2f73ee'
const ALERT = '#b0342f'

const brandTexts = (): ShareTextItem[] => [{
  text: SHARE_BRAND_MARK,
  x: SHARE_CARD_WIDTH - 48,
  y: SHARE_CARD_HEIGHT - 52,
  fontSize: 34,
  fontWeight: 700,
  color: SOFT,
  align: 'right',
}]

const headerTexts = (eyebrow: string, title: string): ShareTextItem[] => [
  { text: truncateShareText(eyebrow, SHARE_LINE_LIMIT), x: 72, y: 104, fontSize: 34, fontWeight: 640, color: SOFT },
  { text: truncateShareText(title, SHARE_TITLE_LIMIT), x: 72, y: 186, fontSize: 66, fontWeight: 800, color: INK },
]

export interface CompareCardContent {
  readonly styleName: string
  readonly date: string
  readonly satisfaction: number
  readonly beforeKey: string
  readonly afterKey: string
  readonly beforeMask?: MaskTransform
  readonly afterMask?: MaskTransform
}

export const buildCompareCard = (content: CompareCardContent): ShareCardLayout => ({
  kind: 'compare',
  width: SHARE_CARD_WIDTH,
  height: SHARE_CARD_HEIGHT,
  background: PAPER,
  rects: [
    { x: 48, y: 232, width: SHARE_CARD_WIDTH - 96, height: 980, color: CARDBG, radius: 32 },
  ],
  photos: [
    { key: content.beforeKey, x: 72, y: 256, width: 456, height: 760, maskTransform: content.beforeMask },
    { key: content.afterKey, x: 552, y: 256, width: 456, height: 760, maskTransform: content.afterMask },
  ],
  texts: [
    ...headerTexts('剪前 / 剪后', content.styleName),
    { text: '剪前', x: 300, y: 1084, fontSize: 40, fontWeight: 760, color: SOFT, align: 'center' },
    { text: '剪后', x: 780, y: 1084, fontSize: 40, fontWeight: 760, color: INK, align: 'center' },
    {
      text: `${content.date} · 满意度 ${content.satisfaction}/5`,
      x: 72, y: 1180, fontSize: 38, fontWeight: 640, color: SOFT,
    },
    ...brandTexts(),
  ],
})

export interface ReviewCardContent {
  readonly styleName: string
  readonly date: string
  readonly satisfaction: number
  readonly outcome: 'repeat' | 'adjust' | 'avoid'
  readonly lines: readonly string[]
  readonly photoKey?: string
  readonly photoMask?: MaskTransform
}

const OUTCOME_HEADLINES = {
  repeat: '这次剪对了，下次照着剪',
  adjust: '总体可以，下次微调这些',
  avoid: '这次记为避雷',
} as const

export const buildReviewCard = (content: ReviewCardContent): ShareCardLayout => {
  const lines = content.lines
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, SHARE_LIST_LIMIT)
  const hasPhoto = Boolean(content.photoKey)
  const listX = hasPhoto ? 560 : 72
  return {
    kind: 'review',
    width: SHARE_CARD_WIDTH,
    height: SHARE_CARD_HEIGHT,
    background: PAPER,
    rects: [
      { x: 48, y: 232, width: SHARE_CARD_WIDTH - 96, height: 980, color: CARDBG, radius: 32 },
    ],
    photos: content.photoKey
      ? [{ key: content.photoKey, x: 72, y: 256, width: 456, height: 760, maskTransform: content.photoMask }]
      : [],
    texts: [
      ...headerTexts('理发复盘', content.styleName),
      {
        text: OUTCOME_HEADLINES[content.outcome],
        x: listX, y: 340, fontSize: 46, fontWeight: 800,
        color: content.outcome === 'avoid' ? ALERT : INK,
      },
      ...lines.map((line, index): ShareTextItem => ({
        text: `· ${truncateShareText(line, SHARE_LINE_LIMIT)}`,
        x: listX,
        y: 440 + index * 92,
        fontSize: 40,
        fontWeight: 640,
        color: INK,
      })),
      {
        text: `${content.date} · 满意度 ${content.satisfaction}/5`,
        x: 72, y: 1180, fontSize: 38, fontWeight: 640, color: SOFT,
      },
      ...brandTexts(),
    ],
  }
}

export interface AvoidCardContent {
  readonly styleName: string
  readonly date: string
  readonly avoidLines: readonly string[]
  readonly regionMarks: readonly RegionMark[]
  readonly photoKey?: string
  readonly photoMask?: MaskTransform
}

export const buildAvoidCard = (content: AvoidCardContent): ShareCardLayout => {
  const marks = content.regionMarks.slice(0, 5)
  const lines = [
    ...marks.map(regionMarkSummary),
    ...content.avoidLines.map((line) => line.trim()).filter(Boolean),
  ].slice(0, SHARE_LIST_LIMIT + 2)
  const photoDots = content.photoKey
    ? marks.map((mark, index) => ({ x: mark.x, y: mark.y, label: String(index + 1) }))
    : []
  return {
    kind: 'avoid',
    width: SHARE_CARD_WIDTH,
    height: SHARE_CARD_HEIGHT,
    background: '#211d1a',
    rects: [
      { x: 48, y: 232, width: SHARE_CARD_WIDTH - 96, height: 1020, color: CARDBG, radius: 32 },
    ],
    photos: content.photoKey
      ? [{
        key: content.photoKey,
        x: 72, y: 256, width: 456, height: 760,
        maskTransform: content.photoMask,
        dots: photoDots,
      }]
      : [],
    texts: [
      { text: '这次翻车了，帮你避雷', x: 72, y: 104, fontSize: 34, fontWeight: 640, color: '#d8cfc4' },
      {
        text: truncateShareText(content.styleName, SHARE_TITLE_LIMIT),
        x: 72, y: 186, fontSize: 66, fontWeight: 800, color: '#f6f4ef',
      },
      ...lines.map((line, index): ShareTextItem => ({
        text: `${index + 1}. ${truncateShareText(line, SHARE_LINE_LIMIT)}`,
        x: 560,
        y: 340 + index * 92,
        fontSize: 40,
        fontWeight: 700,
        color: index < marks.length ? ALERT : INK,
      })),
      { text: `${content.date} · 别再这样剪`, x: 72, y: 1180, fontSize: 38, fontWeight: 640, color: SOFT },
      ...brandTexts(),
    ],
  }
}

export interface BriefCardContent {
  readonly planTitle: string
  readonly candidateName: string
  readonly referenceKey?: string
  readonly referenceMask?: MaskTransform
  readonly topPriorities: readonly string[]
  readonly absoluteAvoids: readonly string[]
}

export const buildBriefCard = (content: BriefCardContent): ShareCardLayout => {
  const priorities = content.topPriorities
    .map((line) => line.trim()).filter(Boolean).slice(0, SHARE_LIST_LIMIT)
  const avoids = content.absoluteAvoids
    .map((line) => line.trim()).filter(Boolean).slice(0, SHARE_LIST_LIMIT)
  const texts: ShareTextItem[] = [
    ...headerTexts(`我的${BARBER_CARD_NAME}`, content.planTitle),
    { text: '参考原图', x: 300, y: 1000, fontSize: 38, fontWeight: 760, color: SOFT, align: 'center' },
    // 效果位规则：当前没有真实效果图，明示占位，不伪造 AI。
    { text: '效果位 · 期待剪后', x: 780, y: 1000, fontSize: 38, fontWeight: 760, color: SOFT, align: 'center' },
    { text: truncateShareText(`目标：${content.candidateName}`, SHARE_LINE_LIMIT), x: 72, y: 1082, fontSize: 42, fontWeight: 760, color: INK },
    ...priorities.map((line, index): ShareTextItem => ({
      text: `最在意 · ${truncateShareText(line, SHARE_CAPTION_LIMIT)}`,
      x: 72,
      y: 1160 + index * 66,
      fontSize: 36,
      fontWeight: 640,
      color: ACCENT,
    })),
    ...avoids.map((line, index): ShareTextItem => ({
      text: `不要 · ${truncateShareText(line, SHARE_CAPTION_LIMIT)}`,
      x: 560,
      y: 1160 + index * 66,
      fontSize: 36,
      fontWeight: 640,
      color: ALERT,
    })),
    ...brandTexts(),
  ]
  return {
    kind: 'brief',
    width: SHARE_CARD_WIDTH,
    height: SHARE_CARD_HEIGHT,
    background: PAPER,
    rects: [
      { x: 48, y: 232, width: SHARE_CARD_WIDTH - 96, height: 800, color: CARDBG, radius: 32 },
      // 效果位：留空底色框，规则明示于文字。
      { x: 552, y: 256, width: 456, height: 700, color: '#eef1f4', radius: 24 },
    ],
    photos: content.referenceKey
      ? [{ key: content.referenceKey, x: 72, y: 256, width: 456, height: 700, maskTransform: content.referenceMask }]
      : [],
    texts,
  }
}

export interface ChooseCardContent {
  readonly optionAName: string
  readonly optionBName: string
  readonly optionAKey?: string
  readonly optionBKey?: string
  readonly optionAMask?: MaskTransform
  readonly optionBMask?: MaskTransform
}

export const buildChooseCard = (content: ChooseCardContent): ShareCardLayout => ({
  kind: 'choose',
  width: SHARE_CARD_WIDTH,
  height: SHARE_CARD_HEIGHT,
  background: PAPER,
  rects: [
    { x: 48, y: 232, width: SHARE_CARD_WIDTH - 96, height: 1000, color: CARDBG, radius: 32 },
  ],
  photos: [
    ...(content.optionAKey
      ? [{ key: content.optionAKey, x: 72, y: 256, width: 456, height: 760, maskTransform: content.optionAMask }]
      : []),
    ...(content.optionBKey
      ? [{ key: content.optionBKey, x: 552, y: 256, width: 456, height: 760, maskTransform: content.optionBMask }]
      : []),
  ],
  texts: [
    ...headerTexts('下次剪哪个？', '你觉得哪个适合我'),
    { text: `A · ${truncateShareText(content.optionAName, SHARE_CAPTION_LIMIT)}`, x: 300, y: 1084, fontSize: 40, fontWeight: 760, color: INK, align: 'center' },
    { text: `B · ${truncateShareText(content.optionBName, SHARE_CAPTION_LIMIT)}`, x: 780, y: 1084, fontSize: 40, fontWeight: 760, color: INK, align: 'center' },
    { text: '回我 A 或 B，谢啦', x: 72, y: 1180, fontSize: 38, fontWeight: 640, color: SOFT },
    ...brandTexts(),
  ],
})
