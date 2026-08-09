<template>
  <section
    class="page-view"
    aria-labelledby="me-title"
  >
    <header class="page-header">
      <p class="eyebrow">
        YOUR SPACE · 04
      </p>
      <h1
        id="me-title"
        class="page-title"
      >
        我的
      </h1>
      <p class="page-intro">
        知道哪些信息被保留，也知道它们在哪里。
      </p>
    </header>

    <RouterLink
      class="privacy-tool-link"
      to="/privacy/mask"
    >
      <span>本地隐私工具</span>
      <strong>照片遮罩</strong>
      <p>本机定位、手动确认，导出新的单层图片。</p>
      <b aria-hidden="true">→</b>
    </RouterLink>

    <div class="stage-copy">
      <p class="stage-copy__lead">
        当前没有账号、云同步或远端个人资料。
      </p>
      <p>发型档案只在当前设备；清理浏览器数据后仍可能丢失。</p>
    </div>
  </section>
</template>
