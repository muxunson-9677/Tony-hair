<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive } from 'vue'
import { useRoute } from 'vue-router'

import { PRODUCT_NAME } from '../config/brand'
import { pageTitle } from '../config/brand'
import { useArchiveStore } from '../features/archive/archiveStore'
import type { Candidate, HaircutPhoto } from '../features/archive/types'
import { MaskEngine } from '../features/privacy/MaskEngine'
import type { MaskTransform } from '../features/privacy/types'
import {
  SHARE_KIND_LABELS,
  buildAvoidCard,
  buildBriefCard,
  buildChooseCard,
  buildCompareCard,
  buildReviewCard,
  type ShareCardLayout,
  type ShareKind,
} from '../features/share/shareCards'
import { exportShareImage } from '../features/share/shareExport'
import { createSharePhotoResolver, type SharePhotoResolver } from '../features/share/sharePhotos'
import { renderShareCard } from '../features/share/shareRender'
import { tactileDirective as vTactile } from '../ui/tactile'

const route = useRoute()
const store = useArchiveStore()

const recordId = computed(() => typeof route.query.record === 'string' ? route.query.record : '')
const planId = computed(() => typeof route.query.plan === 'string' ? route.query.plan : '')

const record = computed(() => store.records.find(({ id }) => id === recordId.value))
const recordPhotos = computed(() => store.photosByRecordId[recordId.value] ?? [])
const beforePhoto = computed(() => recordPhotos.value.find(({ stage }) => stage === 'before'))
const afterPhoto = computed(() => (
  recordPhotos.value.find(({ stage }) => stage === 'after')
    ?? recordPhotos.value.find(({ stage }) => stage === 'styled')
    ?? recordPhotos.value.find(({ stage }) => stage === 'unstyled')
))

const plan = computed(() => store.plans.find(({ id }) => id === planId.value))
const brief = computed(() => store.briefsByPlanId[planId.value])
const planCandidates = computed(() => store.candidatesByPlanId[planId.value] ?? [])
const targetCandidate = computed(() => (
  planCandidates.value.find(({ id }) => id === brief.value?.targetCandidateId)
))
const candidateHasImage = (candidate: Candidate) => Boolean(candidate.referenceImage || candidate.demoImagePath)
const chooseCandidates = computed(() => planCandidates.value.filter(candidateHasImage).slice(0, 2))

const recordLines = computed(() => {
  const current = record.value
  if (!current) {
    return []
  }
  if (current.outcome === 'repeat') {
    return store.standardStyles
      .filter((style) => style.recordId === current.id && style.active)
      .map((style) => style.name)
  }
  if (current.outcome === 'adjust') {
    return [...current.adjustmentNotes]
  }
  return store.avoidRules
    .filter((rule) => rule.recordId === current.id && rule.active)
    .map((rule) => rule.text)
})

interface CardAvailability {
  readonly kind: ShareKind
  readonly available: boolean
  readonly reason?: string
  readonly usesPortrait: boolean
}

const availabilities = computed((): CardAvailability[] => {
  if (recordId.value) {
    if (!record.value) {
      return []
    }
    const outcome = record.value.outcome
    return [
      {
        kind: 'compare',
        available: Boolean(beforePhoto.value && afterPhoto.value),
        reason: '这条记录缺少剪前或剪后照片，拼不了对比图。',
        usesPortrait: true,
      },
      { kind: 'review', available: true, usesPortrait: Boolean(afterPhoto.value) },
      {
        kind: 'avoid',
        available: outcome !== 'repeat',
        reason: '这次剪得不错，没有要避雷的内容。',
        usesPortrait: Boolean(afterPhoto.value),
      },
    ]
  }
  if (planId.value) {
    if (!plan.value) {
      return []
    }
    return [
      {
        kind: 'brief',
        available: Boolean(brief.value && targetCandidate.value),
        reason: '这个计划还没保存Tony卡或目标发型。',
        usesPortrait: Boolean(targetCandidate.value?.referenceImage),
      },
      {
        kind: 'choose',
        available: chooseCandidates.value.length >= 2,
        reason: '至少需要两个带图片的候选发型，才能做「帮我选」。',
        usesPortrait: chooseCandidates.value.some((candidate) => candidate.referenceImage),
      },
    ]
  }
  return []
})

