<script setup lang="ts">
import { onMounted, ref } from 'vue'

import {
  collectShellUrls,
  describeOfflineReadiness,
  isWeChatBrowser,
  probeOfflineReadiness,
  type OfflineReadinessMessage,
  type OfflineReadinessState,
} from './offlineReadiness'

// 离线就绪状态条：真实探测缓存状态，不虚报「已准备好」。

const props = defineProps<{
  /** 测试注入：跳过真实探测。 */
  probeState?: OfflineReadinessState
  /** 测试注入：覆盖 UA。 */
  userAgent?: string
}>()

const message = ref<OfflineReadinessMessage | null>(null)

onMounted(async () => {
  const userAgent = props.userAgent ?? navigator.userAgent
  const state = props.probeState ?? await probeOfflineReadiness({
    serviceWorkerContainer: 'serviceWorker' in navigator ? navigator.serviceWorker : undefined,
    cacheStorage: typeof caches === 'undefined' ? undefined : { match: (key: string) => caches.match(key) },
    shellUrls: collectShellUrls(document),
  })
  message.value = describeOfflineReadiness(state, isWeChatBrowser(userAgent))
})
</script>

<template>
  <p
    v-if="message"
    :class="['offline-readiness', `offline-readiness--${message.tone}`]"
    role="status"
    data-testid="offline-readiness"
  >
    {{ message.text }}
  </p>
</template>
