<script setup lang="ts">
import { ref } from 'vue'

import type {
  PrivateReferenceFocusArea,
  PrivateReferenceIntent,
  PrivateReferenceRegion,
} from '../types'
import { tactileDirective as vTactile } from '../../../ui/tactile'

const props = withDefaults(defineProps<{
  readonly modelValue: readonly PrivateReferenceFocusArea[]
  readonly disabled?: boolean
}>(), { disabled: false })

const emit = defineEmits<{
  'update:modelValue': [areas: readonly PrivateReferenceFocusArea[]]
}>()

const regions = [
  { id: 'fringe', label: '刘海', mark: '刘' },
  { id: 'top', label: '顶部', mark: '顶' },
  { id: 'sides', label: '两侧', mark: '侧' },
  { id: 'back', label: '后脑', mark: '后' },
] as const

const activeRegion = ref<PrivateReferenceRegion | null>(null)
const intent = ref<PrivateReferenceIntent>('keep')
const note = ref('')
const error = ref<string | null>(null)

const regionLabel = (region: PrivateReferenceRegion) => (
  regions.find(({ id }) => id === region)?.label ?? region
)

const openRegion = (region: PrivateReferenceRegion) => {
  if (props.disabled) return
  const existing = props.modelValue.find((area) => area.region === region)
  activeRegion.value = region
  intent.value = existing?.intent ?? 'keep'
  note.value = existing?.note ?? ''
  error.value = null
}

const saveArea = () => {
  if (!activeRegion.value || props.disabled) return
  const normalizedNote = note.value.normalize('NFKC').trim()
  if (!normalizedNote) {
    error.value = '请写一句你想保留或不要照搬的细节。'
    return
  }
  const next = props.modelValue.filter(({ region }) => region !== activeRegion.value)
  emit('update:modelValue', [
    ...next,
    { region: activeRegion.value, intent: intent.value, note: normalizedNote },
  ])
  activeRegion.value = null
  error.value = null
}

const removeArea = () => {
  if (!activeRegion.value || props.disabled) return
  emit(
    'update:modelValue',
    props.modelValue.filter(({ region }) => region !== activeRegion.value),
  )
  activeRegion.value = null
  error.value = null
}
</script>

<template>
  <section
    class="reference-region-editor"
    aria-labelledby="reference-region-title"
  >
    <header>
      <p class="section-index">
        只记录你明确选择的部位
      </p>
      <h2 id="reference-region-title">
        这张图，具体参考哪里？
      </h2>
      <p>只记录你亲自选择的部分。没有选择的地方，不会被当成你的要求。</p>
    </header>

    <fieldset class="reference-region-buttons">
      <legend>参考图部位</legend>
      <button
        v-for="region in regions"
        :key="region.id"
        v-tactile
        type="button"
        :class="`reference-region-button reference-region-button--${region.id}`"
        :aria-pressed="activeRegion === region.id"
        :disabled="disabled"
        @click="openRegion(region.id)"
      >
        <span aria-hidden="true">{{ region.mark }}</span>
        {{ region.label }}
      </button>
    </fieldset>

    <ul
      v-if="modelValue.length"
      class="reference-region-summaries"
    >
      <li
        v-for="area in modelValue"
        :key="area.region"
      >
        <button
          v-tactile
          type="button"
          :disabled="disabled"
          :aria-label="`编辑${regionLabel(area.region)}`"
          @click="openRegion(area.region)"
        >
          <span>
            <b>{{ regionLabel(area.region) }}{{ area.intent === 'keep' ? '想保留' : '不要照搬' }}</b>
            <small>{{ area.note }}</small>
          </span>
          <span aria-hidden="true">编辑</span>
        </button>
      </li>
    </ul>

    <fieldset
      v-if="activeRegion"
      class="reference-region-detail"
    >
      <legend>{{ regionLabel(activeRegion) }}怎么参考？</legend>
      <div class="reference-region-intent">
        <label>
          <input
            v-model="intent"
            type="radio"
            value="keep"
          >
          <span>喜欢这里</span>
        </label>
        <label>
          <input
            v-model="intent"
            type="radio"
            value="avoid"
          >
          <span>不要照搬</span>
        </label>
      </div>
      <label>
        <span>{{ regionLabel(activeRegion) }}说明</span>
        <textarea
          v-model="note"
          :aria-label="`${regionLabel(activeRegion)}说明`"
          maxlength="80"
          rows="3"
          :placeholder="intent === 'keep' ? '例如：保留自然碎刘海' : '例如：不要剪得这么齐'"
        />
      </label>
      <p
        v-if="error"
        class="reference-region-error"
        role="alert"
      >
        {{ error }}
      </p>
      <div class="reference-region-actions">
        <button
          v-tactile
          type="button"
          @click="saveArea"
        >
          记下{{ regionLabel(activeRegion) }}
        </button>
        <button
          v-if="modelValue.some(({ region }) => region === activeRegion)"
          v-tactile
          type="button"
          :aria-label="`删除${regionLabel(activeRegion)}说明`"
          @click="removeArea"
        >
          删除
        </button>
        <button
          v-tactile
          type="button"
          @click="activeRegion = null"
        >
          取消
        </button>
      </div>
    </fieldset>
  </section>
</template>
