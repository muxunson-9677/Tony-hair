<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import {
  decodeBrowserImage,
  ImagePreparationError,
  prepareLocalImage,
  type DecodedLocalImage,
  type PreparedLocalImage,
} from '../images/prepareLocalImage'
import { drawOpaqueMask, flattenMask } from './flattenMask'
import { MaskEngine } from './MaskEngine'
import {
  clampMaskTransform,
  nudgeMaskTransform,
  transformFromPreviewDrag,
} from './maskGeometry'
import {
  MASK_STYLES,
  type MaskDetectionOutcome,
  type MaskExportResult,
  type MaskStyle,
  type MaskTransform,
} from './types'
import { tactileDirective as vTactile } from '../../ui/tactile'

type EditorState = 'idle' | 'preparing' | 'detecting' | 'confirm' | 'editing' | 'blocked' | 'error'
type EditorStatus = { readonly state: EditorState, readonly detection?: MaskDetectionOutcome['kind'] }

const props = withDefaults(defineProps<{
  readonly initialBlob?: Blob
  readonly allowSelection?: boolean
}>(), {
  initialBlob: undefined,
  allowSelection: true,
})

const emit = defineEmits<{
  exported: [result: MaskExportResult]
  status: [status: EditorStatus]
}>()

const DEFAULT_TRANSFORM: MaskTransform = {
  centerX: 0.5,
  centerY: 0.43,
  width: 0.58,
  height: 0.3,
  rotation: 0,
}

const engine = new MaskEngine()
const canvas = ref<HTMLCanvasElement | null>(null)
const state = ref<EditorState>('idle')
const statusMessage = ref('选择照片后，只在当前浏览器内处理。')
const source = ref<PreparedLocalImage | null>(null)
const previewImage = ref<DecodedLocalImage | null>(null)
const transform = ref<MaskTransform>({ ...DEFAULT_TRANSFORM })
const style = ref<MaskStyle>('editorial_bar')
const exporting = ref(false)
let generation = 0
let unmounted = false
let dragging: { x: number, y: number, pointerId: number } | null = null

const readableBytes = (bytes: number) => bytes < 1024 * 1024
  ? `${(bytes / 1024).toFixed(1)} KB`
  : `${(bytes / (1024 * 1024)).toFixed(2)} MB`

const preparedSummary = computed(() => source.value
  ? `${source.value.width} × ${source.value.height} · ${readableBytes(source.value.bytes)}`
  : '')

const canEdit = computed(() => state.value === 'editing')

const releasePreviewImage = () => {
  previewImage.value?.close()
  previewImage.value = null
}

const renderPreview = async () => {
  await nextTick()
  const target = canvas.value
  const preview = previewImage.value
  if (!target || !preview) {
    return
  }
  target.width = preview.width
  target.height = preview.height
  const context = target.getContext('2d')
  if (!context) {
    return
  }
  context.clearRect(0, 0, target.width, target.height)
  context.drawImage(
    preview.source as Parameters<typeof context.drawImage>[0],
    0,
    0,
    target.width,
    target.height,
  )
  if (state.value === 'confirm' || state.value === 'editing') {
    drawOpaqueMask(
      context as unknown as Parameters<typeof drawOpaqueMask>[0],
      target.width,
      target.height,
      transform.value,
      style.value,
    )
  }
}

watch([transform, style, state, previewImage], () => { void renderPreview() }, { deep: true })
watch(state, (nextState) => emit('status', { state: nextState }))

const enterManualMode = (message: string) => {
  transform.value = { ...DEFAULT_TRANSFORM }
  state.value = 'editing'
  statusMessage.value = message
}

const applyDetectionOutcome = (outcome: MaskDetectionOutcome, requestGeneration: number) => {
  if (unmounted || requestGeneration !== generation) {
    return
  }
  emit('status', { state: state.value, detection: outcome.kind })
  if (outcome.kind === 'single') {
    transform.value = outcome.transform
    state.value = 'confirm'
    statusMessage.value = '已自动放置初始遮罩，请确认后再调整。'
  } else if (outcome.kind === 'multiple') {
    state.value = 'blocked'
    statusMessage.value = '检测到多人。为避免漏遮，不能切换手动或导出；请改选只有一人的照片。'
  } else if (outcome.kind === 'none') {
    enterManualMode('没有定位到单张人脸，已进入完全手动模式。')
  } else if (outcome.code !== 'stale_result') {
    enterManualMode('自动定位不可用，已进入完全手动模式。照片仍只在本机处理。')
  }
}

