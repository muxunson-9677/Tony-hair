<script setup lang="ts">
import { computed } from 'vue'

import { tactileDirective as vTactile } from '../../../ui/tactile'

// 主图展示台（V4 4.2）：任何时刻只显示一张大图。
// 状态位按多状态设计（预留 AI 效果图、日常状态），不可用状态不渲染。

export interface BriefStageState {
  readonly id: string
  readonly label: string
  readonly imageSource?: string
  readonly imageAlt: string
  readonly available: boolean
}

const props = defineProps<{
  states: readonly BriefStageState[]
  modelValue: string
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const availableStates = computed(() => props.states.filter(({ available }) => available))
const activeState = computed(() => (
  availableStates.value.find(({ id }) => id === props.modelValue) ?? availableStates.value[0]
))
</script>

<template>
  <figure class="brief-stage">
    <div
      v-if="availableStates.length > 1"
      class="brief-stage__switcher"
      role="tablist"
      aria-label="主图展示状态"
    >
      <button
        v-for="state in availableStates"
        :key="state.id"
        v-tactile
        type="button"
        role="tab"
        :aria-selected="state.id === activeState?.id"
        :class="{ 'brief-stage__tab--active': state.id === activeState?.id }"
        @click="emit('update:modelValue', state.id)"
      >
        {{ state.label }}
      </button>
    </div>
    <img
      v-if="activeState?.imageSource"
      :src="activeState.imageSource"
      :alt="activeState.imageAlt"
    >
    <div
      v-else
      class="brief-preview__image-missing"
    >
      目标候选暂无可显示图片
    </div>
  </figure>
</template>
