<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { useArchiveStore } from '../features/archive/archiveStore'
import type { HairProfile, HaircutPlan } from '../features/archive/types'
import { tactileDirective as vTactile } from '../ui/tactile'

const store = useArchiveStore()
const recordPhotoUrls = ref<Record<string, string>>({})
const profilePhotoUrls = ref<Record<string, string>>({})
const availableProfilePhotos = computed(() => [
  { angle: 'front', label: '正面' },
  { angle: 'side', label: '侧面' },
  { angle: 'back', label: '后脑' },
].flatMap((item) => {
  const url = profilePhotoUrls.value[item.angle]
  return url ? [{ ...item, url }] : []
}))
const savedBriefs = computed(() => store.plans.flatMap((plan) => {
  const brief = store.briefsByPlanId[plan.id]
  if (!brief) {
    return []
  }
  const candidates = store.candidatesByPlanId[plan.id] ?? []
  const candidate = candidates.find(({ id }) => id === brief.targetCandidateId)
  const candidateLabel = candidate?.name ?? (
    brief.targetCandidateId ? '目标候选需重新确认' : '旧版未记录目标候选'
  )
  return [{ plan, brief, candidate, candidateLabel }]
}))
const latestRecord = computed(() => store.records[0])
const activeStandardStyles = computed(() => store.standardStyles.filter(({ active }) => active))
const activeAvoidRules = computed(() => store.avoidRules.filter(({ active }) => active))
const hasArchiveActivity = computed(() => (
  store.plans.length > 0
  || store.records.length > 0
  || activeStandardStyles.value.length > 0
  || activeAvoidRules.value.length > 0
  || savedBriefs.value.length > 0
))
const photoForRecord = (recordId: string, stages: readonly string[]) => (
  (store.photosByRecordId[recordId] ?? []).find(({ stage }) => stages.includes(stage))
)
const recordHeroPhoto = (recordId: string) => photoForRecord(
  recordId,
  ['after', 'styled', 'unstyled', 'before'],
)
const latestComparison = computed(() => {
  if (!latestRecord.value) return []
  const before = photoForRecord(latestRecord.value.id, ['before'])
  const after = photoForRecord(latestRecord.value.id, ['after', 'styled', 'unstyled'])
  return [before, after].filter((photo): photo is NonNullable<typeof photo> => Boolean(photo))
})

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

const revokeProfileUrls = () => {
  Object.values(profilePhotoUrls.value).forEach((url) => URL.revokeObjectURL(url))
  profilePhotoUrls.value = {}
}

watch(
  () => store.profile?.profilePhotos,
  (photos) => {
    revokeProfileUrls()
    profilePhotoUrls.value = Object.fromEntries(
      (photos ?? []).map((photo) => [photo.angle, URL.createObjectURL(photo.image)]),
    )
  },
  { immediate: true },
)

watch(
  [() => store.records, () => store.photosByRecordId],
  () => {
    revokeRecordUrls()
    recordPhotoUrls.value = Object.fromEntries(store.records.flatMap((record) => (
      (store.photosByRecordId[record.id] ?? []).map((photo) => [
        photo.id,
        URL.createObjectURL(photo.image),
      ])
    )))
  },
  { immediate: true },
)

