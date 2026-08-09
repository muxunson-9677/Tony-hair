<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useArchiveStore } from '../features/archive/archiveStore'
import {
  archiveDemoCandidates,
  type ArchiveDemoCandidate,
} from '../features/archive/demoCandidates'

const route = useRoute()
const router = useRouter()
const store = useArchiveStore()
const isEditing = computed(() => route.name === 'archive-plan-edit')
const routePlanId = computed(() => typeof route.params.id === 'string' ? route.params.id : '')
const planMissing = ref(false)
const initializing = ref(true)
const loadError = ref<string | null>(null)
const readOnlyReason = ref<string | null>(null)
const selectedKeys = ref<string[]>([])
const replacingIndex = ref<number | null>(null)

const form = reactive({
  title: '',
  date: new Date().toISOString().slice(0, 10),
  status: 'draft' as 'draft' | 'ready',
})

const selectedChoices = computed(() => selectedKeys.value
  .map((key) => archiveDemoCandidates.find((candidate) => candidate.key === key))
  .filter((candidate): candidate is ArchiveDemoCandidate => Boolean(candidate)))

const isSelected = (choice: ArchiveDemoCandidate) => selectedKeys.value.includes(choice.key)

const choose = (choice: ArchiveDemoCandidate) => {
  if (isSelected(choice)) {
    selectedKeys.value = selectedKeys.value.filter((key) => key !== choice.key)
    replacingIndex.value = null
    return
  }

  if (replacingIndex.value !== null) {
    selectedKeys.value.splice(replacingIndex.value, 1, choice.key)
    replacingIndex.value = null
    return
  }

  if (selectedKeys.value.length < 4) {
    selectedKeys.value.push(choice.key)
  }
}

const removeChoice = (index: number) => {
  selectedKeys.value.splice(index, 1)
  replacingIndex.value = null
}

const startReplacement = (index: number) => {
  replacingIndex.value = replacingIndex.value === index ? null : index
}

const choiceButtonLabel = (choice: ArchiveDemoCandidate) => {
  if (isSelected(choice)) {
    return `移除候选：${choice.name}`
  }
  if (replacingIndex.value !== null) {
    return `换成候选：${choice.name}`
  }
  return `加入候选：${choice.name}`
}

const submit = async () => {
  const saved = await store.savePlan({
    id: isEditing.value ? routePlanId.value : undefined,
    title: form.title,
    date: form.date,
    status: form.status,
    candidates: selectedChoices.value.map((choice) => ({
      name: choice.name,
      notes: choice.notes,
      source: 'demo_ai' as const,
      demoImagePath: choice.image,
    })),
  })

  if (saved) {
    await router.push(`/archive/plans/${saved.plan.id}`)
  }
}

onMounted(async () => {
  await store.load()
  if (store.error) {
    loadError.value = store.error
    initializing.value = false
    return
  }
  if (!isEditing.value) {
    initializing.value = false
    return
  }

  const plan = store.plans.find(({ id }) => id === routePlanId.value)
  if (!plan) {
    planMissing.value = true
    initializing.value = false
    return
  }
  if (plan.status === 'completed') {
    readOnlyReason.value = '已完成的旧计划与剪后记录保持只读，本阶段不会把它降级为草稿。'
    initializing.value = false
    return
  }
  const existingCandidates = store.candidatesByPlanId[plan.id] ?? []
  if (existingCandidates.some((candidate) => (
    candidate.source !== 'demo_ai'
    || !candidate.demoImagePath
    || !archiveDemoCandidates.some(({ image }) => image === candidate.demoImagePath)
  ))) {
    readOnlyReason.value = '此计划含有用户参考图、历史记录或旧版候选，本阶段只读展示，避免编辑时丢失来源。'
    initializing.value = false
    return
  }
  form.title = plan.title
  form.date = plan.date.slice(0, 10)
  form.status = plan.status === 'ready' ? 'ready' : 'draft'
  selectedKeys.value = (store.candidatesByPlanId[plan.id] ?? [])
    .map((candidate) => archiveDemoCandidates.find(({ image }) => image === candidate.demoImagePath)?.key)
    .filter((key): key is string => Boolean(key))
  document.title = '编辑发型计划｜咋剪发'
  initializing.value = false
})
</script>