interface CardState {
  status: 'idle' | 'working' | 'ready' | 'blocked' | 'failed'
  previewUrl: string
  blob: Blob | null
  note: string
  exportNote: string
}

const cardStates = reactive<Record<ShareKind, CardState>>({
  compare: { status: 'idle', previewUrl: '', blob: null, note: '', exportNote: '' },
  review: { status: 'idle', previewUrl: '', blob: null, note: '', exportNote: '' },
  avoid: { status: 'idle', previewUrl: '', blob: null, note: '', exportNote: '' },
  brief: { status: 'idle', previewUrl: '', blob: null, note: '', exportNote: '' },
  choose: { status: 'idle', previewUrl: '', blob: null, note: '', exportNote: '' },
})

let maskEngine: MaskEngine | null = null
let resolvePhoto: SharePhotoResolver | null = null
const photoResolver = (): SharePhotoResolver => {
  if (!resolvePhoto) {
    maskEngine = new MaskEngine()
    resolvePhoto = createSharePhotoResolver(maskEngine)
  }
  return resolvePhoto
}

interface AdmittedPhoto {
  readonly blob: Blob
  readonly transform?: MaskTransform
  readonly statusLine: string
}

/** 用户人像照片：过本地人脸检测；拦截时抛出说明文案。 */
const admitUserPhoto = async (blob: Blob): Promise<AdmittedPhoto> => {
  const admission = await photoResolver()(blob)
  if (admission.status === 'blocked') {
    throw new ShareBlockedError(admission.statusLine)
  }
  return { blob, transform: admission.transform, statusLine: admission.statusLine }
}

class ShareBlockedError extends Error {}

/** demo 示例图非用户人像，直接同源加载，不检测。 */
const fetchDemoBlob = async (path: string): Promise<Blob> => {
  const response = await fetch(path)
  if (!response.ok) {
    throw new Error('示例图片读取失败，请重试。')
  }
  return response.blob()
}

const candidatePhoto = async (candidate: Candidate): Promise<AdmittedPhoto> => {
  if (candidate.referenceImage) {
    return admitUserPhoto(candidate.referenceImage)
  }
  if (candidate.demoImagePath) {
    return { blob: await fetchDemoBlob(candidate.demoImagePath), statusLine: '示例图片，无需遮罩' }
  }
  throw new Error('候选发型没有图片。')
}

const recordPhotoAdmitted = (photo: HaircutPhoto) => admitUserPhoto(photo.image)

