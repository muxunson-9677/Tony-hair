<script setup lang="ts">
import { computed } from 'vue'

import { buildArchivePlanReturnPath } from '../../archive/archiveReturnPath'
import type { CuratedHairstyle } from '../types'

const props = defineProps<{
  readonly style: CuratedHairstyle
  readonly favorite: boolean
  readonly busy?: boolean
}>()

defineEmits<{
  toggleFavorite: []
}>()

const addToPlanPath = computed(() => buildArchivePlanReturnPath({
  kind: 'catalog',
  id: props.style.id,
}))
</script>

<template>
  <div
    class="style-action-dock"
    aria-label="发型操作"
  >
    <RouterLink
      v-if="addToPlanPath"
      class="style-action-dock__primary"
      :to="addToPlanPath"
    >
      加入计划
    </RouterLink>
    <RouterLink :to="`/styles/catalog/${style.id}/show`">
      给理发师看
    </RouterLink>
    <button
      type="button"
      :aria-label="`收藏：${style.name}`"
      :aria-pressed="favorite"
      :disabled="busy"
      @click="$emit('toggleFavorite')"
    >
      <span aria-hidden="true">{{ favorite ? '已收藏' : '收藏' }}</span>
    </button>
    <RouterLink to="/styles">
      返回找发型
    </RouterLink>
  </div>
</template>
