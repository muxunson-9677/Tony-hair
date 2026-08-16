<script setup lang="ts">
import { computed, ref } from 'vue'

import { DemoProvider } from '@/features/try-on/DemoProvider'
import { tactileDirective as vTactile } from '@/ui/tactile'

const personas = new DemoProvider().getPersonas()
const selectedPersonaId = ref(personas[0].id)
const selectedOptionId = ref(personas[0].options[0].id)

const selectedPersona = computed(
  () => personas.find((persona) => persona.id === selectedPersonaId.value) ?? personas[0],
)
const selectedOption = computed(
  () =>
    selectedPersona.value.options.find((option) => option.id === selectedOptionId.value) ??
    selectedPersona.value.options[0],
)

const adjustments = [
  {
    id: 'lighter-fringe',
    label: '刘海更轻',
    suggestion: '请把刘海末端做轻，保留参差感，不要剪成整齐的一条线。需理发师现场确认。',
  },
  {
    id: 'narrower-sides',
    label: '两侧收窄',
    suggestion: '请收窄耳上区域，但不要把渐层推高，保留与顶部的柔和连接。需理发师现场确认。',
  },
  {
    id: 'longer-top',
    label: '顶部留长',
    suggestion: '请让顶部保留可换分线的长度，只减重量，不剪掉自然发流。需理发师现场确认。',
  },
] as const

const selectedAdjustmentId = ref<string | null>(null)
const adjustmentMessage = ref('点选一个微调示例，查看预先写好的沟通建议。')

function selectPersona(personaId: string) {
  const persona = personas.find((item) => item.id === personaId)

  if (!persona) return

  selectedPersonaId.value = persona.id
  selectedOptionId.value = persona.options[0].id
}

function selectAdjustment(adjustment: (typeof adjustments)[number]) {
  selectedAdjustmentId.value = adjustment.id
  adjustmentMessage.value = adjustment.suggestion
}
</script>

<template>
  <section
    class="try-view"
    aria-labelledby="try-title"
  >
    <div
      class="try-disclosure"
      aria-label="示例体验说明"
    >
      <strong>示例体验</strong>
      <span>预先制作的合成人物素材，不会处理你的照片</span>
    </div>

    <header class="try-header">
      <p class="eyebrow">
        预制方向对比 · 不是个人效果预测
      </p>
      <h1 id="try-title">
        示例方向对比
      </h1>
      <p>以下三位均为 AI 生成的虚构成年人；这里只比较预制方向，不是对个人剪后效果的预测。</p>
    </header>

    <figure class="try-visual">
      <img
        data-testid="try-result-image"
        class="try-result-image"
        :src="selectedOption.image"
        :alt="selectedOption.imageAlt"
      >
      <figcaption>
        <span>{{ selectedPersona.name }} · {{ selectedPersona.age }} 岁成年示例</span>
        <span>AI 合成图片</span>
      </figcaption>
    </figure>

    <section
      class="try-controls"
      aria-labelledby="persona-heading"
    >
      <div class="section-heading">
        <p>第一步</p>
        <h2 id="persona-heading">
          选一位示例人物
        </h2>
      </div>
      <div
        class="persona-selector"
        role="group"
        aria-label="选择示例人物"
      >
        <button
          v-for="persona in personas"
          :key="persona.id"
          v-tactile
          type="button"
          class="persona-option"
          :class="{ 'persona-option--active': persona.id === selectedPersona.id }"
          :aria-label="`选择人物：${persona.name}`"
          :aria-pressed="persona.id === selectedPersona.id"
          @click="selectPersona(persona.id)"
        >
          <img
            :src="persona.baseImage"
            alt=""
            loading="lazy"
          >
          <span>
            <b>{{ persona.name }}</b>
            <small>{{ persona.age }} 岁 · {{ persona.genderPresentationLabel }}<br>{{ persona.hairTexture }}</small>
          </span>
        </button>
      </div>
    </section>

    <section
      class="try-controls try-controls--plans"
      aria-labelledby="plan-heading"
    >
      <div class="section-heading">
        <p>第二步</p>
        <h2 id="plan-heading">
          换一种剪法看看
        </h2>
      </div>
      <div
        class="plan-selector"
        role="group"
        :aria-label="`${selectedPersona.name}的短发方案`"
      >
        <button
          v-for="(option, index) in selectedPersona.options"
          :key="option.id"
          v-tactile
          type="button"
          class="plan-option"
          :class="{ 'plan-option--active': option.id === selectedOption.id }"
          :aria-label="`选择方案：${option.name}`"
          :aria-pressed="option.id === selectedOption.id"
          @click="selectedOptionId = option.id"
        >
          <span>0{{ index + 1 }}</span>
          <b>{{ option.name }}</b>
        </button>
      </div>
    </section>

    <section
      class="try-details"
      aria-labelledby="detail-heading"
    >
      <div class="detail-lead">
        <p>这个方案的说明</p>
        <h2 id="detail-heading">
          {{ selectedOption.name }}
        </h2>
      </div>
      <dl>
        <div>
          <dt>推荐理由</dt>
          <dd>{{ selectedOption.reason }}</dd>
        </div>
        <div>
          <dt>现实可剪性</dt>
          <dd>{{ selectedOption.feasibility }}</dd>
        </div>
        <div>
          <dt>打理成本</dt>
          <dd>{{ selectedOption.maintenance }}</dd>
        </div>
      </dl>
      <p class="barber-confirmation">
        {{ selectedOption.barberConfirmation }}
      </p>
    </section>

    <section
      class="try-adjustments"
      aria-labelledby="adjustment-heading"
    >
      <div class="section-heading">
        <p>第三步</p>
        <h2 id="adjustment-heading">
          想再改一点？这样说
        </h2>
      </div>
      <p class="adjustment-intro">
        点一下，把模糊的“再改一点”换成可以当面讨论的话。
      </p>
      <div
        class="adjustment-actions"
        role="group"
        aria-label="微调示例"
      >
        <button
          v-for="adjustment in adjustments"
          :key="adjustment.id"
          v-tactile
          type="button"
          :class="{ 'adjustment-action--active': adjustment.id === selectedAdjustmentId }"
          :aria-label="`微调示例：${adjustment.label}`"
          :aria-pressed="adjustment.id === selectedAdjustmentId"
          @click="selectAdjustment(adjustment)"
        >
          {{ adjustment.label }}
        </button>
      </div>
      <p
        class="adjustment-status"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {{ adjustmentMessage }}
      </p>
    </section>
  </section>
</template>
