<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import HairstyleTile from '../features/hairstyle-library/components/HairstyleTile.vue'
import StyleFilterBar from '../features/hairstyle-library/components/StyleFilterBar.vue'
import {
  curatedHairstyles,
  filterCuratedHairstyles,
} from '../features/hairstyle-library/curatedCatalog'
import { useHairstyleLibraryStore } from '../features/hairstyle-library/libraryStore'
import type {
  CuratedHairstyle,
  MaintenanceLevel,
  StyleGoal,
} from '../features/hairstyle-library/types'

const route = useRoute()
const store = useHairstyleLibraryStore()
const query = ref('')
const goals = ref<StyleGoal[]>([])
const maintenanceLevels = ref<MaintenanceLevel[]>([])
const selectedFolder = ref<'all' | 'unfiled' | string>('all')
const folderFormOpen = ref(false)
const folderName = ref('')
const renameName = ref('')

const showingFavorites = computed(() => route.name === 'styles-favorites')
const heading = computed(() => showingFavorites.value ? '我的收藏' : '找发型')
const activeStyles = computed(() => curatedHairstyles.filter(({ status }) => status === 'active'))
const favoriteByStyleId = computed(() => new Map(
  store.favorites
    .filter(({ itemType }) => itemType === 'curated_style')
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

const belongsToSelectedFolder = (style: CuratedHairstyle) => {
  const favorite = favoriteByStyleId.value.get(style.id)
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

const resultStyles = computed(() => (
  showingFavorites.value
    ? filteredCatalog.value.filter(belongsToSelectedFolder)
    : filteredCatalog.value
))

const hasFilters = computed(() => (
  Boolean(query.value) || goals.value.length > 0 || maintenanceLevels.value.length > 0
))

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

watch(showingFavorites, (isFavorites) => {
  if (!isFavorites) {
    selectedFolder.value = 'all'
  }
})

const loadLibrary = () => store.load()

onMounted(loadLibrary)
</script>

<template>
  <section
    class="style-library-view"
    :aria-labelledby="showingFavorites ? 'favorites-title' : 'styles-title'"
  >
    <header class="style-library-header">
      <div>
        <p class="eyebrow">
          CURATED · LOCAL FAVORITES
        </p>
        <h1 :id="showingFavorites ? 'favorites-title' : 'styles-title'">
          {{ heading }}
        </h1>
        <p v-if="showingFavorites">
          只在当前设备整理，清除浏览器数据后可能丢失。
        </p>
        <p v-else>
          六个诚实的短发方向，先看维护与现实限制，再决定要不要继续。
        </p>
      </div>

      <nav aria-label="发型库分区">
        <RouterLink
          to="/styles"
          :aria-current="!showingFavorites ? 'page' : undefined"
        >
          精选发型
        </RouterLink>
        <RouterLink
          to="/styles/favorites"
          :aria-current="showingFavorites ? 'page' : undefined"
        >
          我的收藏
        </RouterLink>
      </nav>
    </header>

    <p class="style-library-disclosure">
      项目内 AI 合成成年人物正面示例；不代表侧面、后脑或真实剪后效果。
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

    <div class="style-library-layout">
      <StyleFilterBar
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
          正在读取本机收藏…
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
          v-if="resultStyles.length"
          class="hairstyle-grid"
        >
          <div
            v-for="style in resultStyles"
            :key="style.id"
            class="hairstyle-grid__item"
          >
            <HairstyleTile
              :style="style"
              :favorite="store.isFavorite(`curated_style:${style.id}`)"
              :busy="libraryBusy"
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

        <div
          v-else-if="!store.loading && !store.error"
          class="library-empty"
        >
          <h2>{{ showingFavorites && !hasFilters ? '还没有收藏' : '没有符合条件的发型' }}</h2>
          <p v-if="showingFavorites && !hasFilters">
            收藏是本机私人的整理动作。先从六个精选方向里留住真正想看的。
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
        </div>
      </div>
    </div>
  </section>
</template>
