<script setup lang="ts">
import { computed, onMounted, watchEffect } from 'vue'
import { useRoute } from 'vue-router'

import StyleActionDock from '../features/hairstyle-library/components/StyleActionDock.vue'
import {
  curatedHairstyles,
  MAINTENANCE_LEVEL_LABELS,
  STYLE_GOAL_LABELS,
} from '../features/hairstyle-library/curatedCatalog'
import { useHairstyleLibraryStore } from '../features/hairstyle-library/libraryStore'
import { useArchiveStore } from '../features/archive/archiveStore'
import { personalizedStyleReason } from '../features/archive/personalization'

const route = useRoute()
const store = useHairstyleLibraryStore()
const archiveStore = useArchiveStore()
const style = computed(() => curatedHairstyles.find(({ id, status }) => (
  id === route.params.id && status === 'active'
)))
const favorite = computed(() => (
  style.value ? store.isFavorite(`curated_style:${style.value.id}`) : false
))
const libraryBusy = computed(() => !store.initialized || store.loading || store.saving)
const personalReason = computed(() => (
  style.value && archiveStore.profile
    ? personalizedStyleReason(style.value, archiveStore.profile)
    : ''
))

const textureLabels = {
  straight: '直发',
  wavy: '微卷',
  curly: '卷发',
  coily: '紧密卷',
  unsure: '不确定',
} as const

const toggleFavorite = async () => {
  if (libraryBusy.value || !style.value) {
    return
  }
  await store.toggleFavorite({ itemType: 'curated_style', itemId: style.value.id })
}

watchEffect(() => {
  if (route.name !== 'style-detail') {
    return
  }
  document.title = style.value
    ? `${style.value.name}｜咋剪发`
    : '发型不可用｜咋剪发'
})

const loadLibrary = () => Promise.all([store.load(), archiveStore.load()])

onMounted(loadLibrary)
</script>

