<script setup lang="ts">
import { computed, ref } from 'vue'

import {
  MAINTENANCE_LEVEL_LABELS,
  STYLE_GOALS,
  STYLE_GOAL_LABELS,
} from '../curatedCatalog'
import type { MaintenanceLevel, StyleGoal } from '../types'
import AppIcon from '../../../ui/AppIcon.vue'
import { dragRailDirective as vDragRail } from '../../../ui/dragRail'
import { tactileDirective as vTactile } from '../../../ui/tactile'

const props = defineProps<{
  readonly query: string
  readonly goals: readonly StyleGoal[]
  readonly maintenanceLevels: readonly MaintenanceLevel[]
}>()

const emit = defineEmits<{
  'update:query': [value: string]
  'update:goals': [value: StyleGoal[]]
  'update:maintenanceLevels': [value: MaintenanceLevel[]]
  reset: []
}>()

const maintenanceOptions = ['low', 'medium', 'high'] as const satisfies readonly MaintenanceLevel[]
const filtersExpanded = ref(false)
const activeFilterCount = computed(() => props.goals.length + props.maintenanceLevels.length)

const toggleGoal = (goal: StyleGoal) => {
  emit(
    'update:goals',
    props.goals.includes(goal)
      ? props.goals.filter((item) => item !== goal)
      : [...props.goals, goal],
  )
}

const toggleMaintenance = (level: MaintenanceLevel) => {
  emit(
    'update:maintenanceLevels',
    props.maintenanceLevels.includes(level)
      ? props.maintenanceLevels.filter((item) => item !== level)
      : [...props.maintenanceLevels, level],
  )
}
</script>

<template>
  <div class="style-filter-bar">
    <label class="style-filter-bar__search">
      <span>搜索发型</span>
      <div class="style-filter-bar__search-field">
        <AppIcon name="search" />
        <input
          type="search"
          :value="query"
          placeholder="名称、别名或需求"
          autocomplete="off"
          @input="emit('update:query', ($event.target as HTMLInputElement).value)"
        >
      </div>
    </label>

    <button
      v-tactile
      class="style-filter-bar__toggle"
      type="button"
      :aria-expanded="filtersExpanded"
      aria-controls="style-filter-options"
      @click="filtersExpanded = !filtersExpanded"
    >
      <span><AppIcon name="filter" />筛选条件（{{ activeFilterCount }}）</span>
      <span aria-hidden="true">{{ filtersExpanded ? '收起' : '展开' }}</span>
    </button>

    <div
      id="style-filter-options"
      class="style-filter-bar__options"
      :class="{ 'style-filter-bar__options--expanded': filtersExpanded }"
    >
      <fieldset>
        <legend>我更在意</legend>
        <div
          v-drag-rail
          class="style-filter-bar__chips"
        >
          <label
            v-for="goal in STYLE_GOALS"
            :key="goal"
          >
            <input
              type="checkbox"
              :checked="goals.includes(goal)"
              :aria-label="`筛选目标：${STYLE_GOAL_LABELS[goal]}`"
              @change="toggleGoal(goal)"
            >
            <span>{{ STYLE_GOAL_LABELS[goal] }}</span>
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend>日常维护</legend>
        <div
          v-drag-rail
          class="style-filter-bar__chips"
        >
          <label
            v-for="level in maintenanceOptions"
            :key="level"
          >
            <input
              type="checkbox"
              :checked="maintenanceLevels.includes(level)"
              :aria-label="`筛选维护：${MAINTENANCE_LEVEL_LABELS[level]}`"
              @change="toggleMaintenance(level)"
            >
            <span>{{ MAINTENANCE_LEVEL_LABELS[level] }}</span>
          </label>
        </div>
      </fieldset>

      <button
        v-if="query || goals.length || maintenanceLevels.length"
        v-tactile
        class="style-filter-bar__reset"
        type="button"
        @click="emit('reset')"
      >
        重置条件
      </button>
    </div>
  </div>
</template>