const buildLayoutAndPhotos = async (
  kind: ShareKind,
): Promise<{ layout: ShareCardLayout, photos: Record<string, Blob>, privacyNotes: string[] }> => {
  const currentRecord = record.value
  const privacyNotes: string[] = []
  const remember = (admitted: AdmittedPhoto) => {
    if (admitted.transform) {
      privacyNotes.push(admitted.statusLine)
    }
    return admitted
  }

  if (kind === 'compare' && currentRecord && beforePhoto.value && afterPhoto.value) {
    const before = remember(await recordPhotoAdmitted(beforePhoto.value))
    const after = remember(await recordPhotoAdmitted(afterPhoto.value))
    return {
      layout: buildCompareCard({
        styleName: currentRecord.styleName,
        date: currentRecord.date,
        satisfaction: currentRecord.satisfaction,
        beforeKey: 'before',
        afterKey: 'after',
        beforeMask: before.transform,
        afterMask: after.transform,
      }),
      photos: { before: before.blob, after: after.blob },
      privacyNotes,
    }
  }

  if (kind === 'review' && currentRecord) {
    const after = afterPhoto.value ? remember(await recordPhotoAdmitted(afterPhoto.value)) : null
    return {
      layout: buildReviewCard({
        styleName: currentRecord.styleName,
        date: currentRecord.date,
        satisfaction: currentRecord.satisfaction,
        outcome: currentRecord.outcome,
        lines: recordLines.value,
        photoKey: after ? 'after' : undefined,
        photoMask: after?.transform,
      }),
      photos: after ? { after: after.blob } : {},
      privacyNotes,
    }
  }

  if (kind === 'avoid' && currentRecord && currentRecord.outcome !== 'repeat') {
    const after = afterPhoto.value ? remember(await recordPhotoAdmitted(afterPhoto.value)) : null
    const marks = (currentRecord.regionMarks ?? [])
      .filter((mark) => !after || (mark.photoId && mark.photoId === afterPhoto.value?.id))
    return {
      layout: buildAvoidCard({
        styleName: currentRecord.styleName,
        date: currentRecord.date,
        avoidLines: recordLines.value,
        regionMarks: marks,
        photoKey: after ? 'after' : undefined,
        photoMask: after?.transform,
      }),
      photos: after ? { after: after.blob } : {},
      privacyNotes,
    }
  }

  if (kind === 'brief' && plan.value && brief.value && targetCandidate.value) {
    const reference = remember(await candidatePhoto(targetCandidate.value))
    return {
      layout: buildBriefCard({
        planTitle: plan.value.title,
        candidateName: targetCandidate.value.name,
        referenceKey: 'reference',
        referenceMask: reference.transform,
        topPriorities: brief.value.topPriorities,
        absoluteAvoids: brief.value.absoluteAvoids,
      }),
      photos: { reference: reference.blob },
      privacyNotes,
    }
  }

  if (kind === 'choose' && chooseCandidates.value.length >= 2) {
    const [candidateA, candidateB] = chooseCandidates.value
    const optionA = remember(await candidatePhoto(candidateA!))
    const optionB = remember(await candidatePhoto(candidateB!))
    return {
      layout: buildChooseCard({
        optionAName: candidateA!.name,
        optionBName: candidateB!.name,
        optionAKey: 'a',
        optionBKey: 'b',
        optionAMask: optionA.transform,
        optionBMask: optionB.transform,
      }),
      photos: { a: optionA.blob, b: optionB.blob },
      privacyNotes,
    }
  }

  throw new Error('这类分享图当前不可用。')
}

const generateCard = async (kind: ShareKind) => {
  const state = cardStates[kind]
  state.status = 'working'
  state.note = ''
  state.exportNote = ''
  try {
    const { layout, photos, privacyNotes } = await buildLayoutAndPhotos(kind)
    const blob = await renderShareCard(layout, photos)
    if (state.previewUrl) {
      URL.revokeObjectURL(state.previewUrl)
    }
    state.blob = blob
    state.previewUrl = URL.createObjectURL(blob)
    state.status = 'ready'
    state.note = privacyNotes[0] ?? ''
  } catch (error) {
    if (state.previewUrl) {
      URL.revokeObjectURL(state.previewUrl)
      state.previewUrl = ''
    }
    state.blob = null
    if (error instanceof ShareBlockedError) {
      state.status = 'blocked'
      state.note = error.message
    } else {
      state.status = 'failed'
      state.note = error instanceof Error ? error.message : '生成失败，请重试。'
    }
  }
}

const exportCard = async (kind: ShareKind) => {
  const state = cardStates[kind]
  if (!state.blob) {
    return
  }
  const outcome = await exportShareImage(state.blob, `${PRODUCT_NAME}-${SHARE_KIND_LABELS[kind]}`)
  state.exportNote = outcome === 'shared'
    ? '已交给系统分享。'
    : outcome === 'downloaded'
      ? 'PNG 已开始下载。'
      : ''
}

const backTarget = computed(() => (
  recordId.value
    ? `/archive/records/${recordId.value}`
    : planId.value
      ? `/archive/plans/${planId.value}/brief`
      : '/archive'
))

