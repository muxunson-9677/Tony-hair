<script setup lang="ts">
import { MAINTENANCE_LEVEL_LABELS } from '../curatedCatalog'
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
  <article
    class="hairstyle-tile"
    data-testid="hairstyle-tile"
  >
    <RouterLink
      class="hairstyle-tile__main"
      :to="`/styles/catalog/${style.id}`"
      :aria-label="`查看发型：${style.name}`"
    >
      <span class="hairstyle-tile__media">
        <img
          :src="style.coverImage"
          :alt="style.imageAlt"
          loading="lazy"
          decoding="async"
        >
        <span class="hairstyle-tile__reality">{{ style.feasibility.replace('可剪参考：', '') }}</span>
      </span>
      <span class="hairstyle-tile__copy">
        <strong>{{ style.name }}</strong>
        <small>{{ MAINTENANCE_LEVEL_LABELS[style.maintenanceLevel] }}</small>
      </span>
    </RouterLink>

    <button
      class="hairstyle-tile__favorite"
      type="button"
      :aria-label="`收藏：${style.name}`"
      :aria-pressed="favorite"
      :disabled="busy"
      @click="$emit('toggleFavorite')"
    >
      <span aria-hidden="true">{{ favorite ? '已藏' : '收藏' }}</span>
    </button>
  </article>
</template>
