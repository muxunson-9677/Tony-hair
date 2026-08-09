<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import {
  candidateSourceKey,
  createLocalReferenceId,
  isSafelyEditableCandidate,
  nextUserReferenceName,
  selectPastRecordReferencePhoto,
} from '../features/archive/candidateSources'
import {
  useArchiveStore,
  type CandidateDraft,
} from '../features/archive/archiveStore'
import {
  archiveDemoCandidates,
  type ArchiveDemoCandidate,
} from '../features/archive/demoCandidates'
import type { Candidate, HaircutPhoto, HaircutRecord } from '../features/archive/types'
import { prepareLocalImage } from '../features/images/prepareLocalImage'

type SelectedCandidate = CandidateDraft & { readonly uiKey: string }

interface PastRecordChoice {
  readonly record: HaircutRecord
  readonly photo: HaircutPhoto
  readonly name: string
  readonly isStandard: boolean
}

const route = useRoute()
const router = useRouter()
const store = useArchiveStore()
const isEditing = computed(() => route.name === 'archive-plan-edit')
const routePlanId = computed(() => typeof route.params.id === 'string' ? route.params.id : '')
const planMissing = ref(false)
const initializing = ref(true)
const loadError = ref<string | null>(null)
const readOnlyReason = ref<string | null>(null)
const selectedCandidates = ref<SelectedCandidate[]>([])
const previewUrls = ref<Record<string, string>>({})
const processingReference = ref(false)
const referenceError = ref<string | null>(null)
let referenceRequest = 0

const form = reactive({
  title: '',
  date: new Date().toISOString().slice(0, 10),
  status: 'draft' as 'draft' | 'ready',
})

const knownDemoPaths = new Set(archiveDemoCandidates.map(({ image }) => image))
const selectedSourceKeys = computed(() => new Set(
  selectedCandidates.value.map(candidateSourceKey).filter((key): key is string => Boolean(key)),
))
const pastRecordChoices = computed<PastRecordChoice[]>(() => store.records.flatMap((record) => {
  const photo = selectPastRecordReferencePhoto(store.photosByRecordId[record.id] ?? [])
  if (!photo) {
    return []
  }
  const standard = store.standardStyles.find((style) => (
    style.active && style.recordId === record.id
  ))
  return [{
    record,
    photo,
    name: standard?.name ?? record.styleName,
    isStandard: Boolean(standard),
  }]
}))

const revokePreviewUrls = () => {
  Object.values(previewUrls.value).forEach((url) => URL.revokeObjectURL(url))
  previewUrls.value = {}
}

const rebuildPreviewUrls = () => {
  revokePreviewUrls()
  previewUrls.value = Object.fromEntries([
    ...pastRecordChoices.value.map((choice) => (
      [`past-record-choice:${choice.record.id}`, URL.createObjectURL(choice.photo.image)] as const
    )),
    ...selectedCandidates.value.flatMap((candidate) => (
      candidate.referenceImage
        ? [[candidate.uiKey, URL.createObjectURL(candidate.referenceImage)] as const]
        : []
    )),
  ])
}

const candidateImageSource = (candidate: SelectedCandidate) => (
  candidate.demoImagePath ?? previewUrls.value[candidate.uiKey] ?? ''
)

const sourceLabel = (candidate: SelectedCandidate) => {
  if (candidate.source === 'user_reference') {
    return '自己的参考图 · 仅本机'
  }
  if (candidate.source === 'past_record') {
    const record = store.records.find(({ id }) => id === candidate.pastRecordId)
    return record
      ? `剪后记录 · ${record.date} · 满意度 ${record.satisfaction}/5`
      : '剪后记录副本 · 原记录已不在'
  }
  return '预制示例 · 示例体验'
}

const imageAlt = (candidate: SelectedCandidate) => {
  if (candidate.source === 'demo_ai') {
    return `${candidate.name}预制示例`
  }
  return `${candidate.name}本地候选图`
}

const isDemoSelected = (choice: ArchiveDemoCandidate) => (
  selectedSourceKeys.value.has(`demo_ai:${choice.image}`)
)

const isPastSelected = (choice: PastRecordChoice) => (
  selectedSourceKeys.value.has(`past_record:${choice.record.id}`)
)

const removeCandidate = (index: number) => {
  if (store.saving || processingReference.value) {
    return
  }
  selectedCandidates.value.splice(index, 1)
  rebuildPreviewUrls()
}

const toggleDemo = (choice: ArchiveDemoCandidate) => {
  if (store.saving || processingReference.value) {
    return
  }
  const sourceKey = `demo_ai:${choice.image}`
  const existingIndex = selectedCandidates.value.findIndex(
    (candidate) => candidateSourceKey(candidate) === sourceKey,
  )
  if (existingIndex >= 0) {
    removeCandidate(existingIndex)
    return
  }
  if (selectedCandidates.value.length >= 4) {
    return
  }
  selectedCandidates.value.push({
    uiKey: sourceKey,
    name: choice.name,
    notes: choice.notes,
    source: 'demo_ai',
    demoImagePath: choice.image,
  })
}

