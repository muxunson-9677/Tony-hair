<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { pageTitle } from '../config/brand'
import { useRoute, useRouter } from 'vue-router'

import { useArchiveStore } from '../features/archive/archiveStore'
import { consumePendingRecordAttribution } from '../features/archive/recordAttribution'
import { regionMarkSummary } from '../features/archive/regionMarks'
import type { HaircutPhoto } from '../features/archive/types'
import { tactileDirective as vTactile } from '../ui/tactile'

const stageLabels: Record<HaircutPhoto['stage'], string> = {
  before: '剪前',
  after: '剪后',
  during: '理发中',
  unstyled: '未打理',
  styled: '已造型',
  after_wash: '洗后',
  day_7: '第 7 天',
}

const route = useRoute()
const router = useRouter()
const store = useArchiveStore()
const recordId = computed(() => typeof route.params.id === 'string' ? route.params.id : '')
const record = computed(() => store.records.find(({ id }) => id === recordId.value))
const photos = computed(() => store.photosByRecordId[recordId.value] ?? [])
const comparisonPhotos = computed(() => {
  const before = photos.value.find(({ stage }) => stage === 'before')
  const after = photos.value.find(({ stage }) => stage === 'after')
    ?? photos.value.find(({ stage }) => stage === 'styled')
    ?? photos.value.find(({ stage }) => stage === 'unstyled')
  return [before, after].filter((photo): photo is HaircutPhoto => Boolean(photo))
})
const legacyPhotos = computed(() => photos.value.filter(({ id }) => (
  !comparisonPhotos.value.some((photo) => photo.id === id)
)))
const plan = computed(() => store.plans.find(({ id }) => id === record.value?.planId))

// ②B：目标图 / 剪后图 / 标注 三图并排。
const regionMarks = computed(() => {
  const current = record.value
  return current && current.outcome !== 'repeat' ? current.regionMarks ?? [] : []
})
const afterPhoto = computed(() => (
  photos.value.find(({ stage }) => stage === 'after')
    ?? photos.value.find(({ stage }) => stage === 'styled')
    ?? photos.value.find(({ stage }) => stage === 'unstyled')
))
const anchoredMarks = computed(() => regionMarks.value
  .map((mark, index) => ({ mark, number: index + 1 }))
  .filter(({ mark }) => mark.photoId && mark.photoId === afterPhoto.value?.id))
const targetCandidate = computed(() => {
  const planId = record.value?.planId
  if (!planId) {
    return undefined
  }
  const brief = store.briefsByPlanId[planId]
  if (!brief?.targetCandidateId) {
    return undefined
  }
  return (store.candidatesByPlanId[planId] ?? []).find(({ id }) => id === brief.targetCandidateId)
})
const targetImageUrl = ref('')
watch(targetCandidate, (candidate) => {
  if (targetImageUrl.value.startsWith('blob:')) {
    URL.revokeObjectURL(targetImageUrl.value)
  }
  targetImageUrl.value = candidate?.demoImagePath
    ?? (candidate?.referenceImage ? URL.createObjectURL(candidate.referenceImage) : '')
}, { immediate: true })
const showTriptych = computed(() => (
  record.value !== undefined
  && record.value.outcome !== 'repeat'
  && regionMarks.value.length > 0
))
const dotStyle = (x: number, y: number) => ({
  left: `${(x * 100).toFixed(2)}%`,
  top: `${(y * 100).toFixed(2)}%`,
})
const recordAvoidRules = computed(() => store.avoidRules.filter((rule) => (
  rule.recordId === recordId.value && rule.active
)))
const recordStandardStyles = computed(() => store.standardStyles.filter((style) => (
  style.recordId === recordId.value && style.active
)))
const photoUrls = ref<Record<string, string>>({})
const attributionMessage = ref<string | null>(null)

const revokePhotoUrls = () => {
  Object.values(photoUrls.value).forEach((url) => URL.revokeObjectURL(url))
  photoUrls.value = {}
}

watch(photos, (nextPhotos) => {
  revokePhotoUrls()
  photoUrls.value = Object.fromEntries(nextPhotos.map((photo) => [
    photo.id,
    URL.createObjectURL(photo.image),
  ]))
}, { immediate: true })

