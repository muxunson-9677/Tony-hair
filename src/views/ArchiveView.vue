<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { useArchiveStore } from '../features/archive/archiveStore'
import type { HairProfile, HaircutPlan } from '../features/archive/types'

const store = useArchiveStore()
const recordPhotoUrls = ref<Record<string, string>>({})

const textureLabels: Record<HairProfile['hairTexture'], string> = {
  straight: '直发',
  wavy: '微卷',
  curly: '卷发',
  coily: '强卷',
  unsure: '发质待确认',
}
const thicknessLabels: Record<HairProfile['strandThickness'], string> = {
  fine: '细',
  medium: '适中',
  coarse: '粗',
  unsure: '粗细待确认',
}
const densityLabels: Record<HairProfile['density'], string> = {
  low: '发量少',
  medium: '发量适中',
  high: '发量多',
  unsure: '发量待确认',
}
const washLabels: Record<HairProfile['washFrequency'], string> = {
  daily: '每天洗发',
  every_other_day: '隔天洗发',
  two_to_three_per_week: '每周洗 2—3 次',
  weekly_or_less: '每周 1 次或更少',
  unsure: '洗发频率待确认',
}
const statusLabels: Record<HaircutPlan['status'], string> = {
  draft: '草稿',
  ready: '可带去沟通',
  completed: '已完成',
}

const formatDate = (date: string) => {
  const parsed = new Date(`${date.slice(0, 10)}T00:00:00`)
  return Number.isNaN(parsed.valueOf())
    ? date
    : new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric' }).format(parsed)
}

const revokeRecordUrls = () => {
  Object.values(recordPhotoUrls.value).forEach((url) => URL.revokeObjectURL(url))
  recordPhotoUrls.value = {}
}

watch(
  [() => store.records, () => store.photosByRecordId],
  () => {
    revokeRecordUrls()
    recordPhotoUrls.value = Object.fromEntries(store.records.flatMap((record) => {
      const photo = store.photosByRecordId[record.id]?.[0]
      return photo ? [[record.id, URL.createObjectURL(photo.image)]] : []
    }))
  },
  { immediate: true },
)

onMounted(() => store.load())
onBeforeUnmount(revokeRecordUrls)
</script>

