<template>
  <section
    class="home-view"
    aria-labelledby="home-title"
  >
    <header class="home-hero">
      <p class="eyebrow">
        HAIR DECISIONS · LOCAL FIRST
      </p>
      <h1
        id="home-title"
        class="brand-title"
      >
        咋剪发
      </h1>
      <p class="brand-promise">
        剪前看看，剪时说清，剪后记住
      </p>

      <div
        class="hero-mark"
        aria-hidden="true"
      >
        <span class="hero-mark__type">看<br>清</span>
        <span class="hero-mark__note">BEFORE<br>THE CUT</span>
      </div>
    </header>

    <div
      class="home-actions"
      aria-label="开始使用"
    >
      <RouterLink
        class="action action--primary"
        to="/try"
      >
        <span>准备去剪</span>
        <span aria-hidden="true">↗</span>
      </RouterLink>
      <RouterLink
        class="action action--secondary"
        to="/archive"
      >
        <span>记录这次理发</span>
        <span aria-hidden="true">＋</span>
      </RouterLink>
      <p class="local-note">
        <span
          class="local-note__dot"
          aria-hidden="true"
        />
        <span>
          <span>仅保存在当前设备</span><br>
          <span>清理浏览器数据、使用无痕模式或更换设备，都可能让记录丢失。</span>
        </span>
      </p>
    </div>
  </section>
</template>
