<script setup lang="ts">
const navigationItems = [
  { index: '01', label: '首页', to: '/' },
  { index: '02', label: '试发型', to: '/try' },
  { index: '03', label: '档案', to: '/archive' },
  { index: '04', label: '我的', to: '/me' },
] as const
</script>

<template>
  <nav
    class="bottom-nav"
    aria-label="主导航"
  >
    <div class="bottom-nav__inner">
      <RouterLink
        v-for="item in navigationItems"
        :key="item.to"
        v-slot="{ href, navigate, isExactActive }"
        :to="item.to"
        custom
      >
        <a
          class="bottom-nav__link"
          :class="{ 'bottom-nav__link--active': isExactActive }"
          :href="href"
          :aria-current="isExactActive ? 'page' : undefined"
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
