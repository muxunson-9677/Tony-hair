import { onBeforeUnmount, onMounted, readonly, ref } from 'vue'

export function useLocalDayClock() {
  const currentTime = ref(new Date())
  let rolloverTimer: number | undefined

  const refreshAtNextLocalDay = () => {
    const now = new Date()
    const nextLocalDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    currentTime.value = now
    window.clearTimeout(rolloverTimer)
    rolloverTimer = window.setTimeout(
      refreshAtNextLocalDay,
      Math.max(1, nextLocalDay.getTime() - now.getTime() + 50),
    )
  }

  const refreshWhenVisible = () => {
    if (document.visibilityState === 'visible') {
      refreshAtNextLocalDay()
    }
  }

  onMounted(() => {
    refreshAtNextLocalDay()
    document.addEventListener('visibilitychange', refreshWhenVisible)
  })

  onBeforeUnmount(() => {
    window.clearTimeout(rolloverTimer)
    document.removeEventListener('visibilitychange', refreshWhenVisible)
  })

  return readonly(currentTime)
}
