<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useArchiveStore } from '../features/archive/archiveStore'
import {
  isSafelyEditableCandidate,
  resolveCandidateImageBlob,
} from '../features/archive/candidateSources'
import { archiveDemoCandidates } from '../features/archive/demoCandidates'
import { resolveCandidateDecisionSummary } from '../features/archive/candidateDecisionSummary'
import { isValidPlanCandidateCount } from '../features/archive/types'
import type { Candidate } from '../features/archive/types'
import { shouldDiscardPollDraftOnArchiveDeletion } from '../features/polls/archivePollDeletion'
import {
  defaultPollDraftRepository,
  POLL_DRAFT_REPOSITORY_KEY,
} from '../features/polls/pollRuntime'
import type { PollDraft } from '../features/polls/types'
import { tactileDirective as vTactile } from '../ui/tactile'

const route = useRoute()
const router = useRouter()
const store = useArchiveStore()
const pollDraftRepository = inject(POLL_DRAFT_REPOSITORY_KEY, defaultPollDraftRepository)
const planId = computed(() => typeof route.params.id === 'string' ? route.params.id : '')
const plan = computed(() => store.plans.find(({ id }) => id === planId.value))
const candidates = computed(() => store.candidatesByPlanId[planId.value] ?? [])
const brief = computed(() => store.briefsByPlanId[planId.value])
const candidateObjectUrls = ref<Record<string, string>>({})
const knownDemoPaths = new Set(archiveDemoCandidates.map(({ image }) => image))
let viewActive = false
const canEdit = computed(() => {
  const currentPlan = plan.value
  return Boolean(
    currentPlan
    && currentPlan.status !== 'completed'
    && (
      currentPlan.mode === 'repeat'
      || isValidPlanCandidateCount(currentPlan.mode, candidates.value.length)
    )
    && candidates.value.every((candidate) => isSafelyEditableCandidate(candidate, knownDemoPaths)),
  )
})
const hasDemoCandidates = computed(() => candidates.value.some(({ source }) => source === 'demo_ai'))
const pollDeleteError = ref('')

const statusLabel = computed(() => plan.value?.status === 'ready' ? '可带去沟通' : plan.value?.status === 'completed' ? '已完成' : '草稿')

const deletePlan = async () => {
  const current = plan.value
  if (!current) {
    return
  }

  pollDeleteError.value = ''
  let pollDraft: PollDraft | undefined
  try {
    pollDraft = await pollDraftRepository.getByPlanId(current.id)
  } catch {
    pollDeleteError.value = '旧分享草稿暂时无法读取，计划未删除。请稍后重试。'
    return
  }

  const shouldDiscardPollDraft = pollDraft
    ? shouldDiscardPollDraftOnArchiveDeletion(pollDraft)
    : false
  const hasMutableLegacyDraft = pollDraft
    ? shouldDiscardPollDraft && pollDraft.status !== 'revoked'
    : false
  const confirmation = hasMutableLegacyDraft
    ? `此计划还有旧分享草稿。继续会先删除其中的遮罩图、上传进度和管理信息，再删除“${current.title}”计划。确定继续吗？`
    : `确定删除“${current.title}”计划吗？档案仍会保留。`
  if (!window.confirm(confirmation)) return

  try {
    await pollDraftRepository.retireForArchiveDeletion([current.id])
  } catch {
    pollDeleteError.value = '旧分享草稿未能清理，计划未删除。请稍后重试。'
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
    return '我的参考图'
  }
  if (candidate.source === 'past_record') {
    return '真实剪后记录'
  }
  return '预制示例 · 非 AI 生成'
}

onMounted(async () => {
  viewActive = true
  await store.load()
  if (!viewActive) return
  buildCandidateUrls()
  if (plan.value) {
    document.title = `${plan.value.title}｜咋剪发`
  }
})
onBeforeUnmount(() => {
  viewActive = false
  revokeCandidateUrls()
})
</script>

<template>
  <section
    class="plan-detail-view"
    :aria-labelledby="store.loading || store.error ? 'plan-detail-state-title' : plan ? 'plan-detail-title' : 'plan-detail-missing-title'"
  >
    <RouterLink
      v-tactile
      class="back-link"
      to="/archive"
    >
      <span aria-hidden="true">←</span> 返回档案
    </RouterLink>

    <div
      v-if="store.loading"
    >
      <h1 id="plan-detail-state-title">
        正在读取下次剪法
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
        v-tactile
        class="text-link"
        to="/archive"
      >
        返回档案
      </RouterLink>
    </div>

    <template v-else>
      <header class="plan-detail-header">
        <p class="eyebrow">
          这次准备怎么剪 · 仅保存在本机
        </p>
        <h1 id="plan-detail-title">
          {{ plan.title }}
        </h1>
        <p>{{ plan.date }} · {{ statusLabel }}</p>
        <div class="detail-actions">
          <RouterLink
            v-tactile
            class="plan-primary-action"
            :to="`/archive/plans/${plan.id}/brief`"
            :aria-label="brief ? '给理发师看' : '准备给理发师看的内容'"
          >
            {{ brief ? '给理发师看' : '准备给理发师看' }}
          </RouterLink>
          <RouterLink
            v-if="canEdit"
            v-tactile
            class="text-link"
            :to="`/archive/plans/${plan.id}/edit`"
          >
            调整这次剪法
          </RouterLink>
          <p
            v-else
            class="detail-readonly"
          >
            旧来源或已完成的剪法暂时不能修改
          </p>
          <button
            v-tactile
            class="danger-text-button"
            type="button"
            :disabled="store.saving"
            @click="deletePlan"
          >
            删除计划
          </button>
        </div>
      </header>

      <p
        v-if="pollDeleteError"
        class="form-alert"
        role="alert"
      >
        {{ pollDeleteError }}
      </p>

      <aside
        v-if="hasDemoCandidates"
        class="sample-disclosure sample-disclosure--detail"
        aria-label="候选来源说明"
      >
        <b>示例体验 · 非用户生成</b>
        <p>标为“预制示例”的方向不是基于你的照片生成；最终能否剪出相近效果，请让理发师现场确认。</p>
      </aside>

      <ol
        class="candidate-detail-list"
        aria-label="这次比较的方向"
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
              <dl class="candidate-decision-summary">
                <div><dt>现在能不能剪</dt><dd>{{ resolveCandidateDecisionSummary(candidate).feasibility }}</dd></div>
                <div><dt>每天打理</dt><dd>{{ resolveCandidateDecisionSummary(candidate).maintenance }}</dd></div>
                <div><dt>变化程度</dt><dd>{{ resolveCandidateDecisionSummary(candidate).change }}</dd></div>
                <div class="candidate-decision-summary__risk">
                  <dt>最大风险</dt><dd>{{ resolveCandidateDecisionSummary(candidate).risk }}</dd>
                </div>
              </dl>
              <span
                v-if="brief?.targetCandidateId === candidate.id"
                class="candidate-main-badge"
              >当前主方案</span>
              <RouterLink
                v-else
                v-tactile
                class="candidate-main-action"
                :to="{ path: `/archive/plans/${plan.id}/brief`, query: { target: candidate.id } }"
                :aria-label="`选“${candidate.name}”为主方案`"
              >
                选为主方案
              </RouterLink>
            </figcaption>
          </figure>
        </li>
      </ol>
    </template>
  </section>
</template>