<template>
  <section
    v-if="style"
    class="style-detail-view"
    aria-labelledby="style-detail-title"
  >
    <div class="style-detail-media">
      <img
        :src="style.coverImage"
        :alt="style.imageAlt"
        fetchpriority="high"
        decoding="async"
      >
      <RouterLink
        class="style-detail-media__back"
        to="/styles"
      >
        <span aria-hidden="true">←</span>
        找发型
      </RouterLink>
    </div>

    <article class="style-detail-copy">
      <header>
        <p class="eyebrow">
          精选发型方向 · 当前只有正面参考
        </p>
        <h1 id="style-detail-title">
          {{ style.name }}
        </h1>
        <p class="style-detail-copy__reason">
          {{ style.reason }}
        </p>
        <p class="style-detail-disclosure">
          {{ style.disclosure }}
        </p>
        <div
          v-if="store.error"
          class="library-state library-state--error style-detail-library-state"
          role="alert"
        >
          <p>{{ store.error }}</p>
          <button
            type="button"
            @click="loadLibrary"
          >
            重试读取本机发型库
          </button>
        </div>
      </header>

      <section
        v-if="personalReason"
        class="style-personal-fit"
        aria-labelledby="style-personal-fit-title"
      >
        <p class="style-detail-section-index">
          FOR YOU
        </p>
        <h2 id="style-personal-fit-title">
          为什么排在你的前面
        </h2>
        <p>{{ personalReason }}</p>
        <small>这是根据你保存在本机的发质、风格和打理时间做的规则解释，不是效果保证。</small>
      </section>

      <section aria-labelledby="style-fit-title">
        <p class="style-detail-section-index">
          01
        </p>
        <h2 id="style-fit-title">
          适合条件
        </h2>
        <p>{{ style.feasibility }}</p>
        <dl class="style-detail-facts">
          <div>
            <dt>发质方向</dt>
            <dd>{{ style.hairTextures.map((item) => textureLabels[item]).join('、') }}</dd>
          </div>
          <div>
            <dt>想解决</dt>
            <dd>{{ style.goals.map((item) => STYLE_GOAL_LABELS[item]).join('、') }}</dd>
          </div>
        </dl>
      </section>

      <details class="style-detail-disclosure-section">
        <summary>
          <span><b>02</b> 维护成本</span>
          <small>{{ MAINTENANCE_LEVEL_LABELS[style.maintenanceLevel] }} · 每天约 {{ style.stylingMinutes }} 分钟</small>
        </summary>
        <section aria-labelledby="style-maintenance-title">
          <p class="style-detail-section-index">
            02
          </p>
          <h2 id="style-maintenance-title">
            维护成本
          </h2>
          <p>{{ style.maintenanceSummary }}</p>
          <dl class="style-detail-facts">
            <div>
              <dt>维护级别</dt>
              <dd>{{ MAINTENANCE_LEVEL_LABELS[style.maintenanceLevel] }}</dd>
            </div>
            <div>
              <dt>每天打理</dt>
              <dd>约 {{ style.stylingMinutes }} 分钟</dd>
            </div>
            <div>
              <dt>修剪周期</dt>
              <dd>{{ style.trimIntervalWeeks[0] }}—{{ style.trimIntervalWeeks[1] }} 周</dd>
            </div>
          </dl>
        </section>
      </details>

      <details class="style-detail-disclosure-section">
        <summary>
          <span><b>03</b> 现实取舍</span>
          <small>剪之前先看清限制</small>
        </summary>
        <section aria-labelledby="style-tradeoffs-title">
          <p class="style-detail-section-index">
            03
          </p>
          <h2 id="style-tradeoffs-title">
            现实取舍
          </h2>
          <ul class="style-detail-list">
            <li
              v-for="tradeoff in style.tradeoffs"
              :key="tradeoff"
            >
              {{ tradeoff }}
            </li>
          </ul>
        </section>
      </details>

      <details class="style-detail-disclosure-section">
        <summary>
          <span><b>04</b> 给理发师看的要点</span>
          <small>完整部位说明与避雷项</small>
        </summary>
        <section aria-labelledby="style-barber-title">
          <p class="style-detail-section-index">
            04
          </p>
          <h2 id="style-barber-title">
            给理发师看的要点
          </h2>
          <dl class="barber-guide">
            <div><dt>整体</dt><dd>{{ style.barberGuide.overall }}</dd></div>
            <div><dt>顶部</dt><dd>{{ style.barberGuide.top }}</dd></div>
            <div><dt>刘海</dt><dd>{{ style.barberGuide.fringe }}</dd></div>
            <div><dt>两侧</dt><dd>{{ style.barberGuide.sides }}</dd></div>
            <div><dt>鬓角</dt><dd>{{ style.barberGuide.sideburns }}</dd></div>
            <div><dt>后脑</dt><dd>{{ style.barberGuide.back }}</dd></div>
          </dl>
          <div class="barber-guide-lists">
            <div>
              <h3>最在意</h3>
              <ol>
                <li
                  v-for="item in style.barberGuide.topPriorities"
                  :key="item"
                >
                  {{ item }}
                </li>
              </ol>
            </div>
            <div>
              <h3>绝对不要</h3>
              <ol>
                <li
                  v-for="item in style.barberGuide.absoluteAvoids"
                  :key="item"
                >
                  {{ item }}
                </li>
              </ol>
            </div>
          </div>
        </section>
      </details>
    </article>

    <StyleActionDock
      :style="style"
      :favorite="favorite"
      :busy="libraryBusy"
      @toggle-favorite="toggleFavorite"
    />
  </section>

  <section
    v-else
    class="style-terminal"
    aria-labelledby="style-terminal-title"
  >
    <p class="eyebrow">
      发型库 · 暂不可用
    </p>
    <h1 id="style-terminal-title">
      这个发型暂时不可用
    </h1>
    <p>
      这个编号不存在或已经退出精选库。我们没有用其他发型替换它，也不会假装旧参考仍可新增。
    </p>
    <RouterLink to="/styles">
      返回找发型
    </RouterLink>
  </section>
</template>
