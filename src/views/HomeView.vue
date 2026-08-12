<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { useArchiveStore } from '../features/archive/archiveStore'
import type { HaircutPhoto } from '../features/archive/types'
import { curatedHairstyles } from '../features/hairstyle-library/curatedCatalog'
import { useHairstyleLibraryStore } from '../features/hairstyle-library/libraryStore'
import { daysSinceLastHaircut, selectRepeatThumbnailPhoto } from '../features/home/homeMemory'
import { resolveHomeAction, resolveHomeEntrances } from '../features/home/resolveHomeAction'
import { resolveHomeFavorite } from '../features/home/resolveHomeFavorite'
import { useLocalDayClock } from '../features/home/useLocalDayClock'
import AppIcon from '../ui/AppIcon.vue'
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

const store = useArchiveStore()
const libraryStore = useHairstyleLibraryStore()
const currentTime = useLocalDayClock()
const latestRecord = computed(() => store.records[0])
const latestPhoto = computed(() => (
  latestRecord.value ? store.photosByRecordId[latestRecord.value.id]?.[0] : undefined
))
const latestAvoidRules = computed(() => store.avoidRules.filter((rule) => (
  rule.recordId === latestRecord.value?.id && rule.active
)))
const historyPhotoUrl = ref<string | null>(null)
const favoriteStyle = computed(() => resolveHomeFavorite(
  libraryStore.favorites,
  curatedHairstyles,
))
const fallbackStyle = curatedHairstyles.find(({ id, status }) => (
  id === 'ran-sidepart' && status === 'active'
))
const homeVisualStyle = computed(() => favoriteStyle.value ?? fallbackStyle)

const homeAction = computed(() => resolveHomeAction({
  now: currentTime.value,
  profile: store.profile,
  plans: store.plans,
  candidatesByPlanId: store.candidatesByPlanId,
  briefsByPlanId: store.briefsByPlanId,
  records: store.records,
  photosByRecordId: store.photosByRecordId,
  standardStyles: store.standardStyles,
}))
const hasActivePlan = computed(() => store.plans.some(({ profileId, status }) => (
  profileId === store.profile?.id && (status === 'draft' || status === 'ready')
)))
const hasRepeatableStyle = computed(() => store.standardStyles.some(({ profileId, active }) => (
  profileId === store.profile?.id && active
)))
const homeEntrances = computed(() => resolveHomeEntrances({
  profile: store.profile,
  hasActivePlan: hasActivePlan.value,
  hasRepeatableStyle: hasRepeatableStyle.value,
}))
const secondaryEntrances = computed(() => homeEntrances.value.filter(({ to }) => (
  to !== homeAction.value.to
)))

// 补充 1：距上次理发天数（已建档且有记录时才显示），满意记录优先配剪后缩略图。
const daysSinceCut = computed(() => (
  store.profile ? daysSinceLastHaircut(latestRecord.value?.date, currentTime.value) : null
))
const repeatThumbnailPhoto = computed(() => (
  daysSinceCut.value === null
    ? undefined
    : selectRepeatThumbnailPhoto(store.records, store.photosByRecordId)
))
const repeatThumbnailUrl = ref<string | null>(null)

// 补充 1：当前活动计划带有记忆快照时，入口处提示已带入的经验条数。
const activePlanMemories = computed(() => {
  const activePlan = store.plans.find(({ profileId, status }) => (
    profileId === store.profile?.id && (status === 'draft' || status === 'ready')
  ))
  if (!activePlan) {
    return null
  }
  const count = (store.planMemoryByPlanId[activePlan.id] ?? []).length
  return count > 0 ? { planId: activePlan.id, count } : null
})

const actionContext = computed(() => {
  switch (homeAction.value.kind) {
    case 'choose_plan':
      return '你有多个进行中的计划，先明确这次继续哪一个。'
    case 'open_ready_brief':
    case 'open_brief':
      return '到店前再看一遍，把关键要求说清楚。'
    case 'add_candidates':
    case 'discover_styles':
      return '先从维护成本和现实限制开始找方向。'
    case 'choose_standard':
    case 'repeat_standard':
      return '从已经验证过的剪后记录继续，更不容易翻车。'
    case 'choose_primary':
      return '候选已经够了，下一步只确定真正要剪的主方案。'
    case 'continue_plan':
      return '这个计划还需要补齐信息。'
    case 'create_profile':
      return '一张正面照，加上你确定的几件事就够了。'
    default:
      return ''
  }
})

watch(latestPhoto, (photo) => {
  if (historyPhotoUrl.value) {
    URL.revokeObjectURL(historyPhotoUrl.value)
  }
  historyPhotoUrl.value = photo ? URL.createObjectURL(photo.image) : null
}, { immediate: true })

watch(repeatThumbnailPhoto, (photo) => {
  if (repeatThumbnailUrl.value) {
    URL.revokeObjectURL(repeatThumbnailUrl.value)
  }
  repeatThumbnailUrl.value = photo ? URL.createObjectURL(photo.image) : null
}, { immediate: true })