onMounted(() => store.load())
onBeforeUnmount(() => {
  revokeRecordUrls()
  revokeProfileUrls()
})
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
        v-tactile
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
        <div
          v-if="availableProfilePhotos.length"
          :class="[
            'profile-photo-wall',
            { 'profile-photo-wall--single': availableProfilePhotos.length === 1 },
          ]"
          aria-label="我的头发照片"
        >
          <img
            v-for="photo in availableProfilePhotos"
            :key="photo.angle"
            :src="photo.url"
            :alt="`我的头发${photo.label}照片`"
          >
        </div>
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
          v-tactile
          class="text-link"
          to="/archive/profile"
        >
          编辑档案
        </RouterLink>
      </section>

      <section
        v-if="store.plans.length === 0"
        class="archive-next-step"
        role="region"
        aria-label="下一步"
      >
        <span
          class="archive-next-step__icon"
          aria-hidden="true"
        >✦</span>
        <div>
          <p class="section-index">
            02 / 下一步
          </p>
          <h2>{{ hasArchiveActivity ? '把这次经验变成下一次计划' : '现在可以开始留下真正有用的内容' }}</h2>
          <p>{{ hasArchiveActivity ? '从满意的真实记录复刻，或重新比较几个适合你的方向。' : '不知道剪什么，先去看适合你的方向；刚剪完头发，就留下剪前或剪后照片。' }}</p>
        </div>
        <div class="archive-next-step__actions">
          <RouterLink
            v-tactile
            to="/archive/plans/new"
          >
            新建发型计划
          </RouterLink>
          <RouterLink
            v-tactile
            to="/archive/records/new"
          >
            记录这次理发
          </RouterLink>
        </div>
      </section>

      <section
        v-if="latestRecord && latestComparison.length"
        class="archive-latest-comparison"
        aria-labelledby="archive-latest-comparison-title"
      >
        <div class="archive-section-heading">
          <div>
            <p class="section-index">
              02 / 最近变化
            </p>
            <h2 id="archive-latest-comparison-title">
              这次剪前 / 剪后
            </h2>
          </div>
          <RouterLink
            v-tactile
            class="text-link"
            :to="`/archive/records/${latestRecord.id}`"
          >
            查看记录
          </RouterLink>
        </div>
        <div
          class="archive-comparison-grid"
          role="group"
          aria-label="最近一次剪前剪后"
        >
          <figure
            v-for="photo in latestComparison"
            :key="photo.id"
          >
            <img
              :src="recordPhotoUrls[photo.id]"
              :alt="`${latestRecord.styleName}${photo.stage === 'before' ? '剪前' : '剪后'}照片`"
            >
            <figcaption>{{ photo.stage === 'before' ? '剪前' : '剪后' }}</figcaption>
          </figure>
        </div>
      </section>

      <section
        v-if="store.plans.length > 0"
        class="archive-plans"
        aria-labelledby="archive-plans-title"
      >
        <div class="archive-section-heading">
          <div>
            <p class="section-index">
              04 / 发型计划
            </p>
            <h2 id="archive-plans-title">
              最近计划
            </h2>
          </div>
          <RouterLink
            v-tactile
            class="text-link"
            to="/archive/plans/new"
          >
            新建发型计划
          </RouterLink>
        </div>
        <ol
          class="plan-list"
        >
          <li
            v-for="plan in store.plans"
            :key="plan.id"
          >
            <RouterLink
              v-tactile
              :to="`/archive/plans/${plan.id}`"
            >
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
        v-if="store.plans.length > 0 || store.records.length > 0"
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
            v-tactile
            class="text-link"
            to="/archive/records/new"
          >
            记录这次理发
          </RouterLink>
        </div>
        <ol
          v-if="store.records.length > 0"
          class="record-list"
        >
          <li
            v-for="record in store.records"
            :key="record.id"
          >
            <RouterLink
              v-tactile
              :to="`/archive/records/${record.id}`"
            >
              <img
                v-if="recordHeroPhoto(record.id)"
                :src="recordPhotoUrls[recordHeroPhoto(record.id)?.id ?? '']"
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
        v-if="activeStandardStyles.length > 0"
        class="archive-guidance"
        aria-labelledby="archive-standard-title"
      >
        <p class="section-index">
          05 / 可复刻
        </p>
        <h2 id="archive-standard-title">
          标准发型
        </h2>
        <ul class="guidance-list">
          <li
            v-for="style in activeStandardStyles"
            :key="style.id"
          >
            {{ style.name }}
          </li>
        </ul>
      </section>

      <section
        v-if="activeAvoidRules.length > 0"
        class="archive-guidance"
        aria-labelledby="archive-avoid-title"
      >
        <p class="section-index">
          06 / 要避开
        </p>
        <h2 id="archive-avoid-title">
          避雷规则
        </h2>
        <ul class="guidance-list guidance-list--avoid">
          <li
            v-for="rule in activeAvoidRules"
            :key="rule.id"
          >
            {{ rule.text }}
          </li>
        </ul>
      </section>

      <section
        v-if="savedBriefs.length > 0"
        class="archive-briefs"
        aria-labelledby="archive-brief-title"
      >
        <p class="section-index">
          07 / 沟通卡
        </p>
        <h2 id="archive-brief-title">
          已保存 {{ savedBriefs.length }} 张沟通卡
        </h2>
        <ol
          class="brief-list"
        >
          <li
            v-for="item in savedBriefs"
            :key="item.brief.id"
          >
            <RouterLink
              v-tactile
              :to="`/archive/plans/${item.plan.id}/brief`"
              :aria-label="`${item.plan.title} · ${item.candidateLabel} · 查看沟通卡`"
            >
              <img
                v-if="item.candidate?.demoImagePath"
                :src="item.candidate.demoImagePath"
                :alt="`${item.candidate.name}目标缩略图`"
              >
              <span
                v-else
                class="brief-list__image-missing"
                aria-hidden="true"
              >旧版</span>
              <span class="brief-list__copy">
                <span>{{ formatDate(item.plan.date) }} · 仅当前设备</span>
                <b>{{ item.plan.title }}</b>
                <small>{{ item.candidateLabel }}</small>
              </span>
              <span aria-hidden="true">→</span>
            </RouterLink>
          </li>
        </ol>
      </section>

      <p class="archive-trust-note archive-trust-note--content">
        所有内容只在当前设备。清理浏览器数据或使用无痕模式，可能导致内容丢失。
      </p>
    </div>
  </section>
</template>
