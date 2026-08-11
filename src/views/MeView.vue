<script setup lang="ts">
import AppIcon from '../ui/AppIcon.vue'
import { tactileDirective as vTactile } from '../ui/tactile'

const tools = [
  { to: '/archive/profile', icon: 'me', tone: 'coral', title: '头发档案', detail: '发质、发量、打理时间与明确偏好' },
  { to: '/archive', icon: 'archive', tone: 'purple', title: '理发档案', detail: '计划、沟通卡、剪后记录与复刻依据' },
  { to: '/privacy/mask', icon: 'eye', tone: 'blue', title: '照片遮罩', detail: '本机定位与手动确认，导出新的单层图片' },
] as const
</script>

<template>
  <section
    class="me-view"
    aria-labelledby="me-title"
  >
    <header class="me-header">
      <p class="eyebrow">
        YOUR DEVICE · PRIVATE
      </p>
      <h1 id="me-title">
        我的
      </h1>
      <p>管理会直接影响下次理发的本机内容。</p>
    </header>

    <nav
      class="me-action-list"
      aria-label="我的工具"
    >
      <RouterLink
        v-for="tool in tools"
        :key="tool.to"
        v-tactile
        :to="tool.to"
        :data-tone="tool.tone"
      >
        <span
          class="me-action-list__icon"
          data-tool-icon
          aria-hidden="true"
        >
          <AppIcon :name="tool.icon" />
        </span>
        <span>
          <strong>{{ tool.title }}</strong>
          <small>{{ tool.detail }}</small>
        </span>
        <b aria-hidden="true">›</b>
      </RouterLink>
    </nav>

    <aside class="device-data-note">
      <strong>仅保存在当前设备</strong>
      <p>当前没有账号或云同步。清理浏览器数据、使用无痕模式或更换设备，都可能让内容丢失。</p>
    </aside>
  </section>
</template>
