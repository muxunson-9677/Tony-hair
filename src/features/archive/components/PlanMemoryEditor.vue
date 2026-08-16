<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import type { PlanMemoryKind } from '../types'
import { tactileDirective as vTactile } from '../../../ui/tactile'

export interface PlanMemoryEntry {
  readonly uiKey: string
  readonly kind: PlanMemoryKind
  readonly text: string
  readonly sourceRecordId: string
  readonly sourceRecordDate: string
  readonly sourceLabel: string
  readonly sourceExists: boolean
}

const props = defineProps<{
  keepItems: readonly PlanMemoryEntry[]
  avoidItems: readonly PlanMemoryEntry[]
  overflowItems: readonly PlanMemoryEntry[]
  disabled: boolean
}>()

const emit = defineEmits<{
  'update-text': [group: 'keep' | 'avoid', index: number, text: string]
  remove: [group: 'keep' | 'avoid', index: number]
  swap: [overflowIndex: number, avoidIndex: number]
}>()

const kindLabels: Record<PlanMemoryKind, string> = {
  success: '成功经验',
  adjustment: '下次微调',
  avoid: '避雷',
}

const pendingOverflowIndex = ref<number | null>(null)

const hasAnyMemory = computed(() => (
  props.keepItems.length > 0 || props.avoidItems.length > 0
))

watch(() => props.overflowItems.length, () => {
  pendingOverflowIndex.value = null
})

const onInput = (group: 'keep' | 'avoid', index: number, event: Event) => {
  emit('update-text', group, index, (event.target as HTMLTextAreaElement).value)
}

const startSwap = (overflowIndex: number) => {
  pendingOverflowIndex.value = overflowIndex
}

const cancelSwap = () => {
  pendingOverflowIndex.value = null
}

const finishSwap = (avoidIndex: number) => {
  if (pendingOverflowIndex.value === null) {
    return
  }
  emit('swap', pendingOverflowIndex.value, avoidIndex)
  pendingOverflowIndex.value = null
}
</script>

<template>
  <section
    v-if="hasAnyMemory"
    class="plan-memory-editor"
    aria-labelledby="plan-memory-title"
  >
    <div class="archive-section-heading">
      <div>
        <p class="section-index">
          带入的经验
        </p>
        <h2 id="plan-memory-title">
          本次已带入
        </h2>
      </div>
    </div>
    <p class="plan-memory-editor__intro">
      Tony 从你的剪后记录里带来了这些经验。保存前都可以改，不会改动原记录。
    </p>

    <section
      v-if="keepItems.length > 0"
      class="plan-memory-group"
      aria-labelledby="plan-memory-keep-title"
    >
      <h3 id="plan-memory-keep-title">
        这次继续保持
      </h3>
      <ol>
        <li
          v-for="(item, index) in keepItems"
          :key="item.uiKey"
        >
          <span class="plan-memory-kind">{{ kindLabels[item.kind] }}</span>
          <textarea
            :value="item.text"
            :aria-label="`保持经验 ${index + 1}`"
            maxlength="160"
            rows="2"
            :disabled="disabled"
            @input="onInput('keep', index, $event)"
          />
          <p class="plan-memory-source">
            <RouterLink
              v-if="item.sourceExists"
              v-tactile
              :to="`/archive/records/${item.sourceRecordId}`"
            >
              {{ item.sourceRecordDate }} · {{ item.sourceLabel }}
            </RouterLink>
            <span v-else>{{ item.sourceRecordDate }} · {{ item.sourceLabel }}（原记录已删除，保留当时快照）</span>
          </p>
          <button
            v-tactile
            type="button"
            class="plan-memory-remove"
            :aria-label="`删除保持经验 ${index + 1}`"
            :disabled="disabled"
            @click="emit('remove', 'keep', index)"
          >
            删除
          </button>
        </li>
      </ol>
    </section>

    <section
      v-if="avoidItems.length > 0"
      class="plan-memory-group plan-memory-group--avoid"
      aria-labelledby="plan-memory-avoid-title"
    >
      <h3 id="plan-memory-avoid-title">
        这次一定避开
      </h3>
      <p
        v-if="pendingOverflowIndex !== null"
        class="plan-memory-swap-hint"
        role="status"
      >
        点选下面要被替换的那条避雷
      </p>
      <ol>
        <li
          v-for="(item, index) in avoidItems"
          :key="item.uiKey"
        >
          <span class="plan-memory-kind">{{ kindLabels[item.kind] }}</span>
          <textarea
            :value="item.text"
            :aria-label="`避开经验 ${index + 1}`"
            maxlength="160"
            rows="2"
            :disabled="disabled"
            @input="onInput('avoid', index, $event)"
          />
          <p class="plan-memory-source">
            <RouterLink
              v-if="item.sourceExists"
              v-tactile
              :to="`/archive/records/${item.sourceRecordId}`"
            >
              {{ item.sourceRecordDate }} · {{ item.sourceLabel }}
            </RouterLink>
            <span v-else>{{ item.sourceRecordDate }} · {{ item.sourceLabel }}（原记录已删除，保留当时快照）</span>
          </p>
          <button
            v-if="pendingOverflowIndex !== null"
            v-tactile
            type="button"
            class="plan-memory-swap-target"
            :disabled="disabled"
            @click="finishSwap(index)"
          >
            换成这条：{{ item.text }}
          </button>
          <button
            v-else
            v-tactile
            type="button"
            class="plan-memory-remove"
            :aria-label="`删除避开经验 ${index + 1}`"
            :disabled="disabled"
            @click="emit('remove', 'avoid', index)"
          >
            删除
          </button>
        </li>
      </ol>

      <details
        v-if="overflowItems.length > 0"
        class="plan-memory-overflow"
      >
        <summary v-tactile>
          还有 {{ overflowItems.length }} 条避雷没带入，查看
        </summary>
        <ul>
          <li
            v-for="(item, index) in overflowItems"
            :key="item.uiKey"
          >
            <b>{{ item.text }}</b>
            <small>{{ item.sourceRecordDate }} · {{ item.sourceLabel }}</small>
            <button
              v-if="pendingOverflowIndex === index"
              v-tactile
              type="button"
              :disabled="disabled"
              @click="cancelSwap"
            >
              取消换入
            </button>
            <button
              v-else
              v-tactile
              type="button"
              :disabled="disabled"
              @click="startSwap(index)"
            >
              换入：{{ item.text }}
            </button>
          </li>
        </ul>
      </details>
    </section>
  </section>
</template>