const processSource = async (blob: Blob) => {
  const requestGeneration = generation + 1
  generation = requestGeneration
  engine.cancelCurrent(requestGeneration)
  releasePreviewImage()
  source.value = null
  state.value = 'preparing'
  statusMessage.value = '正在本地纠正方向、压缩并清除照片元数据…'

  try {
    const prepared = await prepareLocalImage(blob)
    if (unmounted || requestGeneration !== generation) {
      return
    }
    const preview = await decodeBrowserImage(prepared.blob)
    if (unmounted || requestGeneration !== generation) {
      preview.close()
      return
    }
    source.value = prepared
    previewImage.value = preview
    state.value = 'detecting'
    statusMessage.value = '正在当前设备内定位一张人脸；你也可以立即改为手动。'
    await renderPreview()

    let detectionBitmap: ImageBitmap
    try {
      if (typeof createImageBitmap !== 'function') {
        throw new Error('ImageBitmap is unavailable')
      }
      detectionBitmap = await createImageBitmap(prepared.blob, { imageOrientation: 'none' })
    } catch {
      enterManualMode('无法启动自动定位，已进入完全手动模式。')
      return
    }
    const outcome = await engine.detect(detectionBitmap, requestGeneration)
    applyDetectionOutcome(outcome, requestGeneration)
  } catch (caught) {
    if (unmounted || requestGeneration !== generation) {
      return
    }
    state.value = 'error'
    statusMessage.value = caught instanceof ImagePreparationError
      ? caught.message
      : '照片处理失败，请换一张后重试。'
  }
}

const selectSource = async (event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file) {
    await processSource(file)
  }
}

const useManualNow = () => {
  const nextGeneration = generation + 1
  generation = nextGeneration
  engine.cancelCurrent(nextGeneration)
  enterManualMode('已停止自动定位，请手动移动和调整遮罩。')
}

const confirmAutomaticPosition = () => {
  state.value = 'editing'
  statusMessage.value = '初始位置已确认；请检查遮罩是否覆盖你想隐藏的区域。'
}

const setTransformValue = (key: 'width' | 'height' | 'rotation', event: Event) => {
  transform.value = clampMaskTransform({
    ...transform.value,
    [key]: Number((event.target as HTMLInputElement).value),
  })
}

const nudge = (x: number, y: number) => {
  if (canEdit.value) {
    transform.value = nudgeMaskTransform(transform.value, x, y)
  }
}

const onCanvasKeydown = (event: KeyboardEvent) => {
  const directions: Partial<Record<string, readonly [number, number]>> = {
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
  }
  const direction = directions[event.key]
  if (!canEdit.value || !direction) {
    return
  }
  event.preventDefault()
  nudge(direction[0], direction[1])
}

const onPointerDown = (event: PointerEvent) => {
  if (!canEdit.value) {
    return
  }
  dragging = { x: event.clientX, y: event.clientY, pointerId: event.pointerId }
  ;(event.currentTarget as HTMLCanvasElement).setPointerCapture?.(event.pointerId)
}

const onPointerMove = (event: PointerEvent) => {
  if (!dragging || dragging.pointerId !== event.pointerId || !canvas.value) {
    return
  }
  const bounds = canvas.value.getBoundingClientRect()
  transform.value = transformFromPreviewDrag(
    transform.value,
    event.clientX - dragging.x,
    event.clientY - dragging.y,
    bounds.width,
    bounds.height,
  )
  dragging = { ...dragging, x: event.clientX, y: event.clientY }
}

const stopDragging = (event: PointerEvent) => {
  if (dragging?.pointerId === event.pointerId) {
    dragging = null
  }
}

const exportFlattened = async () => {
  if (!source.value || !canEdit.value || exporting.value) {
    return
  }
  exporting.value = true
  const exportGeneration = generation
  const exportSource = source.value.blob
  statusMessage.value = '正在本地合并照片与遮罩…'
  try {
    const result = await flattenMask(exportSource, transform.value, style.value)
    if (unmounted || exportGeneration !== generation || source.value?.blob !== exportSource) {
      return
    }
    emit('exported', result)
    statusMessage.value = `单层图片已生成 · ${readableBytes(result.bytes)}`
  } catch {
    if (!unmounted && exportGeneration === generation && source.value?.blob === exportSource) {
      statusMessage.value = '遮罩图片导出失败，请调整后重试。'
    }
  } finally {
    exporting.value = false
  }
}

