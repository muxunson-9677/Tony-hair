# Apple Light Mobile UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把“咋剪发”改造成用户确认的浅色 Apple 风格移动端产品，并加入即时、可取消、可打断的按压及拖动反馈，同时保持全部本地业务与隐私契约不变。

**Architecture:** 在现有 Vue 3 应用上增加一个纯前端交互基础层：本地 SVG 图标组件负责统一图标，`v-tactile` 指令负责按压/取消/释放，`v-drag-rail` 指令负责横向轨道的跟手与动量。视觉通过两个独立 CSS 文件覆盖现有大样式表，页面只做必要的语义标记与图标接入，不改 Pinia、Dexie、Router、图片处理和归档服务。

**Tech Stack:** Vue 3.5、TypeScript 6、Vue Test Utils/Testing Library、Vitest、Pointer Events、Web Animations API、CSS backdrop-filter、Playwright。

---

## 文件结构

```text
src/ui/AppIcon.vue                     本地 SVG 图标字典与可访问性边界
src/ui/tactile.ts                      v-tactile 按压/取消/释放指令
src/ui/tactile.spec.ts                 指令行为测试
src/ui/dragRail.ts                     v-drag-rail 跟手、边界阻力和动量
src/ui/dragRail.spec.ts                轨道手势与清理测试
src/styles/apple-light-foundations.css 颜色、字体、按钮、表单、玻璃和无障碍回退
src/styles/apple-light-pages.css       首页、发型库、档案、沟通卡、遮罩页面布局
src/main.ts                             注册指令并按顺序导入覆盖样式
src/components/BottomNav.vue            彩色图标导航
src/features/hairstyle-library/...      收藏、筛选、详情动作图标与拖动轨道
src/views/...                           必要语义标记，不改业务调用
e2e/apple-light-ui.spec.ts              移动端视觉、手势、无障碍与隐私验收
```

### Task 1: 交互基础层

**Files:**
- Create: `src/ui/tactile.ts`
- Create: `src/ui/tactile.spec.ts`
- Create: `src/ui/dragRail.ts`
- Create: `src/ui/dragRail.spec.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: 为按压指令写失败测试**

测试必须使用真实 `pointerdown/pointermove/pointerup`，断言：按下立即写入 `data-pressing="true"`；拖离 10px 容差后取消；拖回恢复；松手删除 pressing 并触发一次 release animation；下一次按下会取消未结束动画；unmount 清理监听器。

```ts
const button = document.createElement('button')
const binding = { value: true } as DirectiveBinding<boolean>
tactileDirective.mounted?.(button, binding)

button.dispatchEvent(new PointerEvent('pointerdown', {
  pointerId: 1,
  clientX: 20,
  clientY: 20,
  bubbles: true,
}))
expect(button.dataset.pressing).toBe('true')
```

- [ ] **Step 2: 运行测试并确认 RED**

Run: `npm run test:run -- src/ui/tactile.spec.ts`

Expected: FAIL，因为 `src/ui/tactile.ts` 尚不存在。

- [ ] **Step 3: 实现最小可打断按压状态机**

```ts
const RELEASE_KEYFRAMES: Keyframe[] = [
  { transform: 'scale(0.96)' },
  { transform: 'scale(1.012)', offset: 0.72 },
  { transform: 'scale(1)' },
]

const releaseAnimations = new WeakMap<HTMLElement, Animation>()