const formatPrice = (priceCents: number) => `¥${(priceCents / 100).toFixed(2)}`

const deleteRecord = async () => {
  const current = record.value
  if (!current || !window.confirm('确定删除这条剪后记录吗？档案和计划会保留。')) {
    return
  }
  if (await store.deleteRecord(current.id)) {
    await router.push('/archive')
  }
}

onMounted(async () => {
  attributionMessage.value = consumePendingRecordAttribution(recordId.value)
  await store.load()
  if (record.value) {
    document.title = pageTitle(`${record.value.styleName}｜剪后记录`)
  }
})
onBeforeUnmount(() => {
  revokePhotoUrls()
  if (targetImageUrl.value.startsWith('blob:')) {
    URL.revokeObjectURL(targetImageUrl.value)
  }
})
</script>

<template>
  <section
    class="record-detail-view"
    :aria-labelledby="store.loading || store.error ? 'record-detail-state-title' : record ? 'record-detail-title' : 'record-detail-missing-title'"
  >
    <RouterLink
      v-tactile
      class="back-link"
      to="/archive"
    >
      <span aria-hidden="true">←</span> 返回档案
    </RouterLink>

    <div v-if="store.loading">
      <h1 id="record-detail-state-title">
        剪后记录详情
      </h1>
      <p
        class="archive-loading"
        role="status"
      >
        正在读取本地记录…
      </p>
    </div>

    <div v-else-if="store.error">
      <h1 id="record-detail-state-title">
        暂时无法读取记录
      </h1>
      <p
        class="form-alert"
        role="alert"
      >
        {{ store.error }}
      </p>
    </div>

    <div
      v-else-if="!record"
      class="archive-empty archive-empty--inner"
    >
      <h1 id="record-detail-missing-title">
        没有找到这条剪后记录
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
      <p
        v-if="attributionMessage"
        class="record-attribution-note"
        role="status"
      >
        {{ attributionMessage }}
      </p>

      <header class="record-detail-header">
        <p class="eyebrow">
          这次剪完的真实结果 · 仅保存在本机
        </p>
        <h1 id="record-detail-title">
          {{ record.styleName }}
        </h1>
        <p>{{ record.date }} · 满意度 <strong>{{ record.satisfaction }} / 5</strong></p>
        <div class="detail-actions">
          <RouterLink
            v-tactile
            class="text-link"
            :to="`/archive/records/${record.id}/edit`"
          >
            编辑记录
          </RouterLink>
          <button
            v-tactile
            class="danger-text-button"
            type="button"
            :disabled="store.saving"
            @click="deleteRecord"
          >
            删除记录
          </button>
        </div>
      </header>

      <div
        class="record-photo-comparison"
        role="group"
        aria-label="剪前剪后对比"
      >
        <figure
          v-for="photo in comparisonPhotos"
          :key="photo.id"
        >
          <img
            :src="photoUrls[photo.id]"
            :alt="`${record.styleName}的${stageLabels[photo.stage]}照片`"
          >
          <figcaption>{{ stageLabels[photo.stage] }}</figcaption>
        </figure>
      </div>

      <section
        v-if="showTriptych"
        class="record-triptych"
        aria-labelledby="record-triptych-title"
      >
        <p class="section-index">
          问题区域存档
        </p>
        <h2 id="record-triptych-title">
          当时想剪的 · 实际剪成的 · 哪里出了问题
        </h2>
        <div class="record-triptych__grid">
          <figure class="record-triptych__panel">
            <img
              v-if="targetImageUrl"
              :src="targetImageUrl"
              :alt="`${record.styleName}的目标参考图`"
            >
            <div
              v-else
              class="record-triptych__placeholder"
            >
              没有关联目标图
            </div>
            <figcaption>当时想剪的</figcaption>
          </figure>
          <figure class="record-triptych__panel">
            <img
              v-if="afterPhoto"
              :src="photoUrls[afterPhoto.id]"
              :alt="`${record.styleName}的剪后照片`"
            >
            <div
              v-else
              class="record-triptych__placeholder"
            >
              没有剪后照片
            </div>
            <figcaption>实际剪成的</figcaption>
          </figure>
          <figure class="record-triptych__panel record-triptych__panel--marks">
            <div
              v-if="afterPhoto && anchoredMarks.length > 0"
              class="record-triptych__annotated"
            >
              <img
                :src="photoUrls[afterPhoto.id]"
                :alt="`${record.styleName}的问题区域标注图`"
              >
              <span
                v-for="({ mark, number }) in anchoredMarks"
                :key="mark.id"
                class="region-annotator__dot"
                :style="dotStyle(mark.x, mark.y)"
                aria-hidden="true"
              >{{ number }}</span>
            </div>
            <div
              v-else
              class="record-triptych__placeholder"
            >
              标注照片已更换，仅保留文字说明
            </div>
            <figcaption>哪里出了问题</figcaption>
          </figure>
        </div>
        <ol
          class="record-triptych__legend"
          aria-label="问题区域清单"
        >
          <li
            v-for="(mark, index) in regionMarks"
            :key="mark.id"
          >
            <span
              class="region-annotator__list-index"
              aria-hidden="true"
            >{{ index + 1 }}</span>
            {{ regionMarkSummary(mark) }}
          </li>
        </ol>
      </section>

      <details
        v-if="legacyPhotos.length"
        class="record-legacy-photos"
      >
        <summary>查看旧版其他阶段照片（{{ legacyPhotos.length }}）</summary>
        <div class="record-photo-strip">
          <figure
            v-for="photo in legacyPhotos"
            :key="photo.id"
          >
            <img
              :src="photoUrls[photo.id]"
              :alt="`${record.styleName}的${stageLabels[photo.stage]}照片`"
            >
            <figcaption>{{ stageLabels[photo.stage] }}</figcaption>
          </figure>
        </div>
      </details>

      <section
        v-if="record.outcome === 'repeat'"
        class="record-outcome-summary"
      >
        <p class="section-index">
          下次照着剪
        </p>
        <h2>下次可以照着剪</h2>
        <p
          v-for="style in recordStandardStyles"
          :key="style.id"
        >
          {{ style.name }}
        </p>
      </section>

      <section
        v-else-if="record.outcome === 'adjust'"
        class="record-outcome-summary record-outcome-summary--adjust"
      >
        <p class="section-index">
          下次微调
        </p>
        <h2>下次我会记得这些调整</h2>
        <ul>
          <li
            v-for="item in record.adjustmentNotes"
            :key="item"
          >
            {{ item }}
          </li>
        </ul>
      </section>

      <section
        v-else
        class="record-outcome-summary record-outcome-summary--avoid"
      >
        <p class="section-index">
          下次避开
        </p>
        <h2>这次记为避雷</h2>
        <ul>
          <li
            v-for="rule in recordAvoidRules"
            :key="rule.id"
          >
            {{ rule.text }}
          </li>
        </ul>
      </section>

      <details class="record-detail-more">
        <summary v-tactile>
          查看本次店铺与备注
        </summary>
        <dl class="record-metadata">
          <div v-if="plan">
            <dt>关联计划</dt><dd>{{ plan.title }}</dd>
          </div>
          <div v-if="record.salonName">
            <dt>店铺</dt><dd>{{ record.salonName }}</dd>
          </div>
          <div v-if="record.salonLocation">
            <dt>店铺位置</dt><dd>{{ record.salonLocation }}</dd>
          </div>
          <div v-if="record.barberName">
            <dt>理发师</dt><dd>{{ record.barberName }}</dd>
          </div>
          <div v-if="record.serviceName">
            <dt>服务</dt><dd>{{ record.serviceName }}</dd>
          </div>
          <div v-if="record.priceCents !== undefined">
            <dt>价格</dt><dd>{{ formatPrice(record.priceCents) }}</dd>
          </div>
          <div v-if="record.durationMinutes !== undefined">
            <dt>耗时</dt><dd>{{ record.durationMinutes }} 分钟</dd>
          </div>
          <div v-if="record.notes">
            <dt>备注</dt><dd>{{ record.notes }}</dd>
          </div>
        </dl>
      </details>
    </template>
  </section>
</template>
