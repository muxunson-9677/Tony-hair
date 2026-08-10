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
      <RouterLink to="/archive/profile">
        <span class="me-action-list__index">01</span>
        <span>
          <strong>头发档案</strong>
          <small>发质、发量、打理时间与明确偏好</small>
        </span>
        <b aria-hidden="true">↗</b>
      </RouterLink>
      <RouterLink to="/archive">
        <span class="me-action-list__index">02</span>
        <span>
          <strong>理发档案</strong>
          <small>计划、沟通卡、剪后记录与复刻依据</small>
        </span>
        <b aria-hidden="true">↗</b>
      </RouterLink>
      <RouterLink to="/privacy/mask">
        <span class="me-action-list__index">03</span>
        <span>
          <strong>照片遮罩</strong>
          <small>本机定位与手动确认，导出新的单层图片</small>
        </span>
        <b aria-hidden="true">↗</b>
      </RouterLink>
    </nav>

    <aside class="device-data-note">
      <strong>仅保存在当前设备</strong>
      <p>当前没有账号或云同步。清理浏览器数据、使用无痕模式或更换设备，都可能让内容丢失。</p>
    </aside>
  </section>
</template>
