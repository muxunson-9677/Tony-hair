<template>
  <section
    class="page-view"
    aria-labelledby="not-found-title"
  >
    <header class="page-header">
      <p class="eyebrow">
        NOT FOUND · 404
      </p>
      <h1
        id="not-found-title"
        class="page-title"
      >
        页面没找到
      </h1>
      <p class="page-intro">
        这个地址暂时没有对应内容。
      </p>
    </header>

    <div class="stage-copy">
      <RouterLink
        class="action action--secondary"
        to="/"
      >
        <span>返回首页</span>
        <span aria-hidden="true">←</span>
      </RouterLink>
    </div>
  </section>
</template>
