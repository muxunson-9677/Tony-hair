<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import HairstyleTile from '../features/hairstyle-library/components/HairstyleTile.vue'
import StyleFilterBar from '../features/hairstyle-library/components/StyleFilterBar.vue'
import {
  curatedHairstyles,
  filterCuratedHairstyles,
} from '../features/hairstyle-library/curatedCatalog'
import { useHairstyleLibraryStore } from '../features/hairstyle-library/libraryStore'
import { useArchiveStore } from '../features/archive/archiveStore'
import { rankStylesForProfile } from '../features/archive/personalization'
import type {
  CuratedHairstyle,
  MaintenanceLevel,
  PrivateHairstyleReference,
  StyleGoal,
} from '../features/hairstyle-library/types'

const route = useRoute()
const store = useHairstyleLibraryStore()
const archiveStore = useArchiveStore()
const query = ref('')
const goals = ref<StyleGoal[]>([])
const maintenanceLevels = ref<MaintenanceLevel[]>([])
const selectedFolder = ref<'all' | 'unfiled' | string>('all')
const folderFormOpen = ref(false)
const folderName = ref('')
const renameName = ref('')
const referenceObjectUrls = ref<Record<string, string>>({})

const showingFavorites = computed(() => route.name === 'styles-favorites')
const showingReferences = computed(() => route.name === 'styles-references')
const showingCatalog = computed(() => !showingFavorites.value && !showingReferences.value)
const heading = computed(() => {
  if (showingFavorites.value) return '我的收藏'
  if (showingReferences.value) return '我的参考'
  return '找发型'
})
const titleId = computed(() => {
  if (showingFavorites.value) return 'favorites-title'
  if (showingReferences.value) return 'references-title'
  return 'styles-title'
})
const activeStyles = computed(() => curatedHairstyles.filter(({ status }) => status === 'active'))
const favoriteByStyleId = computed(() => new Map(
  store.favorites
    .filter(({ itemType }) => itemType === 'curated_style')
    .map((favorite) => [favorite.itemId, favorite]),
))
const favoriteByReferenceId = computed(() => new Map(
  store.favorites
    .filter(({ itemType }) => itemType === 'private_reference')
    .map((favorite) => [favorite.itemId, favorite]),
))
const activeFolder = computed(() => (
  selectedFolder.value === 'all' || selectedFolder.value === 'unfiled'
    ? null
    : store.folders.find(({ id }) => id === selectedFolder.value) ?? null
))
const libraryBusy = computed(() => !store.initialized || store.loading || store.saving)

const filteredCatalog = computed(() => filterCuratedHairstyles({
  query: query.value,
  goals: goals.value,
  maintenanceLevels: maintenanceLevels.value,
}))
const rankedCatalog = computed(() => rankStylesForProfile(filteredCatalog.value, archiveStore.profile))
const personalizationByStyleId = computed(() => new Map(
  rankedCatalog.value.map(({ style, reason }) => [style.id, reason]),
))

const belongsToSelectedFolder = (favorite: { readonly folderId: string | null } | undefined) => {
  if (!favorite) {
    return false
  }
  if (selectedFolder.value === 'all') {
    return true
  }
  if (selectedFolder.value === 'unfiled') {
    return favorite.folderId === null
  }
  return favorite.folderId === selectedFolder.value
}

const resultStyles = computed(() => {
  if (showingReferences.value) {
    return []
  }
  return showingFavorites.value
    ? filteredCatalog.value.filter((style) => (
        belongsToSelectedFolder(favoriteByStyleId.value.get(style.id))
      ))
    : rankedCatalog.value.map(({ style }) => style)
})

const resultReferences = computed(() => {
  if (showingReferences.value) {
    return store.references
  }
  if (!showingFavorites.value) {
    return []
  }
  return store.references.filter((reference) => (
    belongsToSelectedFolder(favoriteByReferenceId.value.get(reference.id))
  ))
})