const togglePastRecord = (choice: PastRecordChoice) => {
  if (store.saving || processingReference.value) {
    return
  }
  const sourceKey = `past_record:${choice.record.id}`
  const existingIndex = selectedCandidates.value.findIndex(
    (candidate) => candidateSourceKey(candidate) === sourceKey,
  )
  if (existingIndex >= 0) {
    removeCandidate(existingIndex)
    return
  }
  if (selectedCandidates.value.length >= 4) {
    return
  }
  selectedCandidates.value.push({
    uiKey: sourceKey,
    name: choice.name,
    notes: `来自 ${choice.record.date} 的真实剪后记录，满意度 ${choice.record.satisfaction}/5。`,
    source: 'past_record',
    pastRecordId: choice.record.id,
    referenceImage: choice.photo.image,
    referenceImageWidth: choice.photo.width,
    referenceImageHeight: choice.photo.height,
    referenceImageBytes: choice.photo.bytes ?? choice.photo.image.size,
    referenceImageProcessedAt: choice.photo.processedAt ?? choice.photo.capturedAt,
  })
  rebuildPreviewUrls()
}

const formatBytes = (bytes: number) => (
  bytes < 1024 ? `${bytes} B` : `${Math.round(bytes / 1024)} KB`
)

const toCandidateDraft = (candidate: SelectedCandidate): CandidateDraft => ({
  id: candidate.id,
  name: candidate.name,
  notes: candidate.notes,
  source: candidate.source,
  referenceId: candidate.referenceId,
  demoImagePath: candidate.demoImagePath,
  pastRecordId: candidate.pastRecordId,
  referenceImage: candidate.referenceImage,
  referenceImageWidth: candidate.referenceImageWidth,
  referenceImageHeight: candidate.referenceImageHeight,
  referenceImageBytes: candidate.referenceImageBytes,
  referenceImageProcessedAt: candidate.referenceImageProcessedAt,
})

const toSelectedCandidate = (candidate: Candidate): SelectedCandidate => ({
  ...toCandidateDraft({ ...candidate, uiKey: candidate.id }),
  uiKey: candidate.id,
})

const selectReference = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  const request = referenceRequest + 1
  referenceRequest = request
  referenceError.value = null
  if (!file || store.saving || selectedCandidates.value.length >= 4) {
    input.value = ''
    return
  }

  processingReference.value = true
  try {
    const prepared = await prepareLocalImage(file)
    const referenceId = await createLocalReferenceId(prepared.blob)
    if (request !== referenceRequest) {
      return
    }
    if (selectedCandidates.value.length >= 4) {
      referenceError.value = '候选已满 4 个，请先移除一个再加入本地参考图。'
      return
    }
    const sourceKey = `user_reference:${referenceId}`
    if (selectedSourceKeys.value.has(sourceKey)) {
      referenceError.value = '这张本地参考图已经在候选中。'
      return
    }
    selectedCandidates.value.push({
      uiKey: sourceKey,
      name: nextUserReferenceName(selectedCandidates.value.map(({ name }) => name)),
      notes: '已在当前设备纠正方向、压缩并去除 EXIF。',
      source: 'user_reference',
      referenceId,
      referenceImage: prepared.blob,
      referenceImageWidth: prepared.width,
      referenceImageHeight: prepared.height,
      referenceImageBytes: prepared.bytes,
      referenceImageProcessedAt: prepared.processedAt,
    })
    rebuildPreviewUrls()
  } catch (caught) {
    if (request === referenceRequest) {
      referenceError.value = caught instanceof Error
        ? caught.message
        : '本地图片处理失败，请换一张后重试。'
    }
  } finally {
    if (request === referenceRequest) {
      processingReference.value = false
    }
    input.value = ''
  }
}

const submit = async () => {
  if (processingReference.value) {
    return
  }
  const saved = await store.savePlan({
    id: isEditing.value ? routePlanId.value : undefined,
    title: form.title,
    date: form.date,
    status: form.status,
    candidates: selectedCandidates.value.map(toCandidateDraft),
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
    rebuildPreviewUrls()
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
    !isSafelyEditableCandidate(candidate, knownDemoPaths)
  ))) {
    readOnlyReason.value = '此计划含有缺少来源指针、图片或处理信息的旧版候选。为避免编辑时丢失来源和原数据，本阶段保持只读。'
    initializing.value = false
    return
  }
  form.title = plan.title
  form.date = plan.date.slice(0, 10)
  form.status = plan.status === 'ready' ? 'ready' : 'draft'
  selectedCandidates.value = existingCandidates.map(toSelectedCandidate)
  rebuildPreviewUrls()
  document.title = '编辑发型计划｜咋剪发'
  initializing.value = false
})

