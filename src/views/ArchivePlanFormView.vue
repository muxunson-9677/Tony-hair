<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
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
import {
  parseArchivePlanReturnPath,
  type ArchivePlanAddPointer,
} from '../features/archive/archiveReturnPath'
import { isValidPlanCandidateCount } from '../features/archive/types'
import type {
  Candidate,
  HaircutPhoto,
  HaircutPlan,
  HaircutRecord,
} from '../features/archive/types'
import { tactileDirective as vTactile } from '../ui/tactile'
import { resolveLibraryCandidateDraft } from '../features/hairstyle-library/libraryCandidates'
import { useHairstyleLibraryStore } from '../features/hairstyle-library/libraryStore'
import GuidedDirectionPicker from '../features/hairstyle-library/components/GuidedDirectionPicker.vue'
import type { CuratedHairstyle } from '../features/hairstyle-library/types'
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
const libraryStore = useHairstyleLibraryStore()
const isEditing = computed(() => route.name === 'archive-plan-edit')
const isGuidedChoice = computed(() => !isEditing.value && route.query.intent === 'choose')
const isRepeatIntent = computed(() => !isEditing.value && route.query.intent === 'repeat')
const hasRecognizedIntent = computed(() => (
  (isGuidedChoice.value || isRepeatIntent.value)
  && Object.keys(route.query).length === 1
))
const routePlanId = computed(() => typeof route.params.id === 'string' ? route.params.id : '')
const planMissing = ref(false)
const initializing = ref(true)
const loadError = ref<string | null>(null)
const readOnlyReason = ref<string | null>(null)
const selectedCandidates = ref<SelectedCandidate[]>([])
const previewUrls = ref<Record<string, string>>({})
const processingReference = ref(false)
const referenceError = ref<string | null>(null)
const addNotice = ref<string | null>(null)
const candidateSourceDisclosure = ref<HTMLDetailsElement | null>(null)
let referenceRequest = 0
let routeRequest = 0
let viewActive = false
let initializedOnce = false

