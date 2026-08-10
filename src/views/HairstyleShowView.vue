<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch, watchEffect } from 'vue'
import { useRoute } from 'vue-router'

import { curatedHairstyles } from '../features/hairstyle-library/curatedCatalog'
import { useHairstyleLibraryStore } from '../features/hairstyle-library/libraryStore'

const route = useRoute()
const store = useHairstyleLibraryStore()
const id = computed(() => typeof route.params.id === 'string' ? route.params.id : '')
const isPrivate = computed(() => route.name === 'style-reference-show')
const curatedStyle = computed(() => isPrivate.value ? undefined : curatedHairstyles.find(
  (style) => style.id === id.value && style.status === 'active',
))
const privateReference = computed(() => isPrivate.value ? store.getReference(id.value) : undefined)
const privateImageUrl = ref<string | null>(null)

const releasePrivateImage = () => {
  if (privateImageUrl.value) {
    URL.revokeObjectURL(privateImageUrl.value)
    privateImageUrl.value = null
  }
}

watch(privateReference, (reference) => {
  releasePrivateImage()
  if (reference) {
    privateImageUrl.value = URL.createObjectURL(reference.image)
  }
}, { immediate: true })

watchEffect(() => {
  if (isPrivate.value) {
    document.title = privateReference.value
      ? `${privateReference.value.name}｜给理发师看`
      : '私人参考｜给理发师看'
    return
  }
  document.title = curatedStyle.value
    ? `${curatedStyle.value.name}｜给理发师看`
    : '精选发型｜给理发师看'
})

const loadLibrary = () => store.load()

onMounted(() => {
  if (isPrivate.value) {
    void loadLibrary()
  }
})
onBeforeUnmount(releasePrivateImage)
</script>

<template>
  <section
    v-if="curatedStyle"
    class="style-show-view style-show-view--curated"
    aria-labelledby="style-show-title"
  >
    <div class="style-show-media">
      <img
        :src="curatedStyle.coverImage"
        :alt="curatedStyle.imageAlt"
        fetchpriority="high"
      >
      <RouterLink
        class="style-show-back"
        :to="`/styles/catalog/${curatedStyle.id}`"
      >
        <span aria-hidden="true">←</span>
        返回发型详情
      </RouterLink>
    </div>

    <article class="style-show-copy">
      <header>
        <p class="eyebrow">
          CURATED STYLE · BARBER VIEW
        </p>
        <h1 id="style-show-title">
          {{ curatedStyle.name }}
        </h1>
        <p class="style-show-disclosure">
          {{ curatedStyle.disclosure }}
        </p>
        <p class="style-show-limitation">
          只提供正面参考；侧面与后脑必须结合你的头型、发旋和现场长度确认。
        </p>
      </header>

      <section aria-labelledby="style-show-reality-title">
        <h2 id="style-show-reality-title">
          现实限制
        </h2>
        <p>{{ curatedStyle.feasibility }}</p>
        <ul>
          <li
            v-for="tradeoff in curatedStyle.tradeoffs"
            :key="tradeoff"
          >
            {{ tradeoff }}
          </li>
        </ul>
      </section>

      <section aria-labelledby="style-show-guide-title">
        <h2 id="style-show-guide-title">
          剪发沟通要点
        </h2>
        <dl class="style-show-guide">
          <div><dt>整体</dt><dd>{{ curatedStyle.barberGuide.overall }}</dd></div>
          <div><dt>顶部</dt><dd>{{ curatedStyle.barberGuide.top }}</dd></div>
          <div><dt>刘海</dt><dd>{{ curatedStyle.barberGuide.fringe }}</dd></div>
          <div><dt>两侧</dt><dd>{{ curatedStyle.barberGuide.sides }}</dd></div>
          <div><dt>鬓角</dt><dd>{{ curatedStyle.barberGuide.sideburns }}</dd></div>
          <div><dt>后脑</dt><dd>{{ curatedStyle.barberGuide.back }}</dd></div>
        </dl>
      </section>

      <section
        class="style-show-priorities"
        aria-label="优先事项与绝对不要"
      >
        <div>
          <h2>最在意</h2>
          <ol>
            <li
              v-for="item in curatedStyle.barberGuide.topPriorities"
              :key="item"
            >
              {{ item }}
            </li>
          </ol>
        </div>
        <div>
          <h2>绝对不要</h2>
          <ol>
            <li
              v-for="item in curatedStyle.barberGuide.absoluteAvoids"
              :key="item"
            >
              {{ item }}
            </li>
          </ol>
        </div>
      </section>
    </article>
  </section>

  <section
    v-else-if="privateReference"
    class="style-show-view style-show-view--private"
    aria-labelledby="private-style-show-title"
  >
    <div class="style-show-media">
      <img
        v-if="privateImageUrl"
        :src="privateImageUrl"
        :alt="`${privateReference.name}的私人参考`"
        fetchpriority="high"
      >
      <RouterLink
        class="style-show-back"
        :to="`/styles/references/${privateReference.id}`"
      >
        <span aria-hidden="true">←</span>
        返回私人参考
      </RouterLink>
    </div>
    <article class="style-show-copy style-show-copy--private">
      <header>
        <p class="eyebrow">
          PRIVATE REFERENCE · THIS DEVICE
        </p>
        <h1 id="private-style-show-title">
          {{ privateReference.name }}
        </h1>
      </header>
      <p class="private-show-notes">
        {{ privateReference.notes || '未填写备注。' }}
      </p>
    </article>
  </section>

  <section
    v-else-if="isPrivate && store.error"
    class="style-terminal show-terminal"
    role="alert"
  >
    <p class="eyebrow">
      PRIVATE REFERENCE · READ FAILED
    </p>
    <h1>暂时无法读取这份参考</h1>
    <p>{{ store.error }}</p>
    <button
      type="button"
      @click="loadLibrary"
    >
      重试读取本机发型库
    </button>
  </section>

  <section
    v-else-if="isPrivate && (store.loading || !store.initialized)"
    class="style-terminal"
    role="status"
  >
    正在读取本机参考…
  </section>

  <section
    v-else-if="isPrivate"
    class="style-terminal show-terminal"
  >
    <p class="eyebrow">
      PRIVATE REFERENCE · UNAVAILABLE
    </p>
    <h1>这份私人参考找不到了</h1>
    <p>它可能已从当前设备删除。我们没有用其他照片替换它。</p>
    <RouterLink to="/styles/references">
      返回我的参考
    </RouterLink>
  </section>

  <section
    v-else
    class="style-terminal show-terminal"
  >
    <p class="eyebrow">
      CURATED STYLE · UNAVAILABLE
    </p>
    <h1>这个精选发型暂时不可用</h1>
    <p>这个编号不存在或已经退出精选库。我们没有用其他发型替换它。</p>
    <RouterLink to="/styles">
      返回找发型
    </RouterLink>
  </section>
</template>