watch(() => props.initialBlob, (nextBlob) => {
  if (nextBlob) {
    void processSource(nextBlob)
  }
})

onMounted(() => {
  if (props.initialBlob) {
    void processSource(props.initialBlob)
  }
})

onBeforeUnmount(() => {
  unmounted = true
  generation += 1
  releasePreviewImage()
  void engine.dispose()
})
</script>

<template>
  <section
    class="mask-editor"
    data-testid="mask-editor"
    aria-labelledby="mask-workbench-title"
  >
    <header class="mask-editor__header">
      <p>LOCAL WORKBENCH</p>
      <h2 id="mask-workbench-title">
        遮住后，再导出
      </h2>
      <span>自动定位只给出初始位置，不承诺完全遮住；请你亲自确认。</span>
    </header>

    <label
      v-if="allowSelection"
      v-tactile
      class="mask-file-control"
    >
      <span>{{ source ? '换一张照片' : '选择本人或已授权照片' }}</span>
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        @change="selectSource"
      >
    </label>

    <p
      class="mask-status"
      :class="{ 'mask-status--blocked': state === 'blocked' || state === 'error' }"
      :role="state === 'blocked' || state === 'error' ? 'alert' : 'status'"
      aria-live="polite"
    >
      {{ statusMessage }}
      <small v-if="preparedSummary">{{ preparedSummary }}</small>
    </p>

    <div
      v-if="previewImage"
      class="mask-canvas-frame"
      :class="{ 'mask-canvas-frame--editable': canEdit }"
    >
      <canvas
        ref="canvas"
        role="img"
        aria-label="遮罩编辑画布"
        aria-describedby="mask-canvas-help"
        :tabindex="canEdit ? 0 : -1"
        @keydown="onCanvasKeydown"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="stopDragging"
        @pointercancel="stopDragging"
      />
      <span id="mask-canvas-help">{{ canEdit ? '拖动遮罩，或聚焦画布后用方向键微调' : '照片只在当前设备内' }}</span>
    </div>

    <button
      v-if="state === 'detecting'"
      v-tactile
      class="mask-manual-button"
      type="button"
      @click="useManualNow"
    >
      立即改为手动
    </button>

    <button
      v-if="state === 'confirm'"
      v-tactile
      class="mask-confirm-button"
      type="button"
      @click="confirmAutomaticPosition"
    >
      确认位置并继续
    </button>

    <div
      v-if="canEdit"
      class="mask-controls"
    >
      <fieldset class="mask-style-picker">
        <legend>遮罩材质</legend>
        <label
          v-for="item in MASK_STYLES"
          :key="item"
          v-tactile
        >
          <input
            v-model="style"
            type="radio"
            name="mask-style"
            :value="item"
          >
          <span>{{ item === 'editorial_bar' ? '暖黑编辑条' : item === 'pixel_blocks' ? '像素块' : '纸片' }}</span>
        </label>
      </fieldset>

      <div class="mask-ranges">
        <label>
          <span>宽度</span>
          <input
            :value="transform.width"
            type="range"
            min="0.16"
            max="1"
            step="0.01"
            @input="setTransformValue('width', $event)"
          >
        </label>
        <label>
          <span>高度</span>
          <input
            :value="transform.height"
            type="range"
            min="0.12"
            max="1"
            step="0.01"
            @input="setTransformValue('height', $event)"
          >
        </label>
        <label>
          <span>旋转</span>
          <input
            :value="transform.rotation"
            type="range"
            min="-45"
            max="45"
            step="1"
            @input="setTransformValue('rotation', $event)"
          >
        </label>
      </div>

      <div
        class="mask-nudge-grid"
        aria-label="遮罩微调"
      >
        <button
          v-tactile
          type="button"
          aria-label="向上微调遮罩"
          @click="nudge(0, -1)"
        >
          ↑
        </button>
        <button
          v-tactile
          type="button"
          aria-label="向左微调遮罩"
          @click="nudge(-1, 0)"
        >
          ←
        </button>
        <button
          v-tactile
          type="button"
          aria-label="向右微调遮罩"
          @click="nudge(1, 0)"
        >
          →
        </button>
        <button
          v-tactile
          type="button"
          aria-label="向下微调遮罩"
          @click="nudge(0, 1)"
        >
          ↓
        </button>
      </div>

      <button
        v-tactile
        class="mask-export-button"
        type="button"
        :disabled="exporting"
        @click="exportFlattened"
      >
        {{ exporting ? '正在生成…' : '导出单层遮罩图' }}
      </button>
    </div>
  </section>
</template>
