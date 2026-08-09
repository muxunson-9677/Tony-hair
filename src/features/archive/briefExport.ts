export interface BriefExportContent {
  readonly planTitle: string
  readonly candidateName: string
  readonly imageSource: string | Blob
  readonly overall: string
  readonly top: string
  readonly fringe: string
  readonly sides: string
  readonly sideburns: string
  readonly back: string
  readonly topPriorities: readonly string[]
  readonly absoluteAvoids: readonly string[]
}

export interface BriefExportTextRun {
  readonly text: string
  readonly x: number
  readonly y: number
  readonly font: string
  readonly color: string
}

export interface BriefExportLayout {
  readonly width: number
  readonly height: number
  readonly image: {
    readonly x: number
    readonly y: number
    readonly width: number
    readonly height: number
  }
  readonly textRuns: readonly BriefExportTextRun[]
}

export interface BriefExportDependencies {
  readonly createCanvas: () => HTMLCanvasElement
  readonly loadImage: (source: string) => Promise<CanvasImageSource>
  readonly createObjectURL: (blob: Blob) => string
  readonly revokeObjectURL: (url: string) => void
  readonly createAnchor: () => HTMLAnchorElement
}

export interface BriefExportResult {
  readonly blob: Blob
  readonly filename: string
  readonly width: number
  readonly height: number
}

type MeasureText = (text: string, font: string) => number

const WIDTH = 1440
const PADDING = 96
const CONTENT_WIDTH = WIDTH - PADDING * 2
const PAPER = '#f3efe5'
const INK = '#171512'
const WARM_GRAY = '#6f685e'
const ACCENT = '#914d34'

const wrapText = (
  text: string,
  maxWidth: number,
  font: string,
  measureText: MeasureText,
) => {
  const characters = Array.from(text.trim())
  if (characters.length === 0) {
    return ['']
  }

  const lines: string[] = []
  let current = ''
  for (const character of characters) {
    const next = current + character
    if (current && measureText(next, font) > maxWidth) {
      lines.push(current)
      current = character
    } else {
      current = next
    }
  }
  if (current) {
    lines.push(current)
  }
  return lines
}

export const createBriefExportLayout = (
  content: BriefExportContent,
  measureText: MeasureText,
): BriefExportLayout => {
  const textRuns: BriefExportTextRun[] = []
  let y = PADDING

  const addLine = (text: string, font: string, color: string, lineHeight: number) => {
    textRuns.push({ text, x: PADDING, y, font, color })
    y += lineHeight
  }
  const addWrapped = (
    text: string,
    font: string,
    color: string,
    lineHeight: number,
    maxWidth = CONTENT_WIDTH,
    x = PADDING,
  ) => {
    for (const line of wrapText(text, maxWidth, font, measureText)) {
      textRuns.push({ text: line, x, y, font, color })
      y += lineHeight
    }
  }

  addLine('咋剪发 · 理发师沟通卡', '700 28px sans-serif', ACCENT, 52)
  addWrapped(content.planTitle, '900 64px sans-serif', INK, 76)
  addWrapped(`目标方案 · ${content.candidateName}`, '700 32px sans-serif', WARM_GRAY, 46)
  y += 28

  const image = {
    x: PADDING,
    y,
    width: CONTENT_WIDTH,
    height: 720,
  }
  y += image.height + 72

  const sections = [
    ['整体', content.overall],
    ['顶部', content.top],
    ['刘海', content.fringe],
    ['两侧', content.sides],
    ['鬓角', content.sideburns],
    ['后脑', content.back],
  ] as const
  for (const [label, value] of sections) {
    addLine(label, '800 25px sans-serif', ACCENT, 38)
    addWrapped(value, '600 38px sans-serif', INK, 56)
    y += 30
  }

  const addList = (label: string, items: readonly string[], marker: string) => {
    addLine(label, '900 38px sans-serif', INK, 62)
    for (const [index, item] of items.entries()) {
      addWrapped(
        `${marker}${index + 1}  ${item}`,
        '650 34px sans-serif',
        label === '绝对不要' ? ACCENT : INK,
        52,
        CONTENT_WIDTH - 32,
        PADDING + 32,
      )
      y += 12
    }
    y += 38
  }
  addList('最在意', content.topPriorities, '0')
  addList('绝对不要', content.absoluteAvoids, '×')

  y += 18
  addLine('请现场确认', '900 44px sans-serif', ACCENT, 64)
  addWrapped(
    '请理发师结合真实发质、发量与头型现场确认，再决定最终长度和层次。',
    '600 29px sans-serif',
    WARM_GRAY,
    44,
  )

  return {
    width: WIDTH,
    height: Math.ceil(y + PADDING),
    image,
    textRuns,
  }
}

