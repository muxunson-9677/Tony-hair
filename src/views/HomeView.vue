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

      <RouterLink
        class="home-visual"
        to="/try"
        aria-label="查看短发示例并进入试发型"
      >
        <img
          :src="'/demo/persona-ran-sidepart.webp'"
          alt="AI 生成的虚构成年人物短发造型示例"
          fetchpriority="high"
        >
        <span class="home-visual__index">01 / DEMO</span>
        <span class="home-visual__caption">从一张示例开始，看清短发方向 <b aria-hidden="true">↗</b></span>
      </RouterLink>
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
          <span>当前阶段不创建记录；后续记录仅保存在当前设备</span><br>
          <span>清理浏览器数据、使用无痕模式或更换设备，都可能让记录丢失。</span>
        </span>
      </p>
    </div>
  </section>
</template>
