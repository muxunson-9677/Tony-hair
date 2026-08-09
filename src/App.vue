<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import BottomNav from './components/BottomNav.vue'

const activeRoute = useRoute()
const mainContent = ref<HTMLElement | null>(null)
const hidesBottomNav = computed(() => activeRoute.meta.hideBottomNav === true)

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
  <div class="app-shell">
    <a
      class="skip-link"
      href="#main-content"
    >跳到主要内容</a>

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

    <BottomNav v-if="!hidesBottomNav" />
  </div>
</template>
