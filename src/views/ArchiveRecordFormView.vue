<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import {
  useArchiveStore,
  type HaircutPhotoDraft,
} from '../features/archive/archiveStore'
import type { HaircutPhoto } from '../features/archive/types'
import {
  ImagePreparationError,
  prepareLocalImage,
  type PreparedLocalImage,
} from '../features/images/prepareLocalImage'
import { editableRecordPhotoStages, initialRecordDecision } from '../features/archive/recordExperience'
import { tactileDirective as vTactile } from '../ui/tactile'

type PhotoStage = HaircutPhoto['stage']

const photoStages = editableRecordPhotoStages
const legacyPhotoStages: readonly { stage: PhotoStage, label: string }[] = [
  { stage: 'during', label: '理发中' },
  { stage: 'unstyled', label: '未打理' },
  { stage: 'styled', label: '已造型' },
  { stage: 'after_wash', label: '洗后' },
  { stage: 'day_7', label: '第 7 天' },
]
const managedPhotoStages = [...photoStages, ...legacyPhotoStages]
const decisionDefaults = initialRecordDecision()

const route = useRoute()
const router = useRouter()
const store = useArchiveStore()
const isEditing = computed(() => route.name === 'archive-record-edit')
const recordId = computed(() => typeof route.params.id === 'string' ? route.params.id : '')
const initializing = ref(true)
const loadError = ref<string | null>(null)
const recordMissing = ref(false)
const localError = ref<string | null>(null)
const existingPhotos = ref<HaircutPhoto[]>([])
const replacementPhotosByStage = reactive<Partial<Record<PhotoStage, HaircutPhotoDraft>>>({})
type PhotoPreparationState =
  | { readonly status: 'processing', readonly requestId: number }
  | {
    readonly status: 'ready'
    readonly requestId: number
    readonly prepared: PreparedLocalImage
    readonly previewUrl: string
  }
  | { readonly status: 'error', readonly requestId: number, readonly message: string }
const photoPreparationByStage = reactive<Partial<Record<PhotoStage, PhotoPreparationState>>>({})
let photoRequestId = 0
let unmounted = false
const isProcessingPhotos = computed(() => Object.values(photoPreparationByStage).some(
  (state) => state?.status === 'processing',
))
const hasFailedPhotos = computed(() => Object.values(photoPreparationByStage).some(
  (state) => state?.status === 'error',
))

const localDateInputValue = (date = new Date()) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const form = reactive({
  planId: '',
  date: localDateInputValue(),
  styleName: '',
  salonName: '',
  salonLocation: '',
  barberName: '',
  serviceName: '',
  priceYuan: '',
  durationMinutes: '',
  notes: '',
  satisfaction: decisionDefaults.satisfaction as '' | '1' | '2' | '3' | '4' | '5',
  outcome: decisionDefaults.outcome as '' | 'repeat' | 'adjust' | 'avoid',
  avoidRules: ['', '', ''],
  adjustmentNotes: ['', '', ''],
})

const applyOutcomeDefault = (outcome: 'repeat' | 'adjust' | 'avoid') => {
  if (!form.satisfaction) {
    form.satisfaction = outcome === 'repeat' ? '5' : outcome === 'adjust' ? '3' : '1'
  }
}

const parseYuan = (value: string): number | undefined | null => {
  const normalized = value.trim()
  if (!normalized) {
    return undefined
  }
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(normalized)) {
    return null
  }
  const [yuan, decimal = ''] = normalized.split('.')
  const cents = Number(yuan) * 100 + Number(decimal.padEnd(2, '0'))
  return Number.isSafeInteger(cents) ? cents : null
}

