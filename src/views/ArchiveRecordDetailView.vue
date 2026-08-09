<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useArchiveStore } from '../features/archive/archiveStore'
import type { HaircutPhoto } from '../features/archive/types'

const stageLabels: Record<HaircutPhoto['stage'], string> = {
  before: '剪前',
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
const plan = computed(() => store.plans.find(({ id }) => id === record.value?.planId))
const recordAvoidRules = computed(() => store.avoidRules.filter((rule) => (
  rule.recordId === recordId.value && rule.active
)))
const recordStandardStyles = computed(() => store.standardStyles.filter((style) => (
  style.recordId === recordId.value && style.active
)))
const photoUrls = ref<Record<string, string>>({})

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
  await store.load()
  if (record.value) {
    document.title = `${record.value.styleName}｜剪后记录｜咋剪发`
  }
})
onBeforeUnmount(revokePhotoUrls)
</script>

<template>
  <section
    class="record-detail-view"
    :aria-labelledby="store.loading || store.error ? 'record-detail-state-title' : record ? 'record-detail-title' : 'record-detail-missing-title'"
  >
    <RouterLink
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
      <header class="record-detail-header">
        <p class="eyebrow">
          CUT RESULT · LOCAL
        </p>
        <h1 id="record-detail-title">
          {{ record.styleName }}
        </h1>
        <p>{{ record.date }} · 满意度 <strong>{{ record.satisfaction }} / 5</strong></p>
        <div class="detail-actions">
          <RouterLink
            class="text-link"
            :to="`/archive/records/${record.id}/edit`"
          >
            编辑记录
          </RouterLink>
          <button
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
        class="record-photo-strip"
        aria-label="剪后照片"
      >
        <figure
          v-for="photo in photos"
          :key="photo.id"
        >
          <img
            :src="photoUrls[photo.id]"
            :alt="`${record.styleName}的${stageLabels[photo.stage]}照片`"
          >
          <figcaption>{{ stageLabels[photo.stage] }}</figcaption>
        </figure>
      </div>

      <dl class="record-metadata">
        <div v-if="plan">
          <dt>关联计划</dt><dd>{{ plan.title }}</dd>
        </div>
        <div v-if="record.salonName">
          <dt>店铺</dt><dd>{{ record.salonName }}</dd>
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

      <section
        v-if="record.outcome === 'repeat'"
        class="record-outcome-summary"
      >
        <p class="section-index">
          REPEAT
        </p>
        <h2>已存为标准发型</h2>
        <p
          v-for="style in recordStandardStyles"
          :key="style.id"
        >
          {{ style.name }}
        </p>
      </section>

      <section
        v-else
        class="record-outcome-summary record-outcome-summary--avoid"
      >
        <p class="section-index">
          AVOID
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
    </template>
  </section>
</template>
