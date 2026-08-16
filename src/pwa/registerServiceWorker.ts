// 仅生产构建注册；失败静默降级，应用照常在线可用。
export const registerServiceWorker = () => {
  if (!import.meta.env.PROD) {
    return
  }
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return
  }
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // 注册失败（隐私模式、旧内核等）：离线指示会如实显示未就绪。
    })
  })
}
