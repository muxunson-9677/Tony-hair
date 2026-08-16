<script setup lang="ts" generic="T extends string">
import OptionArt, { type OptionArtName } from './OptionArt.vue'
import { tactileDirective as vTactile } from './tactile'

export interface OptionCardOption<Value extends string = string> {
  readonly value: Value
  readonly label: string
  readonly hint?: string
  readonly art?: OptionArtName
}

defineProps<{
  readonly legend: string
  readonly name: string
  readonly modelValue: T
  readonly options: readonly OptionCardOption<T>[]
  readonly note?: string
}>()

const emit = defineEmits<{ 'update:modelValue': [value: T] }>()
</script>

<template>
  <fieldset class="option-cards">
    <legend>{{ legend }}</legend>
    <p
      v-if="note"
      class="option-cards__note"
    >
      {{ note }}
    </p>
    <div class="option-cards__grid">
      <label
        v-for="option in options"
        :key="option.value"
        v-tactile
        class="option-card"
        :data-selected="option.value === modelValue ? 'true' : 'false'"
      >
        <input
          class="option-card__input"
          type="radio"
          :name="name"
          :value="option.value"
          :checked="option.value === modelValue"
          @change="emit('update:modelValue', option.value)"
        >
        <OptionArt
          v-if="option.art"
          class="option-card__art"
          :name="option.art"
        />
        <b class="option-card__label">{{ option.label }}</b>
        <small
          v-if="option.hint"
          class="option-card__hint"
        >{{ option.hint }}</small>
      </label>
    </div>
  </fieldset>
</template>
