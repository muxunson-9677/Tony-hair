<script setup lang="ts">
import type { CuratedHairstyle } from '../types'

defineProps<{
  readonly style: CuratedHairstyle
  readonly favorite: boolean
  readonly busy?: boolean
}>()

defineEmits<{
  toggleFavorite: []
}>()
</script>

<template>
  <div
    class="style-action-dock"
    aria-label="发型操作"
  >
    <RouterLink to="/styles">
      返回找发型
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
  </div>
</template>
