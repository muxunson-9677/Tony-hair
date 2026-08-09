<script setup lang="ts">
import { computed, inject, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'

import { useArchiveStore } from '../features/archive/archiveStore'
import type { Candidate } from '../features/archive/types'
import MaskEditor from '../features/privacy/MaskEditor.vue'
import type { MaskExportResult } from '../features/privacy/types'
import {
  defaultPollDraftRepository,
  defaultPollService,
  POLL_DRAFT_REPOSITORY_KEY,
  POLL_SERVICE_KEY,
} from '../features/polls/pollRuntime'
import { PollServiceError } from '../features/polls/PollService'
import { buildPollCandidateSeeds, loadPollCandidateBlob } from '../features/polls/pollCreateQueue'
import type { PollDraft } from '../features/polls/types'

type Stage = 'access' | 'consent' | 'mask' | 'publish' | 'done'

const route = useRoute()
const archive = useArchiveStore()
const repository = inject(POLL_DRAFT_REPOSITORY_KEY, defaultPollDraftRepository)
const service = inject(POLL_SERVICE_KEY, defaultPollService)
const planId = computed(() => typeof route.params.id === 'string' ? route.params.id : '')
const plan = computed(() => archive.plans.find(({ id }) => id === planId.value))
const candidates = computed(() => archive.candidatesByPlanId[planId.value] ?? [])
const stage = ref<Stage>('access')
const accessCode = ref('')
const title = ref('帮我选下次发型')
const authorized = ref(false)
const draft = ref<PollDraft | null>(null)
const currentCandidateBlob = ref<Blob | null>(null)
const editorCandidateId = ref<string | null>(null)
let candidateLoadGeneration = 0
const loadingCandidate = ref(false)
const busy = ref(false)
const errorMessage = ref('')
const statusMessage = ref('')
const copied = ref(false)

const nextOptionIndex = computed(() => draft.value?.options.findIndex(({ maskedImage }) => !maskedImage) ?? -1)
const currentOption = computed(() => (
  nextOptionIndex.value >= 0 ? draft.value?.options[nextOptionIndex.value] : undefined
))
const currentCandidate = computed(() => (
  candidates.value.find(({ id }) => id === currentOption.value?.candidateId)
))
const queuePosition = computed(() => {
  if (!draft.value || nextOptionIndex.value < 0) return ''
  return `${String(nextOptionIndex.value + 1).padStart(2, '0')} / ${String(draft.value.options.length).padStart(2, '0')}`
})
const shareLink = computed(() => draft.value?.pollId
  ? `${window.location.origin}/p/${draft.value.pollId}`
  : '')

const readableError = (error: unknown, fallback: string) => {
  if (error instanceof PollServiceError) {
    if (error.kind === 'offline') return '网络不可用，当前进度仍保存在这台设备。联网后可继续。'
    if (error.code === 'ACCESS_DENIED') return '体验码不正确，请检查后重试。'
    if (error.code === 'BLOB_UNAVAILABLE') return '遮罩图上传失败，本地图片和上传标识已保留，可以安全重试。'
    if (error.code === 'ACTIVE_POLL_LIMIT') return '当前体验会话已有 10 个活动投票，请先撤销旧投票。'
    if (error.code === 'SHARE_STORAGE_LIMIT') return '免费分享空间暂时已满，当前草稿仍保存在本机。'
    return error.message
  }
  return fallback
}

const verifyAccess = async () => {
  if (!accessCode.value.trim()) {
    errorMessage.value = '请输入体验码。'
    return
  }
  busy.value = true
  errorMessage.value = ''
  try {
    await service.verifyAccess(accessCode.value)
    stage.value = 'consent'
  } catch (error) {
    errorMessage.value = readableError(error, '体验码验证失败，请稍后重试。')
  } finally {
    busy.value = false
  }
}

const prepareCandidate = async (candidate: Candidate | undefined) => {
  if (!candidate) return
  const generation = candidateLoadGeneration + 1
  candidateLoadGeneration = generation
  currentCandidateBlob.value = null
  editorCandidateId.value = null
  loadingCandidate.value = true
  errorMessage.value = ''
  try {
    const blob = await loadPollCandidateBlob(
      candidate,
      archive.photosByRecordId,
    )
    if (generation !== candidateLoadGeneration || currentCandidate.value?.id !== candidate.id) return
    currentCandidateBlob.value = blob
    editorCandidateId.value = candidate.id
  } catch {
    if (generation === candidateLoadGeneration) {
      errorMessage.value = '候选图片读取失败，请返回计划检查图片后重试。'
    }
  } finally {
    if (generation === candidateLoadGeneration) loadingCandidate.value = false
  }
}

const startQueue = async () => {
  if (!authorized.value || !plan.value) return
  if (candidates.value.length < 2 || candidates.value.length > 4) {
    errorMessage.value = '发起投票需要 2 到 4 个候选方案。'
    return
  }
  busy.value = true
  errorMessage.value = ''
  try {
    draft.value = await repository.createDraft(
      { planId: plan.value.id, title: title.value.trim() || '帮我选下次发型' },
      buildPollCandidateSeeds(candidates.value),
    )
    if (draft.value.status === 'active' && draft.value.pollId) {
      stage.value = 'done'
      return
    }
    if (nextOptionIndex.value < 0) {
      stage.value = 'publish'
      return
    }
    stage.value = 'mask'
    await prepareCandidate(currentCandidate.value)
  } catch {
    errorMessage.value = '本机无法保存投票草稿。请退出无痕模式或清理浏览器空间后重试。'
  } finally {
    busy.value = false
  }
}

const acceptMaskedImage = async (result: MaskExportResult) => {
  const currentDraft = draft.value
  const option = currentOption.value
  if (busy.value || !currentDraft || !option || editorCandidateId.value !== option.candidateId) return
  busy.value = true
  candidateLoadGeneration += 1
  currentCandidateBlob.value = null
  editorCandidateId.value = null
  errorMessage.value = ''
  try {
    draft.value = await repository.saveMaskedImage(currentDraft.id, option.candidateId, result)
    if (nextOptionIndex.value < 0) {
      stage.value = 'publish'
      statusMessage.value = '所有候选都已生成单层遮罩图，原图与编辑图层不会上传。'
    } else {
      await prepareCandidate(currentCandidate.value)
    }
  } catch {
    errorMessage.value = '遮罩图未能保存到本机，请重试。'
  } finally {
    busy.value = false
  }
}

const publishPoll = async () => {
  if (!draft.value) return
  busy.value = true
  errorMessage.value = ''
  statusMessage.value = '正在上传遮罩后的单层图…'
  try {
    let currentDraft = draft.value
    for (const option of currentDraft.options) {
      if (option.assetId) continue
      if (!option.maskedImage) throw new Error('missing masked image')
      currentDraft = await repository.markOptionUploading(currentDraft.id, option.candidateId)
      draft.value = currentDraft
      try {
        const uploaded = await service.uploadMasked({
          uploadId: option.uploadId,
          image: option.maskedImage,
        })
        currentDraft = await repository.saveUploadedAsset(currentDraft.id, option.candidateId, {
          assetId: uploaded.assetId,
          imageUrl: uploaded.url,
        })
        draft.value = currentDraft
      } catch (error) {
        currentDraft = await repository.markOptionFailed(
          currentDraft.id,
          option.candidateId,
          error instanceof PollServiceError ? error.code : 'UPLOAD_FAILED',
        )
        draft.value = currentDraft
        throw error
      }
    }

    statusMessage.value = '图片已就绪，正在创建投票…'
    currentDraft = await repository.markCreating(currentDraft.id)
    draft.value = currentDraft
    const created = await service.createPoll(currentDraft)
    draft.value = await repository.markActive(currentDraft.id, created.pollId, created.expiresAt)
    stage.value = 'done'
    statusMessage.value = '投票已创建。管理密钥只保存在这台设备。'
  } catch (error) {
    errorMessage.value = readableError(error, '投票没有创建完成，本地草稿已保留，可以重试。')
    statusMessage.value = ''
  } finally {
    busy.value = false
  }
}

const copyShareLink = async () => {
  if (!shareLink.value) return
  copied.value = false
  try {
    await navigator.clipboard.writeText(shareLink.value)
    copied.value = true
  } catch {
    errorMessage.value = '自动复制失败，请长按下方链接复制。'
  }
}

onMounted(async () => {
  await archive.load()
  if (plan.value) {
    title.value = `帮我选：${plan.value.title}`.slice(0, 60)
  }
})
</script>

<template>
  <section
    class="poll-create-view"
    aria-labelledby="poll-create-title"
  >
    <header class="poll-create-header">
      <RouterLink
        class="back-link"
        :to="`/archive/plans/${planId}`"
      >
        ← 返回计划
      </RouterLink>
      <p class="eyebrow">
        PRIVATE PREP · PUBLIC VOTE
      </p>
      <h1 id="poll-create-title">
        发起<br>好友投票
      </h1>
      <p>每张候选先在本机遮罩并扁平化，只上传新的单层分享图。</p>
    </header>

    <p
      v-if="archive.loading"
      class="poll-state"
      role="status"
    >
      正在读取本地计划…
    </p>
    <p
      v-else-if="!plan"
      class="poll-state"
      role="alert"
    >
      没有找到这个发型计划。
    </p>

    <template v-else>
      <aside class="poll-privacy-boundary">
        <b>遮罩不等于匿名</b>
        <p>发型、衣着和背景仍可能让熟人认出你。原图、人脸关键点和编辑图层不会上传。</p>
      </aside>

      <form
        v-if="stage === 'access'"
        class="poll-step"
        @submit.prevent="verifyAccess"
      >
        <p class="poll-step__index">
          01 · 体验权限
        </p>
        <label>
          <span>体验码</span>
          <input
            v-model="accessCode"
            type="password"
            autocomplete="one-time-code"
            maxlength="128"
          >
        </label>
        <button
          class="poll-primary-button"
          type="submit"
          :disabled="busy"
        >
          {{ busy ? '正在验证…' : '验证体验码' }}
        </button>
      </form>

      <section
        v-else-if="stage === 'consent'"
        class="poll-step"
        aria-labelledby="poll-consent-title"
      >
        <p class="poll-step__index">
          02 · 照片授权
        </p>
        <h2 id="poll-consent-title">
          先确认照片可以使用
        </h2>
        <label class="poll-title-field">
          <span>投票标题</span>
          <input
            v-model="title"
            maxlength="60"
          >
        </label>
        <label class="authorization-check">
          <input
            v-model="authorized"
            type="checkbox"
          >
          <span>我已满 18 岁；候选照片是本人，或已获得照片本人明确授权。</span>
        </label>
        <button
          class="poll-primary-button"
          type="button"
          :disabled="busy || !authorized"
          @click="startQueue"
        >
          开始逐张遮罩
        </button>
      </section>

      <section
        v-else-if="stage === 'mask'"
        class="poll-mask-step"
        aria-labelledby="poll-mask-title"
      >
        <div class="poll-mask-heading">
          <p class="poll-step__index">
            03 · 本机遮罩
          </p>
          <span>{{ queuePosition }}</span>
          <h2 id="poll-mask-title">
            {{ currentCandidate?.name }}
          </h2>
          <p>确认遮罩位置后导出；导出完成才会进入下一张。</p>
        </div>
        <p
          v-if="loadingCandidate"
          class="poll-state"
          role="status"
        >
          正在准备候选图片…
        </p>
        <MaskEditor
          v-if="currentCandidateBlob"
          :initial-blob="currentCandidateBlob"
          :allow-selection="false"
          @exported="acceptMaskedImage"
        />
      </section>

      <section
        v-else-if="stage === 'publish'"
        class="poll-step poll-publish-step"
        aria-labelledby="poll-publish-title"
      >
        <p class="poll-step__index">
          04 · 创建链接
        </p>
        <h2 id="poll-publish-title">
          {{ draft?.options.length }} 张遮罩图已在本机就绪
        </h2>
        <p>点击后才会上传遮罩后的图片。相同 uploadId、clientRequestId 和管理密钥已先保存在本机，可安全重试。</p>
        <ol class="poll-ready-list">
          <li
            v-for="option in draft?.options"
            :key="option.candidateId"
          >
            <span>{{ option.label }}</span>
            <b>{{ option.assetId ? '已上传' : option.uploadStatus === 'failed' ? '可重试' : '仅在本机' }}</b>
          </li>
        </ol>
        <button
          class="poll-primary-button"
          type="button"
          :disabled="busy"
          @click="publishPoll"
        >
          {{ busy ? '正在创建…' : '上传并创建投票' }}
        </button>
      </section>

      <section
        v-else
        class="poll-step poll-created"
        aria-labelledby="poll-created-title"
      >
        <p class="poll-step__index">
          READY · 7 DAYS
        </p>
        <h2 id="poll-created-title">
          把选择交给朋友
        </h2>
        <p>好友无需登录。分享链接默认 7 天有效，每个浏览器只能投一票。</p>
        <a
          class="poll-share-link"
          :href="shareLink"
        >{{ shareLink }}</a>
        <button
          class="poll-primary-button"
          type="button"
          @click="copyShareLink"
        >
          {{ copied ? '已复制分享链接' : '复制分享链接' }}
        </button>
        <RouterLink
          class="poll-secondary-link"
          :to="`/polls/${draft?.pollId}/manage`"
        >
          查看结果并管理
        </RouterLink>
      </section>

      <p
        v-if="statusMessage"
        class="poll-status"
        role="status"
      >
        {{ statusMessage }}
      </p>
      <p
        v-if="errorMessage"
        class="poll-error"
        role="alert"
      >
        {{ errorMessage }}
      </p>
    </template>
  </section>
</template>