export const isLocalBriefImageSource = (source: string, pageUrl: string) => {
  if (source.startsWith('data:')) {
    return true
  }
  try {
    const page = new URL(pageUrl)
    const resolved = new URL(source, page)
    return resolved.origin === page.origin
  } catch {
    return false
  }
}

const assertLocalImageSource = (source: string) => {
  if (!isLocalBriefImageSource(source, window.location.href)) {
    throw new Error('沟通卡只允许导出当前设备或本站图片')
  }
}

const loadBrowserImage = async (source: string): Promise<CanvasImageSource> => {
  assertLocalImageSource(source)
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('目标图片读取失败'))
    image.src = source
  })
}

const defaultDependencies: BriefExportDependencies = {
  createCanvas: () => document.createElement('canvas'),
  loadImage: loadBrowserImage,
  createObjectURL: (blob) => URL.createObjectURL(blob),
  revokeObjectURL: (url) => URL.revokeObjectURL(url),
  createAnchor: () => {
    const anchor = document.createElement('a')
    document.body.append(anchor)
    return anchor
  },
}

const sourceSize = (image: CanvasImageSource) => {
  const value = image as {
    readonly naturalWidth?: number
    readonly naturalHeight?: number
    readonly videoWidth?: number
    readonly videoHeight?: number
    readonly width?: number
    readonly height?: number
  }
  return {
    width: value.naturalWidth ?? value.videoWidth ?? value.width ?? 1,
    height: value.naturalHeight ?? value.videoHeight ?? value.height ?? 1,
  }
}

const drawCoverImage = (
  context: CanvasRenderingContext2D,
  image: CanvasImageSource,
  frame: BriefExportLayout['image'],
) => {
  const source = sourceSize(image)
  const sourceRatio = source.width / source.height
  const targetRatio = frame.width / frame.height
  let sourceX = 0
  let sourceY = 0
  let sourceWidth = source.width
  let sourceHeight = source.height

  if (sourceRatio > targetRatio) {
    sourceWidth = source.height * targetRatio
    sourceX = (source.width - sourceWidth) / 2
  } else {
    sourceHeight = source.width / targetRatio
    sourceY = (source.height - sourceHeight) / 2
  }
  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    frame.x,
    frame.y,
    frame.width,
    frame.height,
  )
}

const canvasToPng = (canvas: HTMLCanvasElement) => new Promise<Blob>((resolve, reject) => {
  canvas.toBlob((blob) => {
    if (blob) {
      resolve(blob)
    } else {
      reject(new Error('PNG 编码失败'))
    }
  }, 'image/png')
})

const safeFilenamePart = (value: string) => (
  Array.from(value, (character) => character.charCodeAt(0) < 32 ? '-' : character)
    .join('')
    .replace(/[<>:"/\\|?*]+/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/-+/g, '-')
    .replace(/^[ .-]+|[ .-]+$/g, '')
    .slice(0, 48)
  || '沟通卡'
)

export const exportBriefPng = async (
  content: BriefExportContent,
  overrides: Partial<BriefExportDependencies> = {},
): Promise<BriefExportResult> => {
  const dependencies = { ...defaultDependencies, ...overrides }
  const canvas = dependencies.createCanvas()
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('当前浏览器无法创建 PNG 画布')
  }
  const layout = createBriefExportLayout(content, (text, font) => {
    context.font = font
    return context.measureText(text).width
  })
  canvas.width = layout.width
  canvas.height = layout.height

  context.fillStyle = PAPER
  context.fillRect(0, 0, layout.width, layout.height)
  let sourceObjectUrl: string | undefined
  let image: CanvasImageSource
  try {
    const source = content.imageSource instanceof Blob
      ? (sourceObjectUrl = dependencies.createObjectURL(content.imageSource))
      : content.imageSource
    image = await dependencies.loadImage(source)
  } finally {
    if (sourceObjectUrl) {
      dependencies.revokeObjectURL(sourceObjectUrl)
    }
  }
  drawCoverImage(context, image, layout.image)

  context.textAlign = 'left'
  context.textBaseline = 'alphabetic'
  for (const run of layout.textRuns) {
    context.font = run.font
    context.fillStyle = run.color
    context.fillText(run.text, run.x, run.y)
  }

  const blob = await canvasToPng(canvas)
  const filename = `咋剪发-${safeFilenamePart(content.planTitle)}-${safeFilenamePart(content.candidateName)}.png`
  const objectUrl = dependencies.createObjectURL(blob)
  let anchor: HTMLAnchorElement | undefined
  try {
    anchor = dependencies.createAnchor()
    anchor.href = objectUrl
    anchor.download = filename
    anchor.click()
  } finally {
    anchor?.remove()
    dependencies.revokeObjectURL(objectUrl)
  }
  return { blob, filename, width: layout.width, height: layout.height }
}
