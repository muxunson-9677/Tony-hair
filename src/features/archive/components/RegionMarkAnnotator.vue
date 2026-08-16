<script setup lang="ts">
import { computed, ref } from 'vue'

import {
  HAIR_REGIONS,
  ISSUE_LABELS,
  REGION_LABELS,
  REGION_MARK_ISSUES,
  REGION_MARK_LIMIT,
  REGION_MARK_NOTE_LIMIT,
  regionMarkSummary,
  regionMarkValidationError,
} from '../regionMarks'
import type { HairRegion, RegionMark, RegionMarkIssue } from '../types'
import { tactileDirective as vTactile } from '../../../ui/tactile'

const props = defineProps<{
  photoUrl: string
  photoAlt: string
  marks: readonly RegionMark[]
  photoId?: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:marks': [marks: RegionMark[]]
}>()

interface PendingMark {
  x: number
  y: number
  region: HairRegion | null
  issue: RegionMarkIssue | null
  note: string
}

const pending = ref<PendingMark | null>(null)
const pendingError = ref<string | null>(null)

const limitReached = computed(() => props.marks.length >= REGION_MARK_LIMIT)

const placePendingMark = (event: MouseEvent) => {
  if (props.disabled || limitReached.value) {
    return
  }
  const stage = event.currentTarget as HTMLElement
  const rect = stage.getBoundingClientRect()
  const x = rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0.5
  const y = rect.height > 0 ? (event.clientY - rect.top) / rect.height : 0.5
  pending.value = {
    x: Math.min(Math.max(x, 0), 1),
    y: Math.min(Math.max(y, 0), 1),
    region: null,
    issue: null,
    note: '',
  }
  pendingError.value = null
}

const cancelPending = () => {
  pending.value = null
  pendingError.value = null
}

const confirmPending = () => {
  const draft = pending.value
  if (!draft) {
    return
  }
  if (!draft.region || !draft.issue) {
    pendingError.value = '请选择问题区域和问题类型。'
    return
  }
  const mark: RegionMark = {
    id: crypto.randomUUID(),
    region: draft.region,
    issue: draft.issue,
    note: draft.note.trim() || undefined,
    x: draft.x,
    y: draft.y,
    photoId: props.photoId,
  }
  const validationError = regionMarkValidationError(mark)
  if (validationError) {
    pendingError.value = validationError
    return
  }
  emit('update:marks', [...props.marks, mark])
  cancelPending()
}

const removeMark = (id: string) => {
  emit('update:marks', props.marks.filter((mark) => mark.id !== id))
}

const dotStyle = (x: number, y: number) => ({
  left: `${(x * 100).toFixed(2)}%`,
  top: `${(y * 100).toFixed(2)}%`,
})
</script>

<template>
  <div class="region-annotator">
    <p class="region-annotator__hint">
      {{ limitReached
        ? `最多标注 ${REGION_MARK_LIMIT} 个位置，删除一条后可继续。`
        : '点照片上出问题的位置，选区域和问题。不标也不影响保存。' }}
    </p>

    <button
      type="button"
      class="region-annotator__stage"
      :disabled="disabled || limitReached"
      aria-label="在剪后照片上点选问题位置"
      @click="placePendingMark"
    >
      <img
        :src="photoUrl"
        :alt="photoAlt"
      >
      <span
        v-for="(mark, index) in marks"
        :key="mark.id"
        class="region-annotator__dot"
        :style="dotStyle(mark.x, mark.y)"
        aria-hidden="true"
      >{{ index + 1 }}</span>
      <span
        v-if="pending"
        class="region-annotator__dot region-annotator__dot--pending"
        :style="dotStyle(pending.x, pending.y)"
        aria-hidden="true"
      >{{ marks.length + 1 }}</span>
    </button>

    <div
      v-if="pending"
      class="region-annotator__panel"
      role="group"
      aria-label="新标注"
    >
      <fieldset class="region-annotator__chips">
        <legend>问题区域</legend>
        <button
          v-for="region in HAIR_REGIONS"
          :key="region"
          v-tactile
          type="button"
          class="region-annotator__chip"
          :aria-pressed="pending.region === region"
          @click="pending.region = region"
        >
          {{ REGION_LABELS[region] }}
        </button>
      </fieldset>
      <fieldset class="region-annotator__chips">
        <legend>问题类型</legend>
        <button
          v-for="issue in REGION_MARK_ISSUES"
          :key="issue"
          v-tactile
          type="button"
          class="region-annotator__chip"
          :aria-pressed="pending.issue === issue"
          @click="pending.issue = issue"
        >
          {{ ISSUE_LABELS[issue] }}
        </button>
      </fieldset>
      <label
        v-if="pending.issue === 'custom'"
        class="region-annotator__note"
      >
        <span>一句话说明</span>
        <input
          v-model="pending.note"
          :maxlength="REGION_MARK_NOTE_LIMIT"
          placeholder="例如：鬓角剃成直角了"
        >
      </label>
      <p
        v-if="pendingError"
        class="region-annotator__error"
        role="alert"
      >
        {{ pendingError }}
      </p>
      <div class="region-annotator__panel-actions">
        <button
          v-tactile
          type="button"
          class="region-annotator__confirm"
          @click="confirmPending"
        >
          添加标注
        </button>
        <button
          v-tactile
          type="button"
          class="region-annotator__cancel"
          @click="cancelPending"
        >
          取消
        </button>
      </div>
    </div>

    <ol
      v-if="marks.length > 0"
      class="region-annotator__list"
      aria-label="已标注的问题区域"
    >
      <li
        v-for="(mark, index) in marks"
        :key="mark.id"
      >
        <span
          class="region-annotator__list-index"
          aria-hidden="true"
        >{{ index + 1 }}</span>
        <span class="region-annotator__list-text">{{ regionMarkSummary(mark) }}</span>
        <button
          v-tactile
          type="button"
          class="region-annotator__remove"
          :aria-label="`删除标注 ${index + 1}：${regionMarkSummary(mark)}`"
          :disabled="disabled"
          @click="removeMark(mark.id)"
        >
          删除
        </button>
      </li>
    </ol>
  </div>
</template>
