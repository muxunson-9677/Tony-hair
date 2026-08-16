<script setup lang="ts">
import { computed, ref } from 'vue'

import type { HairProfile } from '../../archive/types'
import AppIcon from '../../../ui/AppIcon.vue'
import { tactileDirective as vTactile } from '../../../ui/tactile'
import { curatedHairstyles } from '../curatedCatalog'
import {
  recommendGuidedDirections,
  type GuidedChangeAppetite,
  type GuidedGoal,
} from '../guidedDirections'
import type { CuratedHairstyle } from '../types'

const props = defineProps<{
  readonly profile: HairProfile
}>()

const emit = defineEmits<{
  adopt: [styles: readonly CuratedHairstyle[]]
}>()

const step = ref<0 | 1 | 2 | 3>(0)
const goal = ref<GuidedGoal | null>(null)
const stylingBudget = ref<3 | 5 | 8 | 12 | null>(null)
const changeAppetite = ref<GuidedChangeAppetite | null>(null)

const recommendations = computed(() => {
  if (!goal.value || !stylingBudget.value || !changeAppetite.value) return []
  return recommendGuidedDirections({
    profile: props.profile,
    answers: {
      goal: goal.value,
      stylingBudget: stylingBudget.value,
      changeAppetite: changeAppetite.value,
    },
    catalog: curatedHairstyles,
  })
})

const chooseGoal = (value: GuidedGoal) => {
  goal.value = value
  step.value = 1
}

const chooseBudget = (value: 3 | 5 | 8 | 12) => {
  stylingBudget.value = value
  step.value = 2
}

const chooseChange = (value: GuidedChangeAppetite) => {
  changeAppetite.value = value
  step.value = 3
}

const roleIcon = (role: 'safe' | 'goal' | 'try') => (
  role === 'safe' ? 'check' : role === 'goal' ? 'styles' : 'warning'
)
</script>

<template>
  <section
    class="guided-direction-picker"
    aria-labelledby="guided-direction-title"
  >
    <header v-if="step < 3">
      <p class="section-index">
        HELP ME CHOOSE
      </p>
      <h2 id="guided-direction-title">
        先回答一件事
      </h2>
      <p>不需要懂发型术语，我们只按你的生活方式比较现有示例。</p>
    </header>

    <fieldset
      v-if="step === 0"
      class="guided-direction-question"
    >
      <legend>这次最想解决什么？</legend>
      <button
        v-tactile
        type="button"
        @click="chooseGoal('easy')"
      >
        每天少打理
      </button>
      <button
        v-tactile
        type="button"
        @click="chooseGoal('length')"
      >
        两侧别太短
      </button>
      <button
        v-tactile
        type="button"
        @click="chooseGoal('change')"
      >
        想明显换个感觉
      </button>
    </fieldset>

    <fieldset
      v-else-if="step === 1"
      class="guided-direction-question"
    >
      <legend>每天最多愿意打理多久？</legend>
      <button
        v-tactile
        type="button"
        @click="chooseBudget(3)"
      >
        3 分钟以内
      </button>
      <button
        v-tactile
        type="button"
        @click="chooseBudget(5)"
      >
        5 分钟以内
      </button>
      <button
        v-tactile
        type="button"
        @click="chooseBudget(8)"
      >
        8 分钟以内
      </button>
      <button
        v-tactile
        type="button"
        @click="chooseBudget(12)"
      >
        可以多花一点时间
      </button>
      <button
        v-tactile
        class="guided-direction-back"
        type="button"
        @click="step = 0"
      >
        返回上一题
      </button>
    </fieldset>

    <fieldset
      v-else-if="step === 2"
      class="guided-direction-question"
    >
      <legend>这次想变化多大？</legend>
      <button
        v-tactile
        type="button"
        @click="chooseChange('safe')"
      >
        尽量稳妥
      </button>
      <button
        v-tactile
        type="button"
        @click="chooseChange('balanced')"
      >
        有变化，但别太冒险
      </button>
      <button
        v-tactile
        type="button"
        @click="chooseChange('bold')"
      >
        可以明显变一个人
      </button>
      <button
        v-tactile
        class="guided-direction-back"
        type="button"
        @click="step = 1"
      >
        返回上一题
      </button>
    </fieldset>

    <div
      v-else
      class="guided-direction-results"
    >
      <div class="guided-direction-results__heading">
        <div>
          <p class="section-index">
            3 个方向 · 按你的需求筛选
          </p>
          <h2>先比较这三个方向</h2>
        </div>
        <button
          v-tactile
          type="button"
          @click="step = 2"
        >
          修改答案
        </button>
      </div>

      <p class="guided-direction-disclosure">
        这是根据你填写的信息和六款示例做的本机规则排序，不是 AI 结论，也不分析你的照片。
      </p>

      <ol class="guided-direction-list">
        <li
          v-for="recommendation in recommendations"
          :key="recommendation.role"
        >
          <img
            :src="recommendation.style.coverImage"
            :alt="recommendation.style.imageAlt"
          >
          <div class="guided-direction-card__body">
            <span :class="`guided-direction-role guided-direction-role--${recommendation.role}`">
              <AppIcon :name="roleIcon(recommendation.role)" />
              {{ recommendation.roleLabel }}
            </span>
            <h3>{{ recommendation.style.name }}</h3>
            <p>{{ recommendation.reason }}</p>
            <dl>
              <div><dt>日常代价</dt><dd>{{ recommendation.dailyCost }}</dd></div>
              <div><dt>最大风险</dt><dd>{{ recommendation.risk }}</dd></div>
            </dl>
          </div>
        </li>
      </ol>

      <button
        v-tactile
        class="archive-primary-button guided-direction-adopt"
        type="button"
        :disabled="recommendations.length < 3"
        @click="emit('adopt', recommendations.map(({ style }) => style))"
      >
        一起比较这 3 个方向
      </button>
    </div>
  </section>
</template>