const form = reactive({
  title: '这次怎么剪',
  date: new Date().toISOString().slice(0, 10),
  mode: 'exploration' as HaircutPlan['mode'],
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
const standardRecordChoices = computed(() => pastRecordChoices.value.filter(({ isStandard }) => isStandard))
const candidateLimit = computed(() => form.mode === 'repeat' ? 1 : 4)
const candidateCountValid = computed(() => (
  isValidPlanCandidateCount(form.mode, selectedCandidates.value.length)
))

const revokePreviewUrls = () => {
  Object.values(previewUrls.value).forEach((url) => URL.revokeObjectURL(url))
  previewUrls.value = {}
}

const rebuildPreviewUrls = () => {
  revokePreviewUrls()
  previewUrls.value = Object.fromEntries([
    ...(form.mode === 'repeat' ? standardRecordChoices.value : pastRecordChoices.value).map((choice) => (
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
  void closeCandidateSources()
}

const togglePastRecord = (choice: PastRecordChoice) => {
  if (store.saving || processingReference.value) {
    return
  }
  if (form.mode === 'repeat' && !choice.isStandard) {
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
  if (form.mode === 'repeat') {
    selectedCandidates.value = []
  } else if (selectedCandidates.value.length >= 4) {
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
  void closeCandidateSources()
}

const setPlanMode = (mode: HaircutPlan['mode']) => {
  if (form.mode === mode || store.saving || processingReference.value) {
    return
  }
  form.mode = mode
  selectedCandidates.value = []
  referenceError.value = null
  rebuildPreviewUrls()
}

const closeCandidateSources = async () => {
  await nextTick()
  if (candidateSourceDisclosure.value) {
    candidateSourceDisclosure.value.open = false
  }
}

const adoptGuidedDirections = (styles: readonly CuratedHairstyle[]) => {
  if (store.saving || processingReference.value) {
    return
  }
  const choices = styles.flatMap((style) => {
    const choice = archiveDemoCandidates.find(({ image }) => image === style.coverImage)
    return choice ? [choice] : []
  })
  if (choices.length !== styles.length || choices.length < 2 || choices.length > 4) {
    addNotice.value = '这些方向暂时无法加入计划，请重新选择。'
    return
  }
  selectedCandidates.value = choices.map((choice) => ({
    uiKey: `demo_ai:${choice.image}`,
    name: choice.name,
    notes: choice.notes,
    source: 'demo_ai',
    demoImagePath: choice.image,
  }))
  if (!form.title.trim() || form.title === '这次怎么剪') {
    form.title = '帮我选的下次剪法'
  }
  addNotice.value = '已加入 3 个不同方向，你可以直接保存或继续更换。'
  void closeCandidateSources()
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
    await closeCandidateSources()
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
    mode: form.mode,
    status: form.status,
    candidates: selectedCandidates.value.map(toCandidateDraft),
  })

  if (saved) {
    await router.push(`/archive/plans/${saved.plan.id}`)
  }
}

const addPointerTarget = (pointer: ArchivePlanAddPointer) => ({
  itemType: pointer.kind === 'catalog' ? 'curated_style' : 'private_reference',
  itemId: pointer.id,
} as const)

const resolveLibraryPointer = (pointer: ArchivePlanAddPointer) => (
  resolveLibraryCandidateDraft(
    addPointerTarget(pointer),
    {
      getPrivateReference: async (id) => libraryStore.getReference(id),
    },
  )
)

const consumeLibraryPointer = (draft: CandidateDraft) => {
  const sourceKey = candidateSourceKey(draft)
  if (!sourceKey) {
    addNotice.value = '这份发型来源不完整，无法加入计划。'
  } else if (selectedSourceKeys.value.has(sourceKey)) {
    addNotice.value = '这份发型已经在当前计划里。'
  } else if (selectedCandidates.value.length >= 4) {
    addNotice.value = '计划已满 4 个候选，请先移除一个再加入。'
  } else {
    if (form.mode !== 'exploration') {
      form.mode = 'exploration'
    }
    selectedCandidates.value.push({ ...draft, uiKey: sourceKey })
    addNotice.value = `已把“${draft.name}”加入探索计划；再选 1—3 个方向即可保存。`
  }
}

const hydrateEditingPlan = () => {
  const plan = store.plans.find(({ id }) => id === routePlanId.value)
  if (!plan) {
    planMissing.value = true
    return
  }
  if (plan.status === 'completed') {
    readOnlyReason.value = '已完成的旧计划与剪后记录保持只读，本阶段不会把它降级为草稿。'
    return
  }
  const existingCandidates = store.candidatesByPlanId[plan.id] ?? []
  if (existingCandidates.some((candidate) => (
    !isSafelyEditableCandidate(candidate, knownDemoPaths)
  ))) {
    readOnlyReason.value = '此计划含有缺少来源指针、图片或处理信息的旧版候选。为避免编辑时丢失来源和原数据，本阶段保持只读。'
    return
  }
  form.title = plan.title
  form.date = plan.date.slice(0, 10)
  form.mode = plan.mode
  form.status = plan.status === 'ready' ? 'ready' : 'draft'
  selectedCandidates.value = existingCandidates.map(toSelectedCandidate)
  rebuildPreviewUrls()
  document.title = '编辑发型计划｜咋剪发'
}

const initializeForRoute = async () => {
  const request = routeRequest + 1
  routeRequest = request
  const hasQuery = Object.keys(route.query).length > 0
  const returnTarget = !isEditing.value && hasQuery
    ? parseArchivePlanReturnPath(route.fullPath)
    : null

  if (!isEditing.value && !hasQuery && initializedOnce) {
    initializing.value = false
    return
  }

  loadError.value = null
  planMissing.value = false
  readOnlyReason.value = null
  initializing.value = true
  await Promise.all([
    store.load(),
    ...(returnTarget ? [libraryStore.load()] : []),
  ])
  if (!viewActive || request !== routeRequest) {
    return
  }
  initializedOnce = true
  if (store.error) {
    loadError.value = store.error
    initializing.value = false
    return
  }
  if (returnTarget && libraryStore.error) {
    loadError.value = libraryStore.error
    initializing.value = false
    return
  }
  if (!isEditing.value && hasQuery && !returnTarget && !hasRecognizedIntent.value) {
    addNotice.value = '这个加入计划入口无效或已过期，未加入任何候选。'
    initializing.value = false
    await router.replace('/archive/plans/new')
    return
  }
  if (!isEditing.value && returnTarget) {
    let draft: CandidateDraft
    try {
      draft = await resolveLibraryPointer(returnTarget.pointer)
    } catch {
      if (!viewActive || request !== routeRequest) {
        return
      }
      addNotice.value = returnTarget.pointer.kind === 'catalog'
        ? '这个精选发型已停用或找不到，未加入计划。'
        : '这份私人参考已删除或找不到，未加入计划。'
      initializing.value = false
      await router.replace('/archive/plans/new')
      return
    }
    if (!viewActive || request !== routeRequest) {
      return
    }
    if (!store.profile) {
      initializing.value = false
      await router.replace({
        path: '/archive/profile',
        query: { next: returnTarget.path },
      })
      return
    }
    consumeLibraryPointer(draft)
    rebuildPreviewUrls()
    initializing.value = false
    await router.replace('/archive/plans/new')
    return
  }
  if (isEditing.value) {
    hydrateEditingPlan()
  } else {
    if (isRepeatIntent.value) {
      form.mode = 'repeat'
    }
    rebuildPreviewUrls()
  }
  initializing.value = false
}

watch(() => route.fullPath, () => {
  if (viewActive) {
    void initializeForRoute()
  }
})

onMounted(() => {
  viewActive = true
  void initializeForRoute()
})

onBeforeUnmount(() => {
  viewActive = false
  routeRequest += 1
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
      v-tactile
      class="back-link"
      :to="isEditing ? `/archive/plans/${routePlanId}` : '/archive'"
    >
      <span aria-hidden="true">←</span> {{ isEditing ? '返回计划详情' : '返回档案' }}
    </RouterLink>

    <header class="inner-header">
      <p class="eyebrow">
        {{ form.mode === 'repeat' ? 'REPEAT · ONE STANDARD' : 'PLAN · 2—4 DIRECTIONS' }}
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
      <p
        v-if="addNotice"
        class="form-alert"
        role="alert"
      >
        {{ addNotice }}
      </p>
      <RouterLink
        v-tactile
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
        v-tactile
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
        v-tactile
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
        v-if="addNotice"
        class="form-alert"
        role="alert"
      >
        {{ addNotice }}
      </p>
      <p
        v-if="store.error"
        class="form-alert"
        role="alert"
      >
        {{ store.error }}
      </p>

      <GuidedDirectionPicker
        v-if="isGuidedChoice && store.profile && selectedCandidates.length === 0"
        :profile="store.profile"
        @adopt="adoptGuidedDirections"
      />

      <details class="plan-setup-details">
        <summary v-tactile>
          <span>日期和名称</span>
          <small>已经给出安全默认值，需要时再改</small>
        </summary>
        <div class="plan-setup-details__body">
          <label>
            <span>这次怎么剪</span>
            <input
              v-model="form.title"
              aria-label="计划标题"
              name="title"
              maxlength="80"
              required
              placeholder="例如：夏末短发"
            >
          </label>

          <div class="form-grid">
            <label>
              <span>预计日期</span>
              <input
                v-model="form.date"
                aria-label="计划日期"
                name="date"
                type="date"
                required
              >
            </label>
            <label>
              <span>准备状态</span>
              <select
                v-model="form.status"
                aria-label="计划状态"
                name="status"
              >
                <option value="draft">草稿</option>
                <option value="ready">可带去沟通</option>
              </select>
            </label>
          </div>

          <fieldset class="plan-mode-picker">
            <legend>怎么开始</legend>
            <label>
              <input
                type="radio"
                name="planMode"
                value="exploration"
                aria-label="探索计划"
                :checked="form.mode === 'exploration'"
                @change="setPlanMode('exploration')"
              >
              <span><b>比较几个方向</b><small>适合还没决定，选择 2—4 个</small></span>
            </label>
            <label>
              <input
                type="radio"
                name="planMode"
                value="repeat"
                aria-label="复刻标准发型"
                :checked="form.mode === 'repeat'"
                @change="setPlanMode('repeat')"
              >
              <span><b>照上次剪</b><small>只带 1 个满意的真实剪后版本</small></span>
            </label>
          </fieldset>
        </div>
      </details>

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
            <h2>已选择 {{ selectedCandidates.length }} / {{ candidateLimit }}</h2>
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
                  v-tactile
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

      <details
        ref="candidateSourceDisclosure"
        class="candidate-source-disclosure"
        :open="selectedCandidates.length === 0"
      >
        <summary v-tactile>
          <span>{{ selectedCandidates.length === 0 ? '选择第一个候选' : '继续添加或更换候选' }}</span>
          <small>{{ form.mode === 'repeat' ? '从标准发型中选 1 个' : '从我的照片、历史或精选中选 2—4 个' }}</small>
        </summary>

        <section
          v-if="form.mode === 'repeat'"
          class="candidate-source-section past-record-picker repeat-standard-picker"
          aria-labelledby="repeat-standard-title"
        >
          <p class="section-index">
            STANDARD · ACTIVE
          </p>
          <h2 id="repeat-standard-title">
            选择一个标准发型
          </h2>
          <p>复刻计划只能使用仍在当前档案中的标准发型，并保存一份独立照片快照。</p>
          <div
            v-if="standardRecordChoices.length === 0"
            class="archive-empty archive-empty--inner"
          >
            <h3>还没有可复刻的标准发型</h3>
            <p>先用探索计划选方向；满意的剪后记录可在之后标为标准发型。</p>
            <button
              v-tactile
              type="button"
              class="text-link"
              @click="setPlanMode('exploration')"
            >
              转为探索计划
            </button>
          </div>
          <ol v-else>
            <li
              v-for="choice in standardRecordChoices"
              :key="choice.record.id"
            >
              <img
                :src="previewUrls[`past-record-choice:${choice.record.id}`] || ''"
                alt=""
              >
              <div>
                <span>标准发型 · {{ choice.record.date }}</span>
                <b>{{ choice.name }}</b>
                <small>满意度 {{ choice.record.satisfaction }} / 5</small>
                <button
                  v-tactile
                  type="button"
                  :disabled="store.saving || processingReference"
                  @click="togglePastRecord(choice)"
                >
                  {{ isPastSelected(choice) ? `移除标准发型：${choice.name}` : `选择标准发型：${choice.name}` }}
                </button>
              </div>
            </li>
          </ol>
        </section>

        <section
          v-if="form.mode === 'exploration'"
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
          <label
            v-tactile
            class="local-reference-input"
          >
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
          v-if="form.mode === 'exploration'"
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
                  v-tactile
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
          v-if="form.mode === 'exploration'"
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
                  v-tactile
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
      </details>

      <button
        v-tactile
        class="submit-button"
        type="submit"
        :disabled="store.saving || processingReference || !candidateCountValid"
      >
        {{ store.saving ? '正在保存…' : isEditing ? '保存修改' : '保存计划' }}
      </button>
    </form>
  </section>
</template>