<template>
  <section
    class="archive-view"
    aria-labelledby="archive-title"
  >
    <header class="archive-header">
      <p class="eyebrow">
        YOUR CUT NOTES · 03
      </p>
      <h1 id="archive-title">
        档案
      </h1>
      <p>把下次要说清的方向，留在这台设备上。</p>
    </header>

    <p
      v-if="store.loading"
      class="archive-loading"
      role="status"
    >
      正在读取本地档案…
    </p>

    <p
      v-else-if="store.error"
      class="form-alert"
      role="alert"
    >
      {{ store.error }}
    </p>

    <div
      v-else-if="!store.profile"
      class="archive-empty"
    >
      <p class="section-index">
        01 / 本机档案
      </p>
      <h2>这台设备还没有发型档案</h2>
      <p>先记下你的发质和日常习惯，之后建立的计划与剪后记录才有归属。</p>
      <RouterLink
        class="archive-primary-link"
        to="/archive/profile"
      >
        <span>建立档案</span><span aria-hidden="true">→</span>
      </RouterLink>
      <p class="archive-trust-note">
        只保存在当前设备，不会创建账号或同步。清理浏览器数据、使用无痕模式或更换设备，都可能让档案丢失。
      </p>
    </div>

    <div
      v-else
      class="archive-content"
    >
      <section
        class="profile-summary"
        aria-labelledby="profile-summary-title"
      >
        <div>
          <p class="section-index">
            01 / 本机主档案
          </p>
          <h2 id="profile-summary-title">
            {{ store.profile.name }}的发型档案
          </h2>
          <p class="profile-summary__traits">
            {{ textureLabels[store.profile.hairTexture] }} ·
            {{ thicknessLabels[store.profile.strandThickness] }} ·
            {{ densityLabels[store.profile.density] }}
          </p>
          <p class="profile-summary__routine">
            日常打理 {{ store.profile.stylingMinutes ?? '未填写' }} 分钟 ·
            {{ washLabels[store.profile.washFrequency] }}
          </p>
          <p v-if="store.profile.preferenceNotes">
            {{ store.profile.preferenceNotes }}
          </p>
        </div>
        <RouterLink
          class="text-link"
          to="/archive/profile"
        >
          编辑档案
        </RouterLink>
      </section>

      <section
        class="archive-plans"
        aria-labelledby="archive-plans-title"
      >
        <div class="archive-section-heading">
          <div>
            <p class="section-index">
              02 / 发型计划
            </p>
            <h2 id="archive-plans-title">
              最近计划
            </h2>
          </div>
          <RouterLink
            class="text-link"
            to="/archive/plans/new"
          >
            新建发型计划
          </RouterLink>
        </div>
        <p
          v-if="store.plans.length === 0"
          class="archive-inline-empty"
        >
          还没有发型计划。先从六个预制短发中选 2—4 个真实候选。
        </p>
        <ol
          v-else
          class="plan-list"
        >
          <li
            v-for="plan in store.plans"
            :key="plan.id"
          >
            <RouterLink :to="`/archive/plans/${plan.id}`">
              <img
                v-if="store.candidatesByPlanId[plan.id]?.[0]?.demoImagePath"
                :src="store.candidatesByPlanId[plan.id]?.[0]?.demoImagePath"
                :alt="`${plan.title}的候选缩略图`"
              >
              <span class="plan-list__copy">
                <span>{{ formatDate(plan.date) }} · {{ statusLabels[plan.status] }}</span>
                <b>{{ plan.title }}</b>
                <small>{{ store.candidatesByPlanId[plan.id]?.length ?? 0 }} 个候选</small>
              </span>
              <span aria-hidden="true">→</span>
            </RouterLink>
          </li>
        </ol>
      </section>

      <section
        class="archive-records"
        aria-labelledby="archive-history-title"
      >
        <div class="archive-section-heading">
          <div>
            <p class="section-index">
              03 / 剪后记录
            </p>
            <h2 id="archive-history-title">
              最近剪后记录
            </h2>
          </div>
          <RouterLink
            class="text-link"
            to="/archive/records/new"
          >
            记录这次理发
          </RouterLink>
        </div>
        <p
          v-if="store.records.length === 0"
          class="archive-inline-empty"
        >
          还没有剪后记录。记录至少一张照片和满意度，之后才能形成复刻或避雷提醒。
        </p>
        <ol
          v-else
          class="record-list"
        >
          <li
            v-for="record in store.records"
            :key="record.id"
          >
            <RouterLink :to="`/archive/records/${record.id}`">
              <img
                v-if="recordPhotoUrls[record.id]"
                :src="recordPhotoUrls[record.id]"
                :alt="`${record.styleName}剪后照片`"
              >
              <span class="record-list__copy">
                <span>{{ formatDate(record.date) }} · 满意度 {{ record.satisfaction }} / 5</span>
                <b>{{ record.styleName }}</b>
                <small>{{ record.outcome === 'repeat' ? '可复刻' : '需避雷' }}</small>
              </span>
              <span aria-hidden="true">→</span>
            </RouterLink>
          </li>
        </ol>
      </section>

      <section
        class="archive-guidance"
        aria-labelledby="archive-standard-title"
      >
        <p class="section-index">
          04 / 可复刻
        </p>
        <h2 id="archive-standard-title">
          标准发型
        </h2>
        <p
          v-if="store.standardStyles.filter(({ active }) => active).length === 0"
          class="archive-inline-empty"
        >
          还没有标准发型。
        </p>
        <ul
          v-else
          class="guidance-list"
        >
          <li
            v-for="style in store.standardStyles.filter(({ active }) => active)"
            :key="style.id"
          >
            {{ style.name }}
          </li>
        </ul>
      </section>

      <section
        class="archive-guidance"
        aria-labelledby="archive-avoid-title"
      >
        <p class="section-index">
          05 / 要避开
        </p>
        <h2 id="archive-avoid-title">
          避雷规则
        </h2>
        <p
          v-if="store.avoidRules.filter(({ active }) => active).length === 0"
          class="archive-inline-empty"
        >
          还没有避雷规则。
        </p>
        <ul
          v-else
          class="guidance-list guidance-list--avoid"
        >
          <li
            v-for="rule in store.avoidRules.filter(({ active }) => active)"
            :key="rule.id"
          >
            {{ rule.text }}
          </li>
        </ul>
      </section>

      <section
        class="archive-future"
        aria-labelledby="archive-brief-title"
      >
        <p class="section-index">
          06 / 沟通卡
        </p>
        <h2 id="archive-brief-title">
          沟通卡暂不展示
        </h2>
        <p>本阶段暂不读取、编辑或导出沟通卡；下一任务再接入，不会把未检查的数据描述成空记录。</p>
      </section>

      <p class="archive-trust-note archive-trust-note--content">
        所有内容只在当前设备。清理浏览器数据或使用无痕模式，可能导致内容丢失。
      </p>
    </div>
  </section>
</template>
