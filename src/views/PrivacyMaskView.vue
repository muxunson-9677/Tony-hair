<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'

import MaskEditor from '../features/privacy/MaskEditor.vue'
import type { MaskExportResult } from '../features/privacy/types'

const authorized = ref(false)
const downloadStatus = ref('')
const downloadUrl = ref('')
const downloadFilename = ref('')

const releaseDownload = () => {
  if (downloadUrl.value) {
    URL.revokeObjectURL(downloadUrl.value)
    downloadUrl.value = ''
    downloadFilename.value = ''
  }
}

const downloadFlattened = (result: MaskExportResult) => {
  releaseDownload()
  const objectUrl = URL.createObjectURL(result.blob)
  const filename = `咋剪发-隐私遮罩-${new Date().toISOString().slice(0, 10)}.${result.mimeType === 'image/webp' ? 'webp' : 'jpg'}`
  downloadUrl.value = objectUrl
  downloadFilename.value = filename
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = filename
  document.body.append(link)
  try {
    link.click()
  } finally {
    link.remove()
  }
  downloadStatus.value = '已请求下载单层遮罩图。若没有自动保存，可使用下方链接再次下载；原图和编辑图层没有上传。'
}

onBeforeUnmount(releaseDownload)
</script>

<template>
  <section
    class="privacy-mask-view"
    aria-labelledby="privacy-mask-title"
  >
    <header class="privacy-mask-header">
      <RouterLink
        class="back-link"
        to="/me"
      >
        ← 返回我的
      </RouterLink>
      <p class="eyebrow">
        PRIVACY TOOL · LOCAL
      </p>
      <h1 id="privacy-mask-title">
        隐私<br>遮罩
      </h1>
      <p>先在本机遮住想隐藏的区域，再生成一张新的单层图片。</p>
    </header>

    <aside class="privacy-boundary">
      <strong>这是减轻直接露脸压力的工具，不承诺匿名。</strong>
      <p>发型、衣着、背景等仍可能暴露身份，熟人仍可能识别你；自动位置也需要你亲自确认。</p>
    </aside>

    <label class="authorization-check">
      <input
        v-model="authorized"
        type="checkbox"
      >
      <span>我已满 18 岁，照片是本人，或已获得照片本人明确授权。</span>
    </label>

    <MaskEditor
      v-if="authorized"
      @exported="downloadFlattened"
    />
    <p
      v-else
      class="authorization-hold"
    >
      确认后才会显示本地选图入口。
    </p>

    <p
      v-if="downloadStatus"
      class="download-status"
      role="status"
    >
      {{ downloadStatus }}
    </p>
    <a
      v-if="downloadUrl"
      class="download-retry-link"
      :href="downloadUrl"
      :download="downloadFilename"
    >未自动保存？再次下载单层图</a>
  </section>
</template>
