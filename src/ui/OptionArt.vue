<script setup lang="ts">
export type OptionArtName =
  | 'texture-straight'
  | 'texture-wavy'
  | 'texture-curly'
  | 'texture-coily'
  | 'thickness-fine'
  | 'thickness-medium'
  | 'thickness-coarse'
  | 'density-low'
  | 'density-medium'
  | 'density-high'
  | 'feel-soft'
  | 'feel-sharp'
  | 'feel-neutral'
  | 'feel-any'
  | 'wash-daily'
  | 'wash-alternate'
  | 'wash-two-three'
  | 'wash-weekly'
  | 'time-none'
  | 'time-five'
  | 'time-ten'
  | 'time-twenty'
  | 'unsure'

const props = defineProps<{ readonly name: OptionArtName }>()

// 发量：从头顶一点向下散开的发丝，根数即含义。
const DENSITY_SPREADS: Partial<Record<OptionArtName, number[]>> = {
  'density-low': [-12, 0, 12],
  'density-medium': [-24, -12, 0, 12, 24],
  'density-high': [-28, -21, -14, -7, 0, 7, 14, 21, 28],
}

const strand = (dx: number) => `M36 7c${dx * 0.2} 12 ${dx} 20 ${dx} 33`

// 洗发频率：一周七天的点阵，实心=洗头的那天。
const WASH_FILLS: Partial<Record<OptionArtName, number[]>> = {
  'wash-daily': [0, 1, 2, 3, 4, 5, 6],
  'wash-alternate': [0, 2, 4, 6],
  'wash-two-three': [0, 3, 5],
  'wash-weekly': [3],
}

const densitySpread = DENSITY_SPREADS[props.name]
const washFill = WASH_FILLS[props.name]
</script>

<template>
  <svg
    :data-art="name"
    aria-hidden="true"
    viewBox="0 0 72 44"
    fill="none"
    stroke="currentColor"
    stroke-width="2.2"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <template v-if="name === 'texture-straight'">
      <path d="M24 7c-1.2 10-1.2 20 0 30" />
      <path d="M33 6c-.8 11-.8 22 0 32" />
      <path d="M42 6c.8 11 .8 22 0 32" />
      <path d="M51 7c1.2 10 1.2 20 0 30" />
    </template>
    <template v-else-if="name === 'texture-wavy'">
      <path d="M25 6q-5 8 0 16t0 16" />
      <path d="M34 6q-5 8 0 16t0 16" />
      <path d="M43 6q-5 8 0 16t0 16" />
      <path d="M52 6q-5 8 0 16t0 16" />
    </template>
    <template v-else-if="name === 'texture-curly'">
      <path d="M26 6q-8 8 0 15t0 15" />
      <path d="M38 6q-8 8 0 15t0 15" />
      <path d="M50 6q-8 8 0 15t0 15" />
    </template>
    <template v-else-if="name === 'texture-coily'">
      <path d="M26 5a4 4 0 0 1 0 8a4 4 0 0 0 0 8a4 4 0 0 1 0 8a4 4 0 0 0 0 8a4 4 0 0 1 0 8" />
      <path d="M38 5a4 4 0 0 1 0 8a4 4 0 0 0 0 8a4 4 0 0 1 0 8a4 4 0 0 0 0 8a4 4 0 0 1 0 8" />
      <path d="M50 5a4 4 0 0 1 0 8a4 4 0 0 0 0 8a4 4 0 0 1 0 8a4 4 0 0 0 0 8a4 4 0 0 1 0 8" />
    </template>
    <template v-else-if="name === 'thickness-fine'">
      <g stroke-width="1.1">
        <path d="M27 7c-2 10-2 20 0 30" />
        <path d="M36 6v32" />
        <path d="M45 7c2 10 2 20 0 30" />
      </g>
    </template>
    <template v-else-if="name === 'thickness-medium'">
      <g stroke-width="2.6">
        <path d="M27 7c-2 10-2 20 0 30" />
        <path d="M36 6v32" />
        <path d="M45 7c2 10 2 20 0 30" />
      </g>
    </template>
    <template v-else-if="name === 'thickness-coarse'">
      <g stroke-width="4.4">
        <path d="M27 7c-2 10-2 20 0 30" />
        <path d="M36 6v32" />
        <path d="M45 7c2 10 2 20 0 30" />
      </g>
    </template>
    <template v-else-if="densitySpread">
      <path
        v-for="dx in densitySpread"
        :key="dx"
        :d="strand(dx)"
      />
    </template>
    <!-- 柔和/利落：用发型轮廓线的语言——圆润波浪 vs 干脆折线。 -->
    <template v-else-if="name === 'feel-soft'">
      <path
        d="M12 27c8-11 16-11 24 0s16 11 24 0"
        stroke-width="3"
      />
    </template>
    <template v-else-if="name === 'feel-sharp'">
      <path
        d="M12 29l12-15 12 15 12-15 12 15"
        stroke-width="3"
        stroke-linejoin="miter"
      />
    </template>
    <template v-else-if="name === 'feel-neutral'">
      <path
        d="M11 28c7-11 14-11 25 0l8-12 8 12 9-12"
        stroke-width="3"
        stroke-linejoin="miter"
      />
    </template>
    <template v-else-if="name === 'feel-any'">
      <path
        d="M19 15c6-7 11-7 17 0s11 7 17 0"
        stroke-width="2.6"
      />
      <path
        d="M19 33l8-10 9 10 8-10 9 10"
        stroke-width="2.6"
        stroke-linejoin="miter"
      />
    </template>
    <template v-else-if="washFill">
      <circle
        v-for="day in 7"
        :key="day"
        :cx="12 + (day - 1) * 8"
        cy="22"
        r="3.4"
        :fill="washFill.includes(day - 1) ? 'currentColor' : 'none'"
        stroke-width="1.6"
      />
    </template>
    <template v-else-if="name === 'time-none'">
      <circle
        cx="36"
        cy="22"
        r="14"
      />
      <circle
        cx="36"
        cy="22"
        r="1.4"
        fill="currentColor"
      />
    </template>
    <template v-else-if="name === 'time-five'">
      <circle
        cx="36"
        cy="22"
        r="14"
      />
      <path
        d="M36 22 36 8 A14 14 0 0 1 43 9.9 Z"
        fill="currentColor"
        stroke="none"
      />
    </template>
    <template v-else-if="name === 'time-ten'">
      <circle
        cx="36"
        cy="22"
        r="14"
      />
      <path
        d="M36 22 36 8 A14 14 0 0 1 50 22 Z"
        fill="currentColor"
        stroke="none"
      />
    </template>
    <template v-else-if="name === 'time-twenty'">
      <circle
        cx="36"
        cy="22"
        r="14"
      />
      <path
        d="M36 22 36 8 A14 14 0 0 1 36 36 Z"
        fill="currentColor"
        stroke="none"
      />
    </template>
    <template v-else-if="name === 'unsure'">
      <circle
        cx="36"
        cy="22"
        r="14"
        stroke-dasharray="3.4 4.6"
        stroke-width="1.8"
      />
      <path d="M31.5 17.5c0-3.4 2.6-5 4.7-5 2.4 0 4.6 1.7 4.6 4.4 0 3.8-4.6 3.7-4.6 7.4" />
      <circle
        cx="36.2"
        cy="29.6"
        r="1.1"
        fill="currentColor"
        stroke="none"
      />
    </template>
  </svg>
</template>