onMounted(() => {
  store.load()
  libraryStore.load()
})
onBeforeUnmount(() => {
  if (historyPhotoUrl.value) {
    URL.revokeObjectURL(historyPhotoUrl.value)
  }
  if (repeatThumbnailUrl.value) {
    URL.revokeObjectURL(repeatThumbnailUrl.value)
  }
})
</script>

<template>
  <section
    class="home-view"
    aria-labelledby="home-title"
  >
    <header class="home-hero">
      <div class="home-hero__copy">
        <p class="eyebrow">
          你的发型记录 · 只存本机
        </p>
        <div
          class="brand-lockup"
          data-testid="brand-lockup"
        >
          <img
            :src="'/brand/zajianfa-scissors-512.png'"
            alt=""
          >
          <h1
            id="home-title"
            class="brand-title"
          >
            咋剪发
          </h1>
        </div>
        <p class="brand-promise">
          剪前看看，剪时说清，剪后记住
        </p>
        <p class="home-hero__intro">
          {{ store.profile ? '这次想怎么剪？我会带着你的真实情况继续。' : '先让我认识你的头发，之后每次会越来越省事。' }}
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

        <div
          v-else
          class="home-decision"
        >
          <p
            v-if="daysSinceCut !== null"
            class="home-days-since"
            data-testid="home-days-since"
          >
            <img
              v-if="repeatThumbnailUrl"
              :src="repeatThumbnailUrl"
              alt="上次满意发型的剪后照片"
            >
            <span>距离上次理发 {{ daysSinceCut }} 天</span>
          </p>
          <p>{{ actionContext }}</p>
          <RouterLink
            v-tactile
            class="home-primary-action"
            :to="homeAction.to"
            data-testid="home-primary-action"
          >
            <span>{{ homeAction.label }}</span>
            <AppIcon name="check" />
          </RouterLink>
          <RouterLink
            v-if="activePlanMemories"
            v-tactile
            class="home-memory-link"
            data-testid="home-memory-link"
            :to="`/archive/plans/${activePlanMemories.planId}`"
          >
            已带上 {{ activePlanMemories.count }} 条你的经验
          </RouterLink>
          <nav
            v-if="secondaryEntrances.length"
            class="home-entrances"
            aria-label="这次想怎么开始"
          >
            <RouterLink
              v-for="entrance in secondaryEntrances"
              :key="entrance.kind"
              v-tactile
              class="home-entrance"
              :to="entrance.to"
            >
              <span
                class="home-entrance__icon"
                :data-kind="entrance.kind"
              >
                <AppIcon :name="entrance.kind === 'reference' ? 'photo' : 'scissors'" />
              </span>
              <span>
                <strong>{{ entrance.label }}</strong>
                <small>{{ entrance.hint }}</small>
              </span>
              <b aria-hidden="true">›</b>
            </RouterLink>
          </nav>
        </div>
      </div>

      <RouterLink
        v-if="latestRecord"
        v-tactile
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
        <span class="home-visual__index">上次理发 · 本机照片</span>
        <span class="home-visual__caption">
          <span>
            上次发型 · {{ latestRecord.styleName }}<br>
            <small>满意度 {{ latestRecord.satisfaction }} / 5</small>
          </span>
          <b aria-hidden="true">↗</b>
        </span>
      </RouterLink>

      <RouterLink
        v-else-if="homeVisualStyle && (store.profile || favoriteStyle)"
        v-tactile
        class="home-visual"
        :to="`/styles/catalog/${homeVisualStyle.id}`"
        :aria-label="favoriteStyle
          ? `查看收藏发型：${homeVisualStyle.name}`
          : `查看发型：${homeVisualStyle.name}`"
      >
        <img
          :src="homeVisualStyle.coverImage"
          :alt="favoriteStyle
            ? `${homeVisualStyle.imageAlt}，我的收藏`
            : `AI 生成的虚构成年人物短发造型示例：${homeVisualStyle.name}正面`"
          fetchpriority="high"
          decoding="async"
        >
        <span class="home-visual__index">
          {{ favoriteStyle ? '我的收藏 · 仅保存在本机' : '精选方向 · 预制示例' }}
        </span>
        <span class="home-visual__caption">
          {{ homeVisualStyle.name }} · {{ favoriteStyle ? '我的收藏' : '先看现实取舍' }}
          <b aria-hidden="true">↗</b>
        </span>
      </RouterLink>
    </header>

    <footer class="home-footer">
      <p
        v-if="latestRecord?.outcome === 'repeat'"
        class="home-history-reminder"
      >
        下次可以复刻：把细节带给理发师确认。
      </p>
      <p
        v-else-if="latestRecord?.outcome === 'avoid'"
        class="home-history-reminder home-history-reminder--avoid"
      >
        下次先避开：{{ latestAvoidRules.map(({ text }) => text).join('；') }}
      </p>
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
    </footer>
  </section>
</template>
