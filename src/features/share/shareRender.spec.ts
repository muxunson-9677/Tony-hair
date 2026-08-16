import { describe, expect, it } from 'vitest'

import { buildAvoidCard, buildCompareCard } from './shareCards'
import { renderShareCard, type DecodedShareImage, type ShareRenderCanvas, type ShareRenderDependencies } from './shareRender'

interface RecordedOp { readonly op: string, readonly args: readonly unknown[] }

const createRecordingContext = (ops: RecordedOp[], canvasLabel: string) => {
  const record = (op: string) => (...args: unknown[]) => { ops.push({ op: `${canvasLabel}:${op}`, args }) }
  const context = {
    fillRect: record('fillRect'),
    drawImage: record('drawImage'),
    fillText: record('fillText'),
    save: record('save'),
    restore: record('restore'),
    translate: record('translate'),
    rotate: record('rotate'),
    beginPath: record('beginPath'),
    moveTo: record('moveTo'),
    lineTo: record('lineTo'),
    quadraticCurveTo: record('quadraticCurveTo'),
    closePath: record('closePath'),
    clip: record('clip'),
    fill: record('fill'),
    arc: record('arc'),
    fillStyle: '',
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
  }
  return new Proxy(context, {
    set(target, property, value) {
      ops.push({ op: `${canvasLabel}:set:${String(property)}`, args: [value] })
      Reflect.set(target, property, value)
      return true
    },
  }) as unknown as CanvasRenderingContext2D
}

const createHarness = () => {
  const ops: RecordedOp[] = []
  let canvasIndex = 0
  const encoded = new Blob(['png'], { type: 'image/png' })
  const dependencies: ShareRenderDependencies = {
    createCanvas: (width, height) => {
      canvasIndex += 1
      const label = canvasIndex === 1 ? 'main' : `offscreen${canvasIndex - 1}`
      const context = createRecordingContext(ops, label)
      return { width, height, getContext: () => context } as unknown as ShareRenderCanvas
    },
    decodeImage: async (): Promise<DecodedShareImage> => ({
      source: { fake: true } as unknown as CanvasImageSource,
      width: 900,
      height: 1200,
      close: () => { ops.push({ op: 'decoded:close', args: [] }) },
    }),
    encodePng: async () => encoded,
  }
  return { ops, dependencies, encoded }
}

const photo = new Blob(['photo'], { type: 'image/webp' })

describe('renderShareCard', () => {
  it('renders background, rects, photos and texts then encodes a png', async () => {
    const { ops, dependencies, encoded } = createHarness()
    const layout = buildCompareCard({
      styleName: '短碎发', date: '2026-08-13', satisfaction: 5,
      beforeKey: 'before', afterKey: 'after',
    })
    const result = await renderShareCard(layout, { before: photo, after: photo }, dependencies)
    expect(result).toBe(encoded)
    expect(ops[0]?.op).toBe('main:set:fillStyle')
    expect(ops[1]?.op).toBe('main:fillRect')
    expect(ops.filter(({ op }) => op === 'main:drawImage')).toHaveLength(2)
    expect(ops.some(({ op, args }) => op === 'main:fillText' && String(args[0]).includes('本地生成'))).toBe(true)
  })

  it('flattens the mask on an offscreen canvas at source resolution before layout cropping', async () => {
    const { ops, dependencies } = createHarness()
    const layout = buildCompareCard({
      styleName: '短碎发', date: '2026-08-13', satisfaction: 5,
      beforeKey: 'before', afterKey: 'after',
      afterMask: { centerX: 0.5, centerY: 0.35, width: 0.4, height: 0.14, rotation: 0 },
    })
    await renderShareCard(layout, { before: photo, after: photo }, dependencies)

    const offscreenDraw = ops.findIndex(({ op }) => op === 'offscreen1:drawImage')
    const offscreenMaskFill = ops.findIndex(({ op, args }) => op === 'offscreen1:set:fillStyle' && args[0] === '#171512')
    const mainDrawAfterMask = ops.findIndex(({ op }, index) => op === 'main:drawImage' && index > offscreenMaskFill)
    expect(offscreenDraw).toBeGreaterThanOrEqual(0)
    expect(offscreenMaskFill).toBeGreaterThan(offscreenDraw)
    expect(mainDrawAfterMask).toBeGreaterThan(offscreenMaskFill)
  })

  it('draws numbered region dots on top of the avoid photo', async () => {
    const { ops, dependencies } = createHarness()
    const layout = buildAvoidCard({
      styleName: '翻车', date: '2026-08-13', avoidLines: [],
      regionMarks: [{ id: 'm1', region: 'sides', issue: 'too_short', x: 0.5, y: 0.5 }],
      photoKey: 'after',
    })
    await renderShareCard(layout, { after: photo }, dependencies)
    expect(ops.some(({ op }) => op === 'main:arc')).toBe(true)
    expect(ops.some(({ op, args }) => op === 'main:fillText' && args[0] === '1')).toBe(true)
  })

  it('fails loudly when a photo blob is missing', async () => {
    const { dependencies } = createHarness()
    const layout = buildCompareCard({
      styleName: '短碎发', date: '2026-08-13', satisfaction: 5,
      beforeKey: 'before', afterKey: 'after',
    })
    await expect(renderShareCard(layout, { before: photo }, dependencies)).rejects.toThrow('缺少照片')
  })

  it('closes decoded images even for masked slots', async () => {
    const { ops, dependencies } = createHarness()
    const layout = buildCompareCard({
      styleName: '短碎发', date: '2026-08-13', satisfaction: 5,
      beforeKey: 'before', afterKey: 'after',
      beforeMask: { centerX: 0.5, centerY: 0.35, width: 0.4, height: 0.14, rotation: 0 },
    })
    await renderShareCard(layout, { before: photo, after: photo }, dependencies)
    expect(ops.filter(({ op }) => op === 'decoded:close')).toHaveLength(2)
  })
})
