<script setup lang="ts">
import { computed } from 'vue'

import { buildArchivePlanReturnPath } from '../../archive/archiveReturnPath'
import type { CuratedHairstyle } from '../types'
import AppIcon from '../../../ui/AppIcon.vue'
import { tactileDirective as vTactile } from '../../../ui/tactile'

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
      v-tactile
      class="style-action-dock__primary"
      :to="addToPlanPath"
    >
      <AppIcon name="check" />
      加入计划
    </RouterLink>
    <RouterLink
      v-tactile
      :to="`/styles/catalog/${style.id}/show`"
    >
      <AppIcon name="eye" />
      给理发师看
    </RouterLink>
    <button
      v-tactile
      type="button"
      :aria-label="`收藏：${style.name}`"
      :aria-pressed="favorite"
      :disabled="busy"
      @click="$emit('toggleFavorite')"
    >
      <AppIcon :name="favorite ? 'heart-filled' : 'heart'" />
      <span>{{ favorite ? '已收藏' : '收藏' }}</span>
    </button>
    <RouterLink
      v-tactile
      to="/styles"
    >
      <AppIcon name="back" />
      返回找发型
    </RouterLink>
  </div>
</template>