const hasResults = computed(() => resultStyles.value.length > 0 || resultReferences.value.length > 0)
const hasFilters = computed(() => (
  Boolean(query.value) || goals.value.length > 0 || maintenanceLevels.value.length > 0
))

const releaseReferenceUrls = () => {
  Object.values(referenceObjectUrls.value).forEach((url) => URL.revokeObjectURL(url))
  referenceObjectUrls.value = {}
}

watch(() => store.references, (references) => {
  releaseReferenceUrls()
  referenceObjectUrls.value = Object.fromEntries(
    references.map((reference) => [reference.id, URL.createObjectURL(reference.image)]),
  )
}, { immediate: true })

const resetFilters = () => {
  query.value = ''
  goals.value = []
  maintenanceLevels.value = []
}

const toggleFavorite = async (style: CuratedHairstyle) => {
  if (libraryBusy.value) {
    return
  }
  await store.toggleFavorite({ itemType: 'curated_style', itemId: style.id })
}

const createFolder = async () => {
  if (libraryBusy.value) {
    return
  }
  const saved = await store.saveFolder({ name: folderName.value })
  if (!saved) {
    return
  }
  folderName.value = ''
  folderFormOpen.value = false
}

const selectFolder = (id: 'all' | 'unfiled' | string) => {
  selectedFolder.value = id
  const folder = store.folders.find((item) => item.id === id)
  renameName.value = folder?.name ?? ''
}

const renameFolder = async () => {
  if (libraryBusy.value || !activeFolder.value) {
    return
  }
  const renamed = await store.renameFolder(activeFolder.value.id, { name: renameName.value })
  if (renamed) {
    renameName.value = renamed.name
  }
}

const deleteFolder = async () => {
  if (libraryBusy.value || !activeFolder.value) {
    return
  }
  if (!window.confirm(`删除收藏夹“${activeFolder.value.name}”？其中的收藏会回到未分类。`)) {
    return
  }
  if (await store.deleteFolder(activeFolder.value.id)) {
    selectedFolder.value = 'all'
    renameName.value = ''
  }
}

const moveFavorite = async (style: CuratedHairstyle, event: Event) => {
  if (libraryBusy.value) {
    return
  }
  const value = (event.target as HTMLSelectElement).value
  await store.moveFavorite(
    { itemType: 'curated_style', itemId: style.id },
    value || null,
  )
}

const moveReferenceFavorite = async (reference: PrivateHairstyleReference, event: Event) => {
  if (libraryBusy.value) {
    return
  }
  const value = (event.target as HTMLSelectElement).value
  await store.moveFavorite(
    { itemType: 'private_reference', itemId: reference.id },
    value || null,
  )
}

watch([showingFavorites, showingReferences], ([isFavorites]) => {
  if (!isFavorites) {
    selectedFolder.value = 'all'
  }
})

const loadLibrary = () => Promise.all([store.load(), archiveStore.load()])

onMounted(loadLibrary)
onBeforeUnmount(releaseReferenceUrls)
</script>