<template>
  <section
    class="archive-form-view plan-form-view"
    aria-labelledby="plan-form-title"
  >
    <RouterLink
      class="back-link"
      :to="isEditing ? `/archive/plans/${routePlanId}` : '/archive'"
    >
      <span aria-hidden="true">←</span> {{ isEditing ? '返回计划详情' : '返回档案' }}
    </RouterLink>

    <header class="inner-header">
      <p class="eyebrow">
        PLAN · 2—4 DIRECTIONS
      </p>
      <h1 id="plan-form-title">
        {{ isEditing ? '编辑发型计划' : '新建发型计划' }}
      </h1>
      <p>先把 2—4 个方向放在一起，带着真实差异去做决定。</p>
    </header>

    <p
      v-if="store.loading || initializing"
      class="archive-loading"
      role="status"
    >
      正在读取本地计划…
    </p>

    <p
      v-else-if="loadError"
      class="form-alert"
      role="alert"
    >
      {{ loadError }}
    </p>

    <div
      v-else-if="!store.profile"
      class="archive-empty archive-empty--inner"
    >
      <h2>请先建立发型档案</h2>
      <p>计划需要归属于这台设备上的主档案。</p>
      <RouterLink
        class="archive-primary-link"
        to="/archive/profile"
      >
        建立档案
      </RouterLink>
    </div>

    <div
      v-else-if="planMissing"
      class="archive-empty archive-empty--inner"
    >
      <h2>没有找到这个计划</h2>
      <RouterLink
        class="text-link"
        to="/archive"
      >
        返回档案
      </RouterLink>
    </div>

    <div
      v-else-if="readOnlyReason"
      class="archive-empty archive-empty--inner"
    >
      <h2>此计划暂时只读</h2>
      <p>{{ readOnlyReason }}</p>
      <RouterLink
        class="text-link"
        :to="`/archive/plans/${routePlanId}`"
      >
        返回计划详情
      </RouterLink>
    </div>

    <form
      v-else
      class="archive-form plan-form"
      @submit.prevent="submit"
    >
      <p
        v-if="store.error"
        class="form-alert"
        role="alert"
      >
        {{ store.error }}
      </p>

      <label>
        <span>计划标题</span>
        <input
          v-model="form.title"
          name="title"
          maxlength="80"
          required
          placeholder="例如：夏末短发计划"
        >
      </label>

      <div class="form-grid">
        <label>
          <span>计划日期</span>
          <input
            v-model="form.date"
            name="date"
            type="date"
            required
          >
        </label>
        <label>
          <span>计划状态</span>
          <select
            v-model="form.status"
            name="status"
          >
            <option value="draft">草稿</option>
            <option value="ready">可带去沟通</option>
          </select>
        </label>
      </div>

      <aside
        class="sample-disclosure"
        aria-label="示例候选说明"
      >
        <b>示例体验 · 非用户生成</b>
        <p>以下是预先制作的虚构成年人物短发素材，不会处理你的照片，也不是个性化生成结果。</p>
      </aside>

      <section
        v-if="selectedChoices.length > 0"
        class="selected-candidates"
        aria-label="已选候选"
      >
        <div class="archive-section-heading">
          <div>
            <p class="section-index">
              SELECTED
            </p>
            <h2>已选择 {{ selectedChoices.length }} / 4</h2>
          </div>
        </div>
        <ol>
          <li
            v-for="(choice, index) in selectedChoices"
            :key="choice.key"
          >
            <img
              :src="choice.image"
              :alt="choice.imageAlt"
            >
            <div>
              <span>{{ String(index + 1).padStart(2, '0') }}</span>
              <b>{{ choice.name }}</b>
              <small>{{ choice.personaName }} · 预制示例</small>
              <div class="candidate-inline-actions">
                <button
                  type="button"
                  @click="startReplacement(index)"
                >
                  换方案：{{ choice.name }}
                </button>
                <button
                  type="button"
                  @click="removeChoice(index)"
                >
                  移除
                </button>
              </div>
            </div>
          </li>
        </ol>
        <p
          v-if="replacingIndex !== null"
          class="replace-status"
          role="status"
        >
          在下方选择一个未加入的方案完成替换。
        </p>
      </section>

      <section
        class="demo-candidate-picker"
        aria-labelledby="demo-candidate-title"
      >
        <p class="section-index">
          SIX PRESETS
        </p>
        <h2 id="demo-candidate-title">
          选择预制短发
        </h2>
        <p>候选不会重复；选满 4 个后，先移除或使用“换方案”。</p>

        <div class="demo-candidate-grid">
          <figure
            v-for="choice in archiveDemoCandidates"
            :key="choice.key"
            :class="{ 'demo-candidate--selected': isSelected(choice) }"
          >
            <img
              :src="choice.image"
              :alt="choice.imageAlt"
            >
            <figcaption>
              <span>{{ choice.personaName }}</span>
              <b>{{ choice.name }}</b>
              <button
                type="button"
                :disabled="!isSelected(choice) && replacingIndex === null && selectedChoices.length >= 4"
                @click="choose(choice)"
              >
                {{ choiceButtonLabel(choice) }}
              </button>
            </figcaption>
          </figure>
        </div>
      </section>

      <aside class="future-source-note">
        <b>自己的参考图会在本地图片处理阶段开放</b>
        <p>当前不提供未经处理的用户文件上传。只有存在真实剪后记录时，才会开放从历史记录选择的入口。</p>
      </aside>

      <button
        class="submit-button"
        type="submit"
        :disabled="store.saving || selectedChoices.length < 2 || selectedChoices.length > 4"
      >
        {{ store.saving ? '正在保存…' : isEditing ? '保存修改' : '保存计划' }}
      </button>
    </form>
  </section>
</template>
