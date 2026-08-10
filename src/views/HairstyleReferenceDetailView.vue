<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useHairstyleLibraryStore } from '../features/hairstyle-library/libraryStore'

const route = useRoute()
const router = useRouter()
const store = useHairstyleLibraryStore()
const id = computed(() => typeof route.params.id === 'string' ? route.params.id : '')
const reference = computed(() => store.getReference(id.value))
const imageUrl = ref<string | null>(null)
const favorite = computed(() => reference.value
  ? store.isFavorite(`private_reference:${reference.value.id}`)
  : false)
const libraryBusy = computed(() => !store.initialized || store.loading || store.saving)

const releaseImage = () => {
  if (imageUrl.value) {
    URL.revokeObjectURL(imageUrl.value)
    imageUrl.value = null
  }
}

watch(reference, (current) => {
  releaseImage()
  if (current) {
    imageUrl.value = URL.createObjectURL(current.image)
  }
}, { immediate: true })

watchEffect(() => {
  if (route.name !== 'style-reference-detail') {
    return
  }
  document.title = reference.value
    ? `${reference.value.name}｜咋剪发`
    : '私人参考｜咋剪发'
})

const loadLibrary = () => store.load()

const toggleFavorite = async () => {
  if (!reference.value || libraryBusy.value) {
    return
  }
  await store.toggleFavorite({
    itemType: 'private_reference',
    itemId: reference.value.id,
  })
}

const deleteReference = async () => {
  const current = reference.value
  if (!current || libraryBusy.value) {
    return
  }
  if (!window.confirm(
    `删除“${current.name}”？本机来源和对应收藏会移除；已保存到计划中的照片快照仍会保留。`,
  )) {
    return
  }
  if (await store.deleteReference(current.id)) {
    await router.replace('/styles/references')
  }
}

onMounted(loadLibrary)
onBeforeUnmount(releaseImage)
</script>

<template>
  <section
    v-if="reference"
    class="style-reference-detail-view"
    aria-labelledby="reference-detail-title"
  >
    <div class="style-reference-detail-media">
      <img
        v-if="imageUrl"
        :src="imageUrl"
        :alt="`${reference.name}的私人参考`"
        fetchpriority="high"
      >
      <RouterLink
        class="style-detail-media__back"
        to="/styles/references"
      >
        <span aria-hidden="true">←</span>
        我的参考
      </RouterLink>
    </div>

    <article class="style-reference-detail-copy">
      <header>
        <p class="eyebrow">
          PRIVATE REFERENCE · THIS DEVICE
        </p>
        <h1 id="reference-detail-title">
          {{ reference.name }}
        </h1>
        <p>处理后的照片和说明只保存在当前设备；这不是公开内容。</p>
      </header>

      <section aria-labelledby="reference-notes-title">
        <p class="style-detail-section-index">
          01
        </p>
        <h2 id="reference-notes-title">
          我的备注
        </h2>
        <p>{{ reference.notes || '还没有填写备注。' }}</p>
      </section>

      <section aria-labelledby="reference-tags-title">
        <p class="style-detail-section-index">
          02
        </p>
        <h2 id="reference-tags-title">
          标签
        </h2>
        <ul
          v-if="reference.tags.length"
          class="reference-tag-list"
        >
          <li
            v-for="tag in reference.tags"
            :key="tag"
          >
            {{ tag }}
          </li>
        </ul>
        <p v-else>
          还没有添加标签。
        </p>
      </section>

      <div
        v-if="store.error"
        class="reference-detail-action-error"
        role="alert"
      >
        <p>{{ store.error }}</p>
        <button
          type="button"
          @click="loadLibrary"
        >
          重新读取本机状态
        </button>
      </div>
    </article>

    <div
      class="reference-action-dock"
      aria-label="私人参考操作"
    >
      <RouterLink :to="`/styles/references/${reference.id}/show`">
        给理发师看
      </RouterLink>
      <button
        type="button"
        :aria-label="`收藏：${reference.name}`"
        :aria-pressed="favorite"
        :disabled="libraryBusy"
        @click="toggleFavorite"
      >
        {{ favorite ? '已收藏' : '收藏' }}
      </button>
      <RouterLink :to="`/styles/references/${reference.id}/edit`">
        编辑私人参考
      </RouterLink>
      <button
        class="reference-action-dock__delete"
        type="button"
        :disabled="libraryBusy"
        @click="deleteReference"
      >
        删除私人参考
      </button>
    </div>
  </section>

  <section
    v-else-if="store.error"
    class="style-terminal reference-detail-terminal"
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
    v-else-if="store.loading || !store.initialized"
    class="style-terminal"
    role="status"
  >
    正在读取本机参考…
  </section>

  <section
    v-else
    class="style-terminal"
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
</template>