const contextMissing = computed(() => (
  !store.loading && !store.error && availabilities.value.length === 0
))

onMounted(async () => {
  await store.load()
  document.title = pageTitle('分享工作室')
})

onBeforeUnmount(async () => {
  for (const state of Object.values(cardStates)) {
    if (state.previewUrl) {
      URL.revokeObjectURL(state.previewUrl)
    }
  }
  await maskEngine?.dispose()
})
</script>

<template>
  <section
    class="share-studio-view"
    aria-labelledby="share-studio-title"
  >
    <RouterLink
      v-tactile
      class="back-link"
      :to="backTarget"
    >
      <span aria-hidden="true">←</span> 返回
    </RouterLink>

    <header class="share-studio-header">
      <p class="eyebrow">
        图片在本机生成，不会上传
      </p>
      <h1 id="share-studio-title">
        分享工作室
      </h1>
      <p class="share-studio-header__hint">
        每张图都是 3:4 社交规格，含人脸的照片会自动打上遮罩。
      </p>
    </header>

    <p
      v-if="store.loading"
      class="archive-loading"
      role="status"
    >
      正在读取本地数据…
    </p>
    <p
      v-else-if="store.error"
      class="form-alert"
      role="alert"
    >
      {{ store.error }}
    </p>

    <div
      v-else-if="contextMissing"
      class="archive-empty archive-empty--inner"
    >
      <h2>没有找到要分享的内容</h2>
      <p>请从剪后记录或Tony卡进入分享工作室。</p>
      <RouterLink
        class="text-link"
        to="/archive"
      >
        返回档案
      </RouterLink>
    </div>

    <ul
      v-else
      class="share-card-list"
    >
      <li
        v-for="item in availabilities"
        :key="item.kind"
        class="share-card"
        :data-share-kind="item.kind"
      >
        <div class="share-card__head">
          <h2>{{ SHARE_KIND_LABELS[item.kind] }}</h2>
          <p
            v-if="item.available && item.usesPortrait && cardStates[item.kind].status === 'idle'"
            class="share-card__privacy"
          >
            将自动为人脸打上遮罩
          </p>
        </div>

        <p
          v-if="!item.available"
          class="share-card__reason"
        >
          {{ item.reason }}
        </p>

        <template v-else>
          <figure
            v-if="cardStates[item.kind].status === 'ready'"
            class="share-card__preview"
          >
            <img
              :src="cardStates[item.kind].previewUrl"
              :alt="`${SHARE_KIND_LABELS[item.kind]}预览`"
            >
            <figcaption v-if="cardStates[item.kind].note">
              {{ cardStates[item.kind].note }}
            </figcaption>
          </figure>

          <p
            v-if="cardStates[item.kind].status === 'blocked'"
            class="share-card__blocked"
            role="alert"
          >
            {{ cardStates[item.kind].note }}
          </p>
          <p
            v-else-if="cardStates[item.kind].status === 'failed'"
            class="share-card__failed"
            role="alert"
          >
            {{ cardStates[item.kind].note }}
          </p>

          <div class="share-card__actions">
            <button
              v-if="cardStates[item.kind].status !== 'blocked'"
              v-tactile
              type="button"
              class="share-card__generate"
              :disabled="cardStates[item.kind].status === 'working'"
              @click="generateCard(item.kind)"
            >
              {{ cardStates[item.kind].status === 'working'
                ? '生成中…'
                : cardStates[item.kind].status === 'ready' ? '重新生成' : '生成图片' }}
            </button>
            <button
              v-if="cardStates[item.kind].status === 'ready'"
              v-tactile
              type="button"
              class="share-card__export"
              @click="exportCard(item.kind)"
            >
              分享 / 保存图片
            </button>
          </div>
          <p
            v-if="cardStates[item.kind].exportNote"
            class="share-card__export-note"
            role="status"
          >
            {{ cardStates[item.kind].exportNote }}
          </p>
        </template>
      </li>
    </ul>
  </section>
</template>