<template>
  <section
    class="style-library-view"
    :aria-labelledby="titleId"
  >
    <header class="style-library-header">
      <div>
        <p class="eyebrow">
          {{ showingReferences ? 'PRIVATE · THIS DEVICE' : 'CURATED · LOCAL FAVORITES' }}
        </p>
        <h1 :id="titleId">
          {{ heading }}
        </h1>
        <p v-if="showingFavorites">
          只在当前设备整理，清除浏览器数据后可能丢失。
        </p>
        <p v-else-if="showingReferences">
          只保存在当前设备。把你真正想留给下次理发看的图片，整理成私人参考。
        </p>
        <p v-else>
          {{ archiveStore.profile ? `已根据 ${archiveStore.profile.name} 的发质、偏好和打理时间在本机排序。` : '六个诚实的短发方向，建立档案后会按你的真实情况排序。' }}
        </p>
      </div>

      <nav aria-label="发型库分区">
        <RouterLink
          to="/styles"
          :aria-current="showingCatalog ? 'page' : undefined"
        >
          精选发型
        </RouterLink>
        <RouterLink
          to="/styles/favorites"
          :aria-current="showingFavorites ? 'page' : undefined"
        >
          我的收藏
        </RouterLink>
        <RouterLink
          to="/styles/references"
          :aria-current="showingReferences ? 'page' : undefined"
        >
          我的参考
        </RouterLink>
      </nav>
    </header>

    <div
      v-if="showingReferences"
      class="reference-library-intro"
    >
      <p>处理后的图片、名称、备注和标签都不会上传。</p>
      <RouterLink
        v-if="store.references.length"
        to="/styles/references/new"
      >
        添加私人参考
      </RouterLink>
    </div>
    <p
      v-else
      class="style-library-disclosure"
    >
      精选图为项目内 AI 合成成年人物正面示例；不代表侧面、后脑或真实剪后效果。
    </p>

    <div
      v-if="showingFavorites"
      class="favorite-folders"
    >
      <div
        class="favorite-folders__rail"
        aria-label="收藏夹"
      >
        <button
          type="button"
          :aria-pressed="selectedFolder === 'all'"
          @click="selectFolder('all')"
        >
          全部收藏
        </button>
        <button
          type="button"
          :aria-pressed="selectedFolder === 'unfiled'"
          @click="selectFolder('unfiled')"
        >
          未分类
        </button>
        <button
          v-for="folder in store.folders"
          :key="folder.id"
          type="button"
          :aria-pressed="selectedFolder === folder.id"
          @click="selectFolder(folder.id)"
        >
          {{ folder.name }}
        </button>
        <button
          type="button"
          :aria-expanded="folderFormOpen"
          @click="folderFormOpen = !folderFormOpen"
        >
          新建收藏夹
        </button>
      </div>

      <form
        v-if="folderFormOpen"
        class="favorite-folder-form"
        aria-label="新建收藏夹"
        @submit.prevent="createFolder"
      >
        <label>
          <span>收藏夹名称</span>
          <input
            v-model="folderName"
            maxlength="24"
            required
          >
        </label>
        <button
          type="submit"
          :disabled="libraryBusy"
        >
          创建收藏夹
        </button>
      </form>

      <form
        v-if="activeFolder"
        class="favorite-folder-form favorite-folder-form--manage"
        role="region"
        aria-label="管理收藏夹"
        @submit.prevent="renameFolder"
      >
        <label>
          <span>收藏夹新名称</span>
          <input
            v-model="renameName"
            maxlength="24"
            required
          >
        </label>
        <button
          type="submit"
          :disabled="libraryBusy"
        >
          保存名称
        </button>
        <button
          class="favorite-folder-form__delete"
          type="button"
          :disabled="libraryBusy"
          @click="deleteFolder"
        >
          删除收藏夹
        </button>
      </form>
    </div>

    <div
      class="style-library-layout"
      :class="{ 'style-library-layout--references': showingReferences }"
    >
      <StyleFilterBar
        v-if="!showingReferences"
        v-model:query="query"
        v-model:goals="goals"
        v-model:maintenance-levels="maintenanceLevels"
        @reset="resetFilters"
      />

      <div class="style-library-results">
        <p
          v-if="store.loading"
          class="library-state"
          role="status"
        >
          正在读取本机发型库…
        </p>
        <div
          v-else-if="store.error"
          class="library-state library-state--error"
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

        <div
          v-if="hasResults"
          class="library-result-groups"
        >
          <section
            v-if="resultReferences.length"
            class="reference-library-section"
            aria-labelledby="reference-library-section-title"
          >
            <h2 id="reference-library-section-title">
              {{ showingFavorites ? '私人参考' : '已保存的参考' }}
            </h2>
            <div class="reference-library-grid">
              <article
                v-for="reference in resultReferences"
                :key="reference.id"
                class="reference-library-item"
              >
                <RouterLink
                  :to="`/styles/references/${reference.id}`"
                  :aria-label="`查看私人参考：${reference.name}`"
                >
                  <span class="reference-library-item__media">
                    <img
                      :src="referenceObjectUrls[reference.id]"
                      :alt="`${reference.name}的私人参考`"
                      loading="lazy"
                      decoding="async"
                    >
                    <span>仅本机</span>
                  </span>
                  <span class="reference-library-item__copy">
                    <strong>{{ reference.name }}</strong>
                    <small>{{ reference.tags.length ? reference.tags.join(' · ') : '未添加标签' }}</small>
                  </span>
                </RouterLink>
                <label
                  v-if="showingFavorites"
                  class="favorite-move"
                >
                  <span>移动“{{ reference.name }}”到收藏夹</span>
                  <select
                    :value="favoriteByReferenceId.get(reference.id)?.folderId ?? ''"
                    :disabled="libraryBusy"
                    @change="moveReferenceFavorite(reference, $event)"
                  >
                    <option value="">未分类</option>
                    <option
                      v-for="folder in store.folders"
                      :key="folder.id"
                      :value="folder.id"
                    >
                      {{ folder.name }}
                    </option>
                  </select>
                </label>
              </article>
            </div>
          </section>

          <section
            v-if="resultStyles.length"
            class="curated-library-section"
            :aria-labelledby="showingFavorites ? 'curated-favorites-title' : undefined"
          >
            <h2
              v-if="showingFavorites"
              id="curated-favorites-title"
            >
              精选发型
            </h2>
            <div class="hairstyle-grid">
              <div
                v-for="style in resultStyles"
                :key="style.id"
                class="hairstyle-grid__item"
              >
                <HairstyleTile
                  :style="style"
                  :favorite="store.isFavorite(`curated_style:${style.id}`)"
                  :busy="libraryBusy"
                  :personalized-reason="showingCatalog && archiveStore.profile ? personalizationByStyleId.get(style.id) : ''"
                  @toggle-favorite="toggleFavorite(style)"
                />
                <label
                  v-if="showingFavorites"
                  class="favorite-move"
                >
                  <span>移动“{{ style.name }}”到收藏夹</span>
                  <select
                    :value="favoriteByStyleId.get(style.id)?.folderId ?? ''"
                    :disabled="libraryBusy"
                    @change="moveFavorite(style, $event)"
                  >
                    <option value="">未分类</option>
                    <option
                      v-for="folder in store.folders"
                      :key="folder.id"
                      :value="folder.id"
                    >
                      {{ folder.name }}
                    </option>
                  </select>
                </label>
              </div>
            </div>
          </section>
        </div>

        <div
          v-else-if="!store.loading && !store.error"
          class="library-empty"
        >
          <template v-if="showingReferences">
            <h2>还没有私人参考</h2>
            <p>上传的图片会先在本机处理，只保存处理后的版本。你不需要先建立发型档案。</p>
            <RouterLink to="/styles/references/new">
              添加第一张参考
            </RouterLink>
          </template>
          <template v-else>
            <h2>{{ showingFavorites && !hasFilters ? '还没有收藏' : '没有符合条件的发型' }}</h2>
            <p v-if="showingFavorites && !hasFilters">
              收藏是本机私人的整理动作。先从精选方向或自己的参考里留住真正想看的。
            </p>
            <p v-else>
              当前组合没有结果，清空条件后可以重新浏览全部 {{ activeStyles.length }} 款。
            </p>
            <RouterLink
              v-if="showingFavorites && !hasFilters"
              to="/styles"
            >
              浏览精选发型
            </RouterLink>
            <button
              v-else
              type="button"
              @click="resetFilters"
            >
              清空筛选
            </button>
          </template>
        </div>
      </div>
    </div>
  </section>
</template>