onBeforeUnmount(() => {
  referenceRequest += 1
  revokePreviewUrls()
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
      <p>自己的参考、剪后记录和预制示例可以放在一起比较。</p>
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

      <section
        v-if="selectedCandidates.length > 0"
        class="selected-candidates"
        aria-label="已选候选"
      >
        <div class="archive-section-heading">
          <div>
            <p class="section-index">
              SELECTED
            </p>
            <h2>已选择 {{ selectedCandidates.length }} / 4</h2>
          </div>
        </div>
        <ol>
          <li
            v-for="(candidate, index) in selectedCandidates"
            :key="candidate.uiKey"
          >
            <img
              v-if="candidateImageSource(candidate)"
              :src="candidateImageSource(candidate)"
              :alt="imageAlt(candidate)"
            >
            <div>
              <span>{{ String(index + 1).padStart(2, '0') }}</span>
              <b>{{ candidate.name }}</b>
              <small>{{ sourceLabel(candidate) }}</small>
              <small
                v-if="candidate.referenceImageWidth && candidate.referenceImageHeight && candidate.referenceImageBytes"
              >
                {{ candidate.referenceImageWidth }} × {{ candidate.referenceImageHeight }} · {{ formatBytes(candidate.referenceImageBytes) }}
              </small>
              <div class="candidate-inline-actions">
                <button
                  type="button"
                  :disabled="store.saving || processingReference"
                  @click="removeCandidate(index)"
                >
                  移除
                </button>
              </div>
            </div>
          </li>
        </ol>
      </section>

      <section
        class="candidate-source-section local-reference-picker"
        aria-labelledby="local-reference-title"
      >
        <p class="section-index">
          01 · OWN REFERENCE
        </p>
        <h2 id="local-reference-title">
          加入自己的参考图
        </h2>
        <p>照片只在当前设备纠正方向、压缩并去除 EXIF，不会上传。</p>
        <label class="local-reference-input">
          <span>本地参考图</span>
          <span
            class="local-reference-control"
            :class="{ 'local-reference-control--disabled': store.saving || processingReference || selectedCandidates.length >= 4 }"
          >
            <b aria-hidden="true">{{ processingReference ? '本地处理中…' : '选择本地照片' }}</b>
            <small aria-hidden="true">JPEG · PNG · WebP</small>
            <input
              type="file"
              aria-label="本地参考图"
              accept="image/jpeg,image/png,image/webp"
              :disabled="store.saving || processingReference || selectedCandidates.length >= 4"
              @change="selectReference"
            >
          </span>
        </label>
        <p
          v-if="processingReference"
          class="image-processing-status"
          role="status"
        >
          本地处理中…
        </p>
        <p
          v-if="referenceError"
          class="form-alert"
          role="alert"
        >
          {{ referenceError }}
        </p>
      </section>

      <section
        class="candidate-source-section past-record-picker"
        aria-labelledby="past-record-title"
      >
        <p class="section-index">
          02 · YOUR HISTORY
        </p>
        <h2 id="past-record-title">
          从剪后记录复刻
        </h2>
        <p v-if="pastRecordChoices.length === 0">
          还没有带照片的剪后记录。
        </p>
        <ol v-else>
          <li
            v-for="choice in pastRecordChoices"
            :key="choice.record.id"
          >
            <img
              :src="previewUrls[`past-record-choice:${choice.record.id}`] || ''"
              alt=""
            >
            <div>
              <span>{{ choice.isStandard ? '标准发型' : '剪后记录' }} · {{ choice.record.date }}</span>
              <b>{{ choice.name }}</b>
              <small>满意度 {{ choice.record.satisfaction }} / 5</small>
              <button
                type="button"
                :disabled="store.saving || processingReference || (!isPastSelected(choice) && selectedCandidates.length >= 4)"
                @click="togglePastRecord(choice)"
              >
                {{ isPastSelected(choice) ? `移除历史候选：${choice.name}` : `加入历史候选：${choice.name}` }}
              </button>
            </div>
          </li>
        </ol>
      </section>

      <section
        class="demo-candidate-picker candidate-source-section"
        aria-labelledby="demo-candidate-title"
      >
        <p class="section-index">
          03 · SIX PRESETS
        </p>
        <h2 id="demo-candidate-title">
          选择预制短发
        </h2>
        <aside
          class="sample-disclosure"
          aria-label="示例候选说明"
        >
          <b>示例体验 · 非用户生成</b>
          <p>虚构成年人物素材，不处理你的照片，也不是个性化 AI 结果。</p>
        </aside>
        <div class="demo-candidate-grid">
          <figure
            v-for="choice in archiveDemoCandidates"
            :key="choice.key"
            :class="{ 'demo-candidate--selected': isDemoSelected(choice) }"
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
                :disabled="store.saving || processingReference || (!isDemoSelected(choice) && selectedCandidates.length >= 4)"
                @click="toggleDemo(choice)"
              >
                {{ isDemoSelected(choice) ? `移除候选：${choice.name}` : `加入候选：${choice.name}` }}
              </button>
            </figcaption>
          </figure>
        </div>
      </section>

      <button
        class="submit-button"
        type="submit"
        :disabled="store.saving || processingReference || selectedCandidates.length < 2 || selectedCandidates.length > 4"
      >
        {{ store.saving ? '正在保存…' : isEditing ? '保存修改' : '保存计划' }}
      </button>
    </form>
  </section>
</template>
