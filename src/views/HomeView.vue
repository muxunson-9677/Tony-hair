<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

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

const store = useArchiveStore()
const latestRecord = computed(() => store.records[0])
const latestPhoto = computed(() => (
  latestRecord.value ? store.photosByRecordId[latestRecord.value.id]?.[0] : undefined
))
const latestAvoidRules = computed(() => store.avoidRules.filter((rule) => (
  rule.recordId === latestRecord.value?.id && rule.active
)))
const historyPhotoUrl = ref<string | null>(null)

watch(latestPhoto, (photo) => {
  if (historyPhotoUrl.value) {
    URL.revokeObjectURL(historyPhotoUrl.value)
  }
  historyPhotoUrl.value = photo ? URL.createObjectURL(photo.image) : null
}, { immediate: true })

onMounted(() => store.load())
onBeforeUnmount(() => {
  if (historyPhotoUrl.value) {
    URL.revokeObjectURL(historyPhotoUrl.value)
  }
})
</script>

<template>
  <section
    class="home-view"
    aria-labelledby="home-title"
  >
    <header class="home-hero">
      <p class="eyebrow">
        HAIR DECISIONS · LOCAL FIRST
      </p>
      <h1
        id="home-title"
        class="brand-title"
      >
        咋剪发
      </h1>
      <p class="brand-promise">
        剪前看看，剪时说清，剪后记住
      </p>

      <p
        v-if="store.loading"
        class="archive-loading"
        role="status"
      >
        正在读取本地记录…
      </p>

      <p
        v-else-if="store.error"
        class="form-alert home-load-error"
        role="alert"
      >
        {{ store.error }}
      </p>

      <RouterLink
        v-else-if="latestRecord"
        class="home-visual home-visual--history"
        :to="`/archive/records/${latestRecord.id}`"
        :aria-label="`查看上次发型：${latestRecord.styleName}`"
      >
        <img
          v-if="historyPhotoUrl && latestPhoto"
          :src="historyPhotoUrl"
          :alt="`${latestRecord.styleName}的${stageLabels[latestPhoto.stage]}照片`"
          fetchpriority="high"
        >
        <span class="home-visual__index">LAST CUT · LOCAL</span>
        <span class="home-visual__caption">
          <span>
            上次发型 · {{ latestRecord.styleName }}<br>
            <small>满意度 {{ latestRecord.satisfaction }} / 5</small>
          </span>
          <b aria-hidden="true">↗</b>
        </span>
      </RouterLink>

      <RouterLink
        v-else
        class="home-visual"
        to="/try"
        aria-label="查看短发示例并进入试发型"
      >
        <img
          :src="'/demo/persona-ran-sidepart.webp'"
          alt="AI 生成的虚构成年人物短发造型示例"
          fetchpriority="high"
        >
        <span class="home-visual__index">01 / DEMO</span>
        <span class="home-visual__caption">从一张示例开始，看清短发方向 <b aria-hidden="true">↗</b></span>
      </RouterLink>

      <p
        v-if="latestRecord?.outcome === 'repeat'"
        class="home-history-reminder"
      >
        下次可以复刻这次记录，并把细节带给理发师确认。
      </p>
      <p
        v-else-if="latestRecord?.outcome === 'avoid'"
        class="home-history-reminder home-history-reminder--avoid"
      >
        下次先避开：{{ latestAvoidRules.map(({ text }) => text).join('；') }}
      </p>
    </header>

    <div
      class="home-actions"
      aria-label="开始使用"
    >
      <RouterLink
        class="action action--primary"
        to="/try"
      >
        <span>准备去剪</span><span aria-hidden="true">↗</span>
      </RouterLink>
      <RouterLink
        class="action action--secondary"
        to="/archive/records/new"
      >
        <span>记录这次理发</span><span aria-hidden="true">＋</span>
      </RouterLink>
      <p class="local-note">
        <span
          class="local-note__dot"
          aria-hidden="true"
        />
        <span>
          <span>照片和记录仅保存在当前设备，不会上传或同步。</span><br>
          <span>清理浏览器数据、使用无痕模式或更换设备，都可能让记录丢失。</span>
        </span>
      </p>
    </div>
  </section>
</template>
