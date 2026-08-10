<script setup lang="ts">
import { useRoute } from 'vue-router'

defineProps<{
  placement: 'desktop' | 'mobile'
}>()

const route = useRoute()
const navigationItems = [
  { index: '01', label: '首页', to: '/' },
  { index: '02', label: '找发型', to: '/styles' },
  { index: '03', label: '档案', to: '/archive' },
  { index: '04', label: '我的', to: '/me' },
] as const

const isItemActive = (to: string) => (
  to === '/'
    ? route.path === '/'
    : route.path === to || route.path.startsWith(`${to}/`)
)
</script>

<template>
  <nav
    class="bottom-nav"
    :class="`bottom-nav--${placement}`"
    aria-label="主导航"
  >
    <div class="bottom-nav__inner">
      <RouterLink
        v-slot="{ href, navigate }"
        to="/"
        custom
      >
        <a
          class="bottom-nav__brand"
          :href="href"
          aria-label="咋剪发首页"
          @click="navigate"
        >
          <img
            :src="'/brand/zajianfa-scissors-512.png'"
            alt=""
          >
          <span>咋剪发</span>
        </a>
      </RouterLink>
      <RouterLink
        v-for="item in navigationItems"
        :key="item.to"
        v-slot="{ href, navigate }"
        :to="item.to"
        custom
      >
        <a
          class="bottom-nav__link"
          :class="{ 'bottom-nav__link--active': isItemActive(item.to) }"
          :href="href"
          :aria-current="isItemActive(item.to) ? 'page' : undefined"
          @click="navigate"
        >
          <span
            class="bottom-nav__index"
            aria-hidden="true"
          >{{ item.index }}</span>
          <span>{{ item.label }}</span>
        </a>
      </RouterLink>
    </div>
  </nav>
</template>