const finishPress = (element: HTMLElement, animate: boolean) => {
  delete element.dataset.pressing
  releaseAnimations.get(element)?.cancel()
  if (!animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  releaseAnimations.set(element, element.animate(RELEASE_KEYFRAMES, {
    duration: 260,
    easing: 'cubic-bezier(.2,.8,.2,1)',
  }))
}
```

实现不得调用 `click()`、不得 `preventDefault()` 破坏原生按钮/链接，也不得在 disabled 元素上产生按压态。

- [ ] **Step 4: 为拖动轨道写失败测试**

覆盖：横向移动一比一更新 `scrollLeft`；10px 前不抢占；横向意图确认后 pointer capture；纵向意图不拦截；松手后速度继续；边界使用渐进阻力；reduced motion 不启动动量；unmount 取消 RAF。

- [ ] **Step 5: 实现 `v-drag-rail`**

```ts
export function projectVelocity(velocity: number, decelerationRate = 0.99) {
  return (velocity / 1000) * decelerationRate / (1 - decelerationRate)
}

export function rubberband(overshoot: number, dimension: number, constant = 0.55) {
  return (overshoot * dimension * constant)
    / (dimension + constant * Math.abs(overshoot))
}
```

RAF 每帧只更新 `scrollLeft`，速度低于阈值后结束；`pointercancel` 和 `lostpointercapture` 必须回到稳定状态。

- [ ] **Step 6: 注册指令并验证 GREEN**

```ts
app.directive('tactile', tactileDirective)
app.directive('drag-rail', dragRailDirective)
```

Run: `npm run test:run -- src/ui/tactile.spec.ts src/ui/dragRail.spec.ts`

Expected: PASS。

- [ ] **Step 7: Commit**

```bash
git add src/ui src/main.ts
git commit -m "feat: add tactile mobile interaction primitives"
```

### Task 2: SVG 图标与彩色导航

**Files:**
- Create: `src/ui/AppIcon.vue`
- Create: `src/ui/AppIcon.spec.ts`
- Modify: `src/components/BottomNav.vue`
- Modify: `src/App.spec.ts`

- [ ] **Step 1: 写图标和导航 RED 测试**

断言四个导航项仍是原路由和原标签，但不再渲染 `01/02/03/04`；每项包含隐藏装饰 SVG；当前项保留 `aria-current="page"`；品牌 Logo 仍为空 alt 且邻接可见“咋剪发”。

- [ ] **Step 2: 运行定向测试观察失败**

Run: `npm run test:run -- src/ui/AppIcon.spec.ts src/App.spec.ts`

Expected: FAIL，原因是 `AppIcon` 缺失且导航仍显示数字。

- [ ] **Step 3: 实现本地图标组件**

组件只接受白名单名称：

```ts
type AppIconName =
  | 'home' | 'styles' | 'archive' | 'me'
  | 'search' | 'heart' | 'heart-filled'
  | 'filter' | 'upload' | 'eye' | 'back'
  | 'scissors' | 'photo' | 'edit' | 'trash'
  | 'check' | 'warning' | 'folder' | 'print'
```

默认 `aria-hidden="true"`，不允许用图标替代按钮的可访问名称。

- [ ] **Step 4: 更新 BottomNav**

```vue
<span class="bottom-nav__icon-well" aria-hidden="true">
  <AppIcon :name="item.icon" />
</span>
<span class="bottom-nav__label">{{ item.label }}</span>
```

四项分别设置 `data-tone="coral|blue|purple|mint"`，链接添加 `v-tactile`。

- [ ] **Step 5: 运行测试并提交**

Run: `npm run test:run -- src/ui/AppIcon.spec.ts src/App.spec.ts`

Expected: PASS。

```bash
git add src/ui/AppIcon.vue src/ui/AppIcon.spec.ts src/components/BottomNav.vue src/App.spec.ts
git commit -m "feat: add colorful icon navigation"
```

### Task 3: Apple 浅色基础样式

**Files:**
- Create: `src/styles/apple-light-foundations.css`
- Modify: `src/main.ts`
- Modify: `src/styles.css`
- Modify: `docs/design/visual-thesis.md`

- [ ] **Step 1: 写样式契约失败测试**

在 `src/App.spec.ts` 增加结构断言：页面外壳暴露 `data-visual-system="apple-light"`；移动导航在 main 后、桌面导航在 main 前；所有路由仍复用单一 `main#main-content` 与焦点逻辑。

- [ ] **Step 2: 添加视觉变量与基础控件**

```css
:root {
  --app-bg: #f6f7f9;
  --surface: #fff;
  --ink: #17181b;
  --muted: #686e77;
  --system-blue: #3478f6;
  --favorite-coral: #f06572;
  --archive-purple: #8768ea;
  --data-mint: #38ae7c;
  --control-min: 2.75rem;
}

[data-tactile][data-pressing="true"] {
  transform: scale(var(--press-scale, .96));
  filter: saturate(1.08);
}
```

统一 body、shell、焦点、按钮、输入框、错误、空状态、实色内容面与白色玻璃控制面；不覆盖打印沟通卡的白底高对比行为。

- [ ] **Step 3: 实现三类辅助模式**

```css
@media (prefers-reduced-motion: reduce) {
  [data-tactile] { transition: none !important; }
}

@media (prefers-reduced-transparency: reduce) {
  .bottom-nav, .style-action-dock, .reference-action-dock {
    background: #fff;
    backdrop-filter: none;
  }
}

@media (prefers-contrast: more) {
  :focus-visible { outline: 3px solid #005fcc; outline-offset: 3px; }
}
```

- [ ] **Step 4: 更新视觉论点并验证**

将旧“暖象牙+焦糖棕”改为已确认的“白色 iOS 图库骨架 + 多彩图标 + 局部清透玻璃”，同时保留无社区、照片优先和玻璃边界。

Run: `npm run test:run -- src/App.spec.ts && npm run typecheck && npm run lint`

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/styles/apple-light-foundations.css src/styles.css src/main.ts src/App.vue src/App.spec.ts docs/design/visual-thesis.md
git commit -m "style: establish apple light visual system"
```

### Task 4: 首页与“我的”

**Files:**
- Create: `src/styles/apple-light-pages.css`
- Modify: `src/views/HomeView.vue`
- Modify: `src/views/MeView.vue`
- Modify: `src/App.spec.ts`

- [ ] **Step 1: 写页面语义 RED 测试**

首页必须保留唯一 `resolveHomeAction` 主链接；主视觉仍按“最新记录→有效收藏→精选回退”选择；新增图标按钮不得生成第二个主 CTA。“我的”仍只有头发档案、理发档案、照片遮罩和本机数据说明，不新增账号/社区/商家入口。

- [ ] **Step 2: 改造首页结构**

为品牌区、主视觉、状态说明和主动作增加稳定类名；搜索/收藏等辅助动作使用 `AppIcon + v-tactile`；不修改 store load、Object URL 创建/回收和路由目的地。

- [ ] **Step 3: 改造“我的”结构**

每行使用彩色图标井、标题、说明与右向指示；本机数据说明保持实色，不伪装云账号。

- [ ] **Step 4: 添加移动/桌面页面样式并测试**

390px 首页主 CTA 必须在首屏；1440px 使用左右编辑布局；“我的”保持短而可执行。

Run: `npm run test:run -- src/App.spec.ts src/features/home/*.spec.ts`

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/styles/apple-light-pages.css src/views/HomeView.vue src/views/MeView.vue src/App.spec.ts
git commit -m "style: redesign home and personal hub"
```

### Task 5: 发型库、筛选、收藏与详情

**Files:**
- Modify: `src/features/hairstyle-library/components/HairstyleTile.vue`
- Modify: `src/features/hairstyle-library/components/StyleFilterBar.vue`
- Modify: `src/features/hairstyle-library/components/StyleActionDock.vue`
- Modify: `src/views/HairstyleLibraryView.vue`
- Modify: `src/views/HairstyleDetailView.vue`
- Modify: `src/views/HairstyleReferenceDetailView.vue`
- Modify: `src/views/HairstyleReferenceFormView.vue`
- Modify: `src/views/HairstyleShowView.vue`
- Modify: `src/features/hairstyle-library/LibraryRoutes.spec.ts`
- Modify: `src/styles/apple-light-pages.css`

- [ ] **Step 1: 写交互与语义 RED 测试**

断言收藏按钮使用心形 `AppIcon`、`aria-pressed` 不变；筛选轨道存在 `data-drag-rail`；搜索/筛选/返回/上传/展示动作都有文字可访问名称；首次存储载入失败仍禁用收藏并可重试。

- [ ] **Step 2: 接入彩色动作与拖动轨道**

```vue
<div v-drag-rail class="style-filter-bar__chips" data-drag-rail>
  <!-- 原筛选 input 与 label 保持 -->
</div>
```

收藏、返回、搜索与详情操作加 `v-tactile`，但不改变 click handler、disabled、busy 与路由守卫。

- [ ] **Step 3: 重做照片流与详情操作层**

照片卡主体保持实体、图片优先；收藏按钮是白色玻璃小按钮；详情操作坞使用白色玻璃，正文、风险和理发指南保持实体白色与分隔线。

- [ ] **Step 4: 验证存储与竞态回归**

Run: `npm run test:run -- src/features/hairstyle-library/LibraryRoutes.spec.ts src/features/hairstyle-library/libraryStore.spec.ts src/features/hairstyle-library/HairstyleLibraryRepository.spec.ts`

Expected: PASS，且 Blob、Object URL、保存锁、路由竞态测试无变化。

- [ ] **Step 5: Commit**

```bash
git add src/features/hairstyle-library src/views/HairstyleLibraryView.vue src/views/HairstyleDetailView.vue src/views/HairstyleReferenceDetailView.vue src/views/HairstyleReferenceFormView.vue src/views/HairstyleShowView.vue src/styles/apple-light-pages.css
git commit -m "style: redesign hairstyle discovery flow"
```

### Task 6: 档案、记录、沟通卡与隐私工具

**Files:**
- Modify: `src/views/ArchiveView.vue`
- Modify: `src/views/ArchiveProfileView.vue`
- Modify: `src/views/ArchivePlanFormView.vue`
- Modify: `src/views/ArchivePlanDetailView.vue`
- Modify: `src/views/ArchiveRecordFormView.vue`
- Modify: `src/views/ArchiveRecordDetailView.vue`
- Modify: `src/views/ArchiveBriefView.vue`
- Modify: `src/views/PrivacyMaskView.vue`
- Modify: `src/features/privacy/MaskEditor.vue`
- Modify: `src/features/archive/ArchiveRoutes.spec.ts`
- Modify: `src/views/PrivacyMaskView.spec.ts`
- Modify: `src/styles/apple-light-pages.css`

- [ ] **Step 1: 写业务保持 RED 测试**

为新图标/状态类增加结构断言，同时保留原保存、删除、图片处理、沟通卡导出、Mask 自动/手动回退与多人拦截断言。危险操作必须仍有可见文字，不能只显示红色垃圾桶图标。

- [ ] **Step 2: 添加必要图标与 tactile 标记**

只修改模板表现层：标题图标、主按钮、返回、编辑、上传、打印、删除和遮罩工具；不修改 store/repository 调用和字段。

- [ ] **Step 3: 添加实体白色表单和工具样式**

输入区、沟通卡和遮罩画布不透明；固定操作区可使用白色玻璃；错误和保存状态保持可见；打印媒体规则不受覆盖。

- [ ] **Step 4: 运行归档与隐私矩阵**

Run: `npm run test:run -- src/features/archive src/views/ArchiveRoutes.spec.ts src/views/PrivacyMaskView.spec.ts src/features/privacy`

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/views src/features/privacy/MaskEditor.vue src/features/archive/ArchiveRoutes.spec.ts src/styles/apple-light-pages.css
git commit -m "style: apply apple light system to archive tools"
```

### Task 7: 真实浏览器视觉、手势与无障碍验收

**Files:**
- Create: `e2e/apple-light-ui.spec.ts`
- Modify: `e2e/navigation.spec.ts`

- [ ] **Step 1: 写 E2E RED**

覆盖：

- 390×844 首页、精选、详情、私人参考、档案、沟通卡、遮罩；
- 360×800 与 430×932 无横向溢出和底栏遮挡；
- 1440×900 真实宽屏；
- navigation 图标没有数字序号与 emoji；
- pointerdown 同帧出现 pressing；拖离取消、拖回恢复；第二次按下能打断 release；
- 筛选轨道水平拖动、松手继续、纵向意图不拦截；
- reduced motion、reduced transparency、high contrast 与 200% 字体；
- 触控目标 44×44px、焦点和控件边界对比；
- 运行时零外域请求、零 `/api/`、零 WebSocket，敏感图片字节不进入请求。

- [ ] **Step 2: 运行新 E2E 并确认 RED**

Run: `$env:PLAYWRIGHT_PORT='4321'; npm run test:e2e -- e2e/apple-light-ui.spec.ts`

Expected: 在新视觉/交互断言处失败，而不是端口、测试夹具或图片解码失败。

- [ ] **Step 3: 只修复 E2E 暴露的真实问题**

不为截图硬编码 sleep。等待字体、图片 decode、路由 transition class 消失和 `opacity=1` 后截图。每个修复先保留失败证据，再做最小实现。

- [ ] **Step 4: 运行全量 Playwright**

Run: `$env:PLAYWRIGHT_PORT='4321'; npm run test:e2e`

Expected: 全部通过；测试结束后 4321 端口释放，不触碰 4173。

- [ ] **Step 5: Commit**

```bash
git add e2e/apple-light-ui.spec.ts e2e/navigation.spec.ts
git commit -m "test: verify apple light mobile experience"
```

### Task 8: 最终验证与本地交付

**Files:**
- Modify only if verification exposes a task-scoped defect.

- [ ] **Step 1: 使用精确 Node/npm fresh install**

使用 Node 24.19.0 与 npm 11.17.0，执行 `npm ci`，确认 audit 不引入高危漏洞。

- [ ] **Step 2: 运行完整质量门禁**

```text
npm run verify:mediapipe
npm run lint
npm run typecheck
npm run test:run
npm run build
npm audit --audit-level=high
git diff --check
```

Expected: 全部 exit 0；既有 Neon integration 无测试数据库时继续明确 skip，不把 skip 声称为真实 Neon 通过。

- [ ] **Step 3: 人工视觉复核**

逐张查看 390×844 与 1440×900 的关键页面截图，确认：白色基调、多彩图标、局部玻璃、正文清晰、照片无裁切错误、底栏无覆盖、动画截图不是中间态。

- [ ] **Step 4: 启动独立本地预览**

先重新执行无 E2E 环境变量的生产 build，再用 Node 24 在未占用端口启动 `vite preview --host 127.0.0.1 --port 4317 --strictPort`；若端口已被本任务旧进程占用，确认进程身份后替换，不触碰 4173。

- [ ] **Step 5: 最终状态核对**

确认分支、HEAD、提交列表、工作树、监听端口和精确进程；只报告真实通过项与仍未完成项。

---

## Self-review

- 规格中的白色基调、多彩图标、局部玻璃、按下/拖动/松手、可打断、三类辅助模式均有对应任务；
- 所有现有本地功能与隐私边界都通过“模板表现层不改业务调用”和全量回归保护；
- 不新增 UI 框架、社区、账号、云服务或后端；
- 计划中没有占位语或未定义接口；
- `tactileDirective`、`dragRailDirective`、`AppIcon` 的命名在全部任务中一致。