const readableBytes = (bytes: number) => {
  if (bytes < 1024) {
    return `${bytes} B`
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

const releasePhotoPreview = (stage: PhotoStage) => {
  const state = photoPreparationByStage[stage]
  if (state?.status === 'ready') {
    URL.revokeObjectURL(state.previewUrl)
  }
}

const clearPhotoSelection = (stage: PhotoStage) => {
  const state = photoPreparationByStage[stage]
  releasePhotoPreview(stage)
  delete replacementPhotosByStage[stage]
  delete photoPreparationByStage[stage]
  if (state?.status === 'error' && localError.value === state.message) {
    const remainingError = Object.values(photoPreparationByStage).find(
      (candidate) => candidate?.status === 'error',
    )
    localError.value = remainingError?.status === 'error' ? remainingError.message : null
  }
}

const setPhoto = async (stage: PhotoStage, event: Event) => {
  if (store.saving) {
    return
  }
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) {
    clearPhotoSelection(stage)
    return
  }

  const requestId = photoRequestId += 1
  releasePhotoPreview(stage)
  delete replacementPhotosByStage[stage]
  photoPreparationByStage[stage] = { status: 'processing', requestId }
  localError.value = null
  try {
    const prepared = await prepareLocalImage(file)
    if (unmounted || photoPreparationByStage[stage]?.requestId !== requestId) {
      return
    }
    const previewUrl = URL.createObjectURL(prepared.blob)
    replacementPhotosByStage[stage] = {
      stage,
      image: prepared.blob,
      width: prepared.width,
      height: prepared.height,
      bytes: prepared.bytes,
      processedAt: prepared.processedAt,
    }
    photoPreparationByStage[stage] = { status: 'ready', requestId, prepared, previewUrl }
  } catch (caught) {
    if (unmounted || photoPreparationByStage[stage]?.requestId !== requestId) {
      return
    }
    const error = caught instanceof ImagePreparationError
      ? caught
      : new ImagePreparationError('encode_failed')
    photoPreparationByStage[stage] = { status: 'error', requestId, message: error.message }
    localError.value = error.message
  }
}

const photoPreviewUrl = (stage: PhotoStage) => {
  const state = photoPreparationByStage[stage]
  return state?.status === 'ready' ? state.previewUrl : ''
}

const photoPreparationLabel = (stage: PhotoStage) => {
  const state = photoPreparationByStage[stage]
  if (!state) {
    return ''
  }
  if (state.status === 'processing') {
    return '本地处理中…'
  }
  if (state.status === 'error') {
    return state.message
  }
  return `已在本地处理：${state.prepared.width} × ${state.prepared.height} · ${readableBytes(state.prepared.bytes)}`
}

const existingPhotoLabel = (stage: PhotoStage) => (
  !replacementPhotosByStage[stage] && existingPhotos.value.some((photo) => photo.stage === stage)
    ? `已保留：${managedPhotoStages.find((item) => item.stage === stage)?.label ?? stage}照片`
    : ''
)

const submit = async () => {
  localError.value = null
  if (isProcessingPhotos.value) {
    localError.value = '请等待照片在本地处理完成。'
    return
  }
  if (hasFailedPhotos.value) {
    localError.value = '请重新选择处理失败的照片。'
    return
  }
  const priceCents = parseYuan(form.priceYuan)
  if (priceCents === null) {
    localError.value = '价格请填写元，可精确到两位小数。'
    return
  }
  const durationText = String(form.durationMinutes).trim()
  if (durationText && !/^[1-9]\d*$/.test(durationText)) {
    localError.value = '耗时请填写大于 0 的整数分钟。'
    return
  }
  const photos = managedPhotoStages.flatMap(({ stage }) => {
    const replacement = replacementPhotosByStage[stage]
    return replacement
      ? [replacement]
      : existingPhotos.value.filter((photo) => photo.stage === stage)
  })
  if (photos.length === 0) {
    localError.value = '请至少选择一张照片。'
    return
  }
  if (!form.satisfaction || !form.outcome) {
    localError.value = '请在保存前选择满意度，并确认这次是否值得复刻。'
    return
  }
  const avoidRules = form.avoidRules.map((rule) => rule.trim()).filter(Boolean)
  if (form.outcome === 'avoid' && (avoidRules.length < 1 || avoidRules.length > 3)) {
    localError.value = '选择避雷时，请填写 1 到 3 条非空规则。'
    return
  }
  const adjustmentNotes = form.adjustmentNotes.map((rule) => rule.trim()).filter(Boolean)
  if (form.outcome === 'adjust' && (adjustmentNotes.length < 1 || adjustmentNotes.length > 3)) {
    localError.value = '请写下 1 到 3 条下次想调整的地方。'
    return
  }

  const saved = await store.saveRecord({
    id: isEditing.value ? recordId.value : undefined,
    planId: form.planId || undefined,
    date: form.date,
    styleName: form.styleName,
    salonName: form.salonName,
    salonLocation: form.salonLocation,
    barberName: form.barberName,
    serviceName: form.serviceName,
    priceCents,
    durationMinutes: durationText ? Number(durationText) : undefined,
    notes: form.notes,
    satisfaction: Number(form.satisfaction),
    outcome: form.outcome as 'repeat' | 'adjust' | 'avoid',
    avoidRules,
    adjustmentNotes,
    photos,
  })
  if (saved) {
    await router.push(`/archive/records/${saved.record.id}`)
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
    const queryPlanId = typeof route.query.planId === 'string' ? route.query.planId : ''
    form.planId = store.plans.some(({ id }) => id === queryPlanId) ? queryPlanId : ''
    initializing.value = false
    return
  }

  const record = store.records.find(({ id }) => id === recordId.value)
  if (!record) {
    recordMissing.value = true
    initializing.value = false
    return
  }
  form.planId = record.planId ?? ''
  form.date = record.date.slice(0, 10)
  form.styleName = record.styleName
  form.salonName = record.salonName ?? ''
  form.salonLocation = record.salonLocation ?? ''
  form.barberName = record.barberName ?? ''
  form.serviceName = record.serviceName ?? ''
  form.priceYuan = record.priceCents === undefined ? '' : (record.priceCents / 100).toFixed(2)
  form.durationMinutes = record.durationMinutes?.toString() ?? ''
  form.notes = record.notes ?? ''
  form.satisfaction = record.satisfaction.toString() as '1' | '2' | '3' | '4' | '5'
  form.outcome = record.outcome
  if (record.outcome === 'avoid') {
    record.avoidRules.slice(0, 3).forEach((rule, index) => {
      form.avoidRules[index] = rule
    })
  }
  if (record.outcome === 'adjust') {
    record.adjustmentNotes.slice(0, 3).forEach((rule, index) => {
      form.adjustmentNotes[index] = rule
    })
  }
  existingPhotos.value = [...store.photosByRecordId[record.id] ?? []]
  document.title = '编辑剪后记录｜咋剪发'
  initializing.value = false
})

