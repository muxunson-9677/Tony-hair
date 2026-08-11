<script setup lang="ts">
import { useRoute } from 'vue-router'

import AppIcon from '../ui/AppIcon.vue'
import { tactileDirective as vTactile } from '../ui/tactile'

defineProps<{
  placement: 'desktop' | 'mobile'
}>()

const route = useRoute()
const navigationItems = [
  { icon: 'home', label: '首页', to: '/', tone: 'coral' },
  { icon: 'styles', label: '找发型', to: '/styles', tone: 'blue' },
  { icon: 'archive', label: '档案', to: '/archive', tone: 'purple' },
  { icon: 'me', label: '我的', to: '/me', tone: 'mint' },
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
          v-tactile
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
          v-tactile
          class="bottom-nav__link"
          :class="{ 'bottom-nav__link--active': isItemActive(item.to) }"
          :href="href"
          :aria-current="isItemActive(item.to) ? 'page' : undefined"
          :data-tone="item.tone"
          @click="navigate"
        >
          <span
            class="bottom-nav__icon-well"
            data-nav-icon
            aria-hidden="true"
          >
            <AppIcon :name="item.icon" />
          </span>
          <span class="bottom-nav__label">{{ item.label }}</span>
        </a>
      </RouterLink>
    </div>
  </nav>
</template>
