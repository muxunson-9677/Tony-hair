<script setup lang="ts">
import BottomNav from './components/BottomNav.vue'
</script>

<template>
  <div class="app-shell">
    <a
      class="skip-link"
      href="#main-content"
    >跳到主要内容</a>

    <main
      id="main-content"
      class="app-main"
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

    <BottomNav />
  </div>
</template>
