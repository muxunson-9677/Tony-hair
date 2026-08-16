<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'

import { defaultArchiveDb } from '../features/archive/archiveStore'
import { exportLocalBackup, importLocalBackup } from '../features/archive/localBackup'
import AppIcon from '../ui/AppIcon.vue'
import { tactileDirective as vTactile } from '../ui/tactile'

const tools = [
  { to: '/archive/profile', icon: 'me', tone: 'coral', title: '头发档案', detail: '发质、发量、打理时间与明确偏好' },
  { to: '/archive', icon: 'archive', tone: 'purple', title: '理发档案', detail: '下次剪法、给理发师看的话和剪后照片' },
  { to: '/privacy/mask', icon: 'eye', tone: 'blue', title: '照片遮罩', detail: '本机定位与手动确认，导出新的单层图片' },
] as const

const dataStatus = ref('')
const dataStatusTone = ref<'success' | 'error' | null>(null)
const busy = ref(false)
let downloadUrl = ''

const releaseDownload = () => {
  if (!downloadUrl) return
  URL.revokeObjectURL(downloadUrl)
  downloadUrl = ''
}

const exportData = async () => {
  if (busy.value) return
  busy.value = true
  dataStatus.value = ''
  dataStatusTone.value = null
  try {
    const content = await exportLocalBackup(defaultArchiveDb)
    releaseDownload()
    downloadUrl = URL.createObjectURL(new Blob([content], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = downloadUrl
    link.download = `Tony宝-本机备份-${new Date().toISOString().slice(0, 10)}.json`
    document.body.append(link)
    link.click()
    link.remove()
    dataStatus.value = '备份文件已生成。它包含本机照片和档案，请妥善保管。'
    dataStatusTone.value = 'success'
  } catch {
    dataStatus.value = '备份生成失败，本机数据没有改变。请稍后重试。'
    dataStatusTone.value = 'error'
  } finally {
    busy.value = false
  }
}

const importData = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || busy.value) return
  if (!window.confirm('恢复备份会替换这台设备当前的档案、照片、收藏和私人参考。确定继续吗？')) return
  busy.value = true
  dataStatus.value = ''
  dataStatusTone.value = null
  try {
    await importLocalBackup(defaultArchiveDb, await file.text())
    dataStatus.value = '备份已恢复。返回档案或找发型即可查看。'
    dataStatusTone.value = 'success'
  } catch (caught) {
    dataStatus.value = caught instanceof Error
      ? caught.message
      : '恢复失败，本机原有数据没有改变。'
    dataStatusTone.value = 'error'
  } finally {
    busy.value = false
  }
}

onBeforeUnmount(releaseDownload)
</script>

<template>
  <section
    class="me-view"
    aria-labelledby="me-title"
  >
    <header class="me-header">
      <p class="eyebrow">
        你的本机内容 · 不创建账号
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
      <p>当前没有账号或云同步。可以导出一个包含照片、档案、收藏与私人参考的本机备份文件。</p>
      <div class="device-data-actions">
        <button
          v-tactile
          type="button"
          :disabled="busy"
          @click="exportData"
        >
          导出本机备份
        </button>
        <label v-tactile>
          <span>恢复本机备份</span>
          <input
            type="file"
            accept="application/json,.json"
            :disabled="busy"
            @change="importData"
          >
        </label>
      </div>
      <p
        v-if="dataStatus"
        class="device-data-status"
        :class="{ 'device-data-status--error': dataStatusTone === 'error' }"
        :role="dataStatusTone === 'error' ? 'alert' : 'status'"
      >
        {{ dataStatus }}
      </p>
    </aside>
  </section>
</template>
