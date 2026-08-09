<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useArchiveStore } from '../features/archive/archiveStore'
import {
  isSafelyEditableCandidate,
  resolveCandidateImageBlob,
} from '../features/archive/candidateSources'
import { archiveDemoCandidates } from '../features/archive/demoCandidates'
import type { Candidate } from '../features/archive/types'

const route = useRoute()
const router = useRouter()
const store = useArchiveStore()
const planId = computed(() => typeof route.params.id === 'string' ? route.params.id : '')
const plan = computed(() => store.plans.find(({ id }) => id === planId.value))
const candidates = computed(() => store.candidatesByPlanId[planId.value] ?? [])
const brief = computed(() => store.briefsByPlanId[planId.value])
const candidateObjectUrls = ref<Record<string, string>>({})
const knownDemoPaths = new Set(archiveDemoCandidates.map(({ image }) => image))
const canEdit = computed(() => (
  plan.value?.status !== 'completed'
  && candidates.value.length >= 2
  && candidates.value.length <= 4
  && candidates.value.every((candidate) => isSafelyEditableCandidate(candidate, knownDemoPaths))
))
const hasDemoCandidates = computed(() => candidates.value.some(({ source }) => source === 'demo_ai'))

const statusLabel = computed(() => plan.value?.status === 'ready' ? '可带去沟通' : plan.value?.status === 'completed' ? '已完成' : '草稿')

const deletePlan = async () => {
  const current = plan.value
  if (!current || !window.confirm(`确定删除“${current.title}”计划吗？档案仍会保留。`)) {
    return
  }
  if (await store.deletePlan(current.id)) {
    await router.push('/archive')
  }
}

const revokeCandidateUrls = () => {
  Object.values(candidateObjectUrls.value).forEach((url) => URL.revokeObjectURL(url))
  candidateObjectUrls.value = {}
}

const buildCandidateUrls = () => {
  revokeCandidateUrls()
  candidateObjectUrls.value = Object.fromEntries(candidates.value.flatMap((candidate) => {
    const image = resolveCandidateImageBlob(candidate, store.photosByRecordId)
    return image ? [[candidate.id, URL.createObjectURL(image)]] : []
  }))
}

const candidateImageSource = (candidate: Candidate) => (
  candidate.demoImagePath ?? candidateObjectUrls.value[candidate.id] ?? ''
)

const candidateSourceLabel = (candidate: Candidate) => {
  if (candidate.source === 'user_reference') {
    return 'OWN · 当前设备参考图'
  }
  if (candidate.source === 'past_record') {
    return 'PAST · 真实剪后记录'
  }
  return 'DEMO · 示例体验'
}

onMounted(async () => {
  await store.load()
  buildCandidateUrls()
  if (plan.value) {
    document.title = `${plan.value.title}｜咋剪发`
  }
})
onBeforeUnmount(revokeCandidateUrls)
</script>

<template>
  <section
    class="plan-detail-view"
    :aria-labelledby="store.loading || store.error ? 'plan-detail-state-title' : plan ? 'plan-detail-title' : 'plan-detail-missing-title'"
  >
    <RouterLink
      class="back-link"
      to="/archive"
    >
      <span aria-hidden="true">←</span> 返回档案
    </RouterLink>

    <div
      v-if="store.loading"
    >
      <h1 id="plan-detail-state-title">
        发型计划详情
      </h1>
      <p
        class="archive-loading"
        role="status"
      >
        正在读取本地计划…
      </p>
    </div>

    <div
      v-else-if="store.error"
    >
      <h1 id="plan-detail-state-title">
        暂时无法读取计划
      </h1>
      <p
        class="form-alert"
        role="alert"
      >
        {{ store.error }}
      </p>
    </div>

    <div
      v-else-if="!plan"
      class="archive-empty archive-empty--inner"
    >
      <h1 id="plan-detail-missing-title">
        没有找到这个计划
      </h1>
      <p>它可能已被删除，或这台设备没有保存过它。</p>
      <RouterLink
        class="text-link"
        to="/archive"
      >
        返回档案
      </RouterLink>
    </div>

    <template v-else>
      <header class="plan-detail-header">
        <p class="eyebrow">
          PLAN DETAIL · LOCAL
        </p>
        <h1 id="plan-detail-title">
          {{ plan.title }}
        </h1>
        <p>{{ plan.date }} · {{ statusLabel }}</p>
        <div class="detail-actions">
          <RouterLink
            v-if="canEdit"
            class="text-link"
            :to="`/archive/plans/${plan.id}/poll/new`"
          >
            发起好友投票
          </RouterLink>
          <RouterLink
            class="text-link"
            :to="`/archive/plans/${plan.id}/brief`"
          >
            {{ brief ? '查看沟通卡' : '创建沟通卡' }}
          </RouterLink>
          <RouterLink
            v-if="canEdit"
            class="text-link"
            :to="`/archive/plans/${plan.id}/edit`"
          >
            编辑计划
          </RouterLink>
          <p
            v-else
            class="detail-readonly"
          >
            旧来源候选或已完成计划暂时只读
          </p>
          <button
            class="danger-text-button"
            type="button"
            :disabled="store.saving"
            @click="deletePlan"
          >
            删除计划
          </button>
        </div>
      </header>

      <aside
        v-if="hasDemoCandidates"
        class="sample-disclosure sample-disclosure--detail"
        aria-label="候选来源说明"
      >
        <b>示例体验 · 非用户生成</b>
        <p>标为 DEMO 的方向是预制素材，不是基于你的照片生成；最终可剪性需由理发师现场确认。</p>
      </aside>

      <ol
        class="candidate-detail-list"
        aria-label="计划候选"
      >
        <li
          v-for="candidate in candidates"
          :key="candidate.id"
        >
          <figure>
            <img
              v-if="candidateImageSource(candidate)"
              :src="candidateImageSource(candidate)"
              :alt="`${candidate.name}${candidate.source === 'demo_ai' ? '预制示例' : '本地候选图'}`"
            >
            <figcaption>
              <span>0{{ candidate.order }} · {{ candidateSourceLabel(candidate) }}</span>
              <h2>{{ candidate.name }}</h2>
              <p>{{ candidate.notes }}</p>
            </figcaption>
          </figure>
        </li>
      </ol>
    </template>
  </section>
</template>