onBeforeUnmount(() => {
  unmounted = true
  managedPhotoStages.forEach(({ stage }) => releasePhotoPreview(stage))
})
</script>

<template>
  <section
    class="archive-form-view record-form-view"
    aria-labelledby="record-form-title"
  >
    <RouterLink
      v-tactile
      class="back-link"
      :to="isEditing ? `/archive/records/${recordId}` : '/archive'"
    >
      <span aria-hidden="true">←</span> {{ isEditing ? '返回记录详情' : '返回档案' }}
    </RouterLink>

    <header class="inner-header">
      <p class="eyebrow">
        剪后记一下 · 仅保存在本机
      </p>
      <h1 id="record-form-title">
        {{ isEditing ? '编辑剪后记录' : '记录这次理发' }}
      </h1>
      <p>留下真实照片与感受，下一次才有可以复刻或避开的依据。</p>
    </header>

    <p
      v-if="store.loading || initializing"
      class="archive-loading"
      role="status"
    >
      正在读取本地记录…
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
      <p>剪后记录需要归属于这台设备上的主档案。</p>
      <RouterLink
        class="archive-primary-link"
        to="/archive/profile"
      >
        建立档案
      </RouterLink>
    </div>

    <div
      v-else-if="recordMissing"
      class="archive-empty archive-empty--inner"
    >
      <h2>没有找到这条剪后记录</h2>
      <RouterLink
        class="text-link"
        to="/archive"
      >
        返回档案
      </RouterLink>
    </div>

    <form
      v-else
      class="archive-form record-form"
      @submit.prevent="submit"
    >
      <p
        v-if="localError || store.error"
        class="form-alert"
        role="alert"
      >
        {{ localError || store.error }}
      </p>

      <fieldset class="record-photos">
        <legend>剪前 / 剪后 · 至少一张</legend>
        <label
          v-for="item in photoStages"
          :key="item.stage"
          v-tactile
        >
          <span>{{ item.label }}照片</span>
          <small v-if="existingPhotoLabel(item.stage)">{{ existingPhotoLabel(item.stage) }}</small>
          <small
            v-if="photoPreparationLabel(item.stage)"
            :class="{ 'photo-status--error': photoPreparationByStage[item.stage]?.status === 'error' }"
            :role="photoPreparationByStage[item.stage]?.status === 'error' ? 'alert' : 'status'"
          >
            {{ photoPreparationLabel(item.stage) }}
          </small>
          <img
            v-if="photoPreviewUrl(item.stage)"
            class="photo-preparation-preview"
            :src="photoPreviewUrl(item.stage)"
            :alt="`${item.label}处理后预览`"
          >
          <span class="record-photo-trigger">选择{{ item.label }}照片</span>
          <input
            class="record-photo-input"
            :name="`photo-${item.stage}`"
            :aria-label="`${item.label}照片`"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            :disabled="store.saving"
            @change="setPhoto(item.stage, $event)"
          >
        </label>
      </fieldset>

      <fieldset class="record-outcome">
        <legend>下次还这么剪吗？</legend>
        <label v-tactile>
          <input
            v-model="form.outcome"
            type="radio"
            value="repeat"
            @change="applyOutcomeDefault('repeat')"
          >
          就这样
        </label>
        <label v-tactile>
          <input
            v-model="form.outcome"
            type="radio"
            value="adjust"
            @change="applyOutcomeDefault('adjust')"
          >
          有一点要改
        </label>
        <label v-tactile>
          <input
            v-model="form.outcome"
            type="radio"
            value="avoid"
            @change="applyOutcomeDefault('avoid')"
          >
          别再这样
        </label>
      </fieldset>

      <div
        v-if="form.outcome === 'adjust'"
        class="avoid-rule-fields"
      >
        <label
          v-for="index in 3"
          :key="index"
        >
          <span>下次调整 {{ index }}</span>
          <input
            v-model="form.adjustmentNotes[index - 1]"
            :name="`adjustmentNote${index}`"
            maxlength="160"
            :required="index === 1"
            placeholder="例如：两侧留长一点"
          >
        </label>
      </div>

      <div
        v-if="form.outcome === 'avoid'"
        class="avoid-rule-fields"
      >
        <label
          v-for="index in 3"
          :key="index"
        >
          <span>避雷规则 {{ index }}</span>
          <input
            v-model="form.avoidRules[index - 1]"
            :name="`avoidRule${index}`"
            maxlength="160"
            :required="index === 1"
          >
        </label>
      </div>

      <details
        class="record-extra-details record-basic-details"
        :open="isEditing"
      >
        <summary v-tactile>
          <span>日期、名称和满意度</span>
          <small>今天已自动填好，发型名可以不写</small>
        </summary>
        <div class="record-extra-details__body">
          <div class="form-grid record-form__essentials">
            <label>
              <span>理发日期</span>
              <input
                v-model="form.date"
                name="date"
                type="date"
                required
              >
            </label>
            <label>
              <span>发型名</span>
              <input
                v-model="form.styleName"
                name="styleName"
                maxlength="80"
                placeholder="可不填，系统会按日期命名"
              >
            </label>
            <label>
              <span>满意度</span>
              <select
                v-model="form.satisfaction"
                name="satisfaction"
                required
              >
                <option
                  value=""
                  disabled
                >请打分</option>
                <option
                  v-for="score in 5"
                  :key="score"
                  :value="String(score)"
                >
                  {{ score }} / 5
                </option>
              </select>
            </label>
          </div>
        </div>
      </details>

      <details class="record-extra-details record-salon-details">
        <summary v-tactile>
          <span>在哪剪的（可选）</span>
          <small>记下店铺、位置和理发师，下次更容易找到</small>
        </summary>
        <div class="record-extra-details__body">
          <div class="form-grid">
            <label>
              <span>店铺</span>
              <input
                v-model="form.salonName"
                name="salonName"
                maxlength="80"
              >
            </label>
            <label>
              <span>店铺位置（可选）</span>
              <input
                v-model="form.salonLocation"
                name="salonLocation"
                maxlength="160"
                placeholder="例如：静安区南京西路 688 号"
              >
            </label>
            <label>
              <span>理发师</span>
              <input
                v-model="form.barberName"
                name="barberName"
                maxlength="80"
              >
            </label>
          </div>
        </div>
      </details>

      <details class="record-extra-details">
        <summary v-tactile>
          <span>更多记录（可选）</span>
          <small>关联计划、服务、价格、耗时和备注</small>
        </summary>
        <div class="record-extra-details__body">
          <label>
            <span>关联计划（可选）</span>
            <select
              v-model="form.planId"
              name="planId"
            >
              <option value="">不关联计划</option>
              <option
                v-for="plan in store.plans"
                :key="plan.id"
                :value="plan.id"
              >
                {{ plan.title }}
              </option>
            </select>
          </label>
          <div class="form-grid">
            <label>
              <span>服务</span>
              <input
                v-model="form.serviceName"
                name="serviceName"
                maxlength="80"
              >
            </label>
            <label>
              <span>价格（元）</span>
              <input
                v-model="form.priceYuan"
                name="priceYuan"
                inputmode="decimal"
                placeholder="例如 128.50"
              >
            </label>
            <label>
              <span>耗时（分钟）</span>
              <input
                v-model="form.durationMinutes"
                name="durationMinutes"
                inputmode="numeric"
                type="number"
                min="1"
                step="1"
              >
            </label>
          </div>
          <label>
            <span>备注</span>
            <textarea
              v-model="form.notes"
              name="notes"
              rows="4"
              maxlength="1000"
            />
          </label>
        </div>
      </details>

      <aside
        class="privacy-note"
        aria-label="本地照片保存说明"
      >
        <b>处理后的照片只存本机</b>
        <p>新选照片会在浏览器本地纠正方向、压缩并重绘，去除原文件名与 EXIF；处理后的副本不会上传。</p>
      </aside>

      <button
        v-tactile
        class="submit-button"
        type="submit"
        :disabled="store.saving || isProcessingPhotos"
      >
        {{ store.saving ? '正在保存…' : isEditing ? '保存修改' : '保存剪后记录' }}
      </button>
    </form>
  </section>
</template>
