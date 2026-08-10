<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import BottomNav from './components/BottomNav.vue'

const activeRoute = useRoute()
const mainContent = ref<HTMLElement | null>(null)
const hidesBottomNav = computed(() => activeRoute.meta.hideBottomNav === true)
const usesWideLayout = computed(() => activeRoute.meta.wideLayout === true)
const desktopNavigationQuery = typeof window.matchMedia === 'function'
  ? window.matchMedia('(min-width: 900px)')
  : null
const usesDesktopNavigation = ref(desktopNavigationQuery?.matches ?? false)

const syncNavigationPlacement = (query: MediaQueryList | MediaQueryListEvent) => {
  usesDesktopNavigation.value = query.matches
}

onMounted(() => {
  desktopNavigationQuery?.addEventListener('change', syncNavigationPlacement)
})

onBeforeUnmount(() => {
  desktopNavigationQuery?.removeEventListener('change', syncNavigationPlacement)
})

watch(
  () => activeRoute.fullPath,
  async () => {
    if (typeof activeRoute.meta.title === 'string') {
      document.title = activeRoute.meta.title
    }

    await nextTick()
    mainContent.value?.focus()
  },
  { immediate: true },
)
</script>

<template>
  <div
    class="app-shell"
    :class="{ 'app-shell--wide': usesWideLayout }"
  >
    <a
      class="skip-link"
      href="#main-content"
    >跳到主要内容</a>

    <BottomNav
      v-if="!hidesBottomNav && usesDesktopNavigation"
      placement="desktop"
    />

    <main
      id="main-content"
      ref="mainContent"
      class="app-main"
      :class="{ 'app-main--without-nav': hidesBottomNav }"
      tabindex="-1"
    >
      <RouterView v-slot="{ Component, route }">
        <Transition
          name="route"
          mode="out-in"
        >
          <component
            :is="Component"
            :key="route.path"
          />
        </Transition>
      </RouterView>
    </main>

    <BottomNav
      v-if="!hidesBottomNav && !usesDesktopNavigation"
      placement="mobile"
    />
  </div>
</template>
