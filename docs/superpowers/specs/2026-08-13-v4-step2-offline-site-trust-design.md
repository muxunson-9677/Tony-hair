# V4 第②步设计：理发现场信任（离线保证 + 现场体验强化）

> 日期：2026-08-13 · 分支 `v4-step2-offline-trust`
> 上游依据：《咋剪发_V4_全程执行总纲》第 2 节；V4 第 4 节；V3/V4 反模式清单。
> 定位：让「到店那 10 秒」绝对可靠——断网能打开、屏幕不熄、理发师一眼看懂。

## 1. 现状审计

- **构建与测试环境**：Playwright e2e 跑在 `vite build && vite preview`（生产构建）上，Service Worker 可以真实注册与测试；`baseURL` 为 `http://127.0.0.1:<port>`，属安全上下文。
- **CSP**（`src/security/csp.ts`）：`worker-src 'self' blob:`、`default-src 'self'` 已允许同源 SW 与 manifest，无需放宽。
- **现场页已有雏形**：`/archive/plans/:id/brief/show`（`ArchiveBriefView` 的 barber 模式）已具备：目标主图、最在意/绝对不要、局部细节折叠（`details` 默认收起）、「保存图片备用」导出。
- **Wake Lock 先例**：`HairstyleShowView.vue` 内联实现了手动开关的 wake lock，无降级提示、不可复用。
- **数据层天然离线**：Tony卡文本、候选图快照全部是 IndexedDB 内的记录与 Blob，断网可读；缺的是**应用外壳**（HTML/JS/CSS/品牌图）离线可加载。
- **无 manifest、无 SW**（第①步刻意未建）。
- **e2e 相容性**：现有用例只断言「不该出现的请求不出现」（投票/上传），SW 只新增同源静态资源读取，不冲突。

## 2. 范围 / 不做

### 做（范围 A：离线保证）

1. `public/manifest.webmanifest` + `index.html` 关联（名称 Tony宝、standalone、既有 scissors 图标）；
2. Service Worker（TypeScript 源码经 vite 独立入口构建为根路径 `/sw.js`）：
   - install：预缓存应用外壳（`/`、构建产物 `assets/*`、`brand/*`、`demo/*`、manifest），**排除 `mediapipe/*` 大文件**（遮罩功能到店用不上，>10MB 不该塞进现场缓存）；
   - activate：删除非当前版本缓存（`CACHE_VERSION` 版本化），**不 `skipWaiting`、不 `clients.claim`**——新版本「下次打开生效」，绝不中断现场使用，也避免运行中的旧页面半路丢缓存；
   - fetch：导航请求网络优先、断网回退缓存的 `/`；同源静态资源缓存优先、未中缓存回源并回填；`mediapipe/*` 与跨域请求直通不缓存；
3. 仅生产构建注册（`import.meta.env.PROD`），注册失败静默降级（应用照常在线可用）；
4. **离线就绪指示**（Tony卡编辑页 + 现场页）：逐项真实探测——浏览器支持（`serviceWorker`+`caches`）、SW 激活、缓存中确实命中 `/` 与当前页面脚本——全部通过且Tony卡已保存才显示「✓ 已准备好，到店断网也能打开」；任何一项不满足显示诚实原因（不支持/仍在准备,刷新一次后就绪）；**不虚报**；
5. 微信内置浏览器（UA 含 `MicroMessenger`）：离线不可靠，指示条降级为强提示「请先导出 PNG 存进相册作兜底」；
6. Tony卡保存成功时请求 `navigator.storage.persist()`，降低系统回收 IndexedDB 的概率（失败无感忽略）。

### 做（范围 B：现场体验强化）

1. **Wake Lock 组合式函数** `useScreenWakeLock`：现场页进入即自动申请、`visibilitychange` 回前台自动重申请、离开释放；不支持时返回 `supported=false`,现场页显示降级提示「这台设备不能自动常亮，建议调长自动锁屏时间」；`HairstyleShowView` 重构复用同一实现（行为不变：手动开关）；
2. **三层阅读结构硬约束**：纯函数 `buildBarberLayers`（`src/features/archive/barberLayers.ts`）：
   - 第 1 层（正面）：≤1 张主图 + ≤7 条信息（计划标题、目标方案、备选方案、请现场确认提示 + 首要的最在意/绝对不要）；
   - 第 2 层：最在意 ≤3 + 绝对不要 ≤3，一屏收完；
   - 超量内容（局部六项细节、溢出条目）一律折叠进第 3 层 `details`，**折叠而不是溢出正面**；
   - 现场页模板改为消费该函数输出，组件测试塞入超量信息验证收纳；
3. **主图展示台组件** `BriefStage.vue`：props 接收状态数组（`id/label/image/available`），任何时刻只渲染一张大图；≥2 个可用状态时出现分段控件切换；当前生产环境只传入「参考原图」一个状态（无分段控件，AI 效果图/日常状态**不实现、不显示**，仅架构预留状态位）；
4. **理发店环境样式**：现场页超大字号高对比（第 1、2 层专用字阶），横屏时图左信息右两栏布局；第 1、2 层全程无须触摸即可读完；展示复杂度默认最简档（第 3 层默认收起,即现状,补测试锁定）。

### 不做（总纲 2.4 + 决策记录）

- 分享类导出增强（第③步）；任何 AI 状态展示；登录、统计；
- 不引入 `vite-plugin-pwa` 等重依赖——SW 需求面窄（预缓存+两条 fetch 策略），手写 ~100 行可控且可单测，避免第三方缓存策略黑盒违反「不卡死旧版」红线；
- 不预缓存 `mediapipe/*`；不做后台同步、推送、周期更新等 PWA 能力；
- 不改 BarberBrief 数据模型（零迁移：本步数据层零改动）。

## 3. 方案选择

| 决策点 | 选择 | 备选与否决理由 |
| --- | --- | --- |
| SW 来源 | `src/pwa/sw.ts` 独立 rollup 入口,产出根路径 `/sw.js`,策略函数拆到 `src/pwa/swCore.ts` 可单测 | `public/sw.js` 手写 JS：无法 import、逻辑不可单测；`vite-plugin-pwa`：黑盒 workbox,升级策略不可控 |
| 预缓存清单 | vite 内联小插件在 `generateBundle` 阶段把产物文件名注入 `sw.js` 占位符 | 运行时逐个缓存：首访不完整,「已准备好」判定复杂且易虚报 |
| 更新策略 | 版本化缓存名 + activate 清旧 + 不 skipWaiting/claim,导航网络优先 | skipWaiting：运行中页面懒加载旧 hash 资源可能 404,现场风险 |
| 就绪判定 | 页面内真实探测 cache.match('/') + 当前脚本 + SW active | 只看注册成功：注册≠缓存完成,会虚报 |
| Wake Lock | 组合式函数 + 现场页自动申请 + 可见性重申请 | 沿用手动按钮：用户到店忘点,违背「绝对可靠」定位 |
| 三层约束 | 纯函数产出分层结构,模板消费,超量折叠 | 纯 CSS 截断：信息静默丢失,违反诚实原则 |

## 4. 数据设计

- **IndexedDB：零改动**。Tony卡、候选图快照沿用现状。
- **CacheStorage**：缓存名 `tonybao-shell-<CACHE_VERSION>`；`CACHE_VERSION` 常量置于 `swCore.ts`,策略变更时手动递增；hash 资源天然自版本化,导航网络优先保证 HTML 常新。
- **localStorage/内存**：无新增持久化偏好（展示复杂度=details 开合,无需记忆）。

## 5. 交互设计

### 5.1 离线就绪指示（`OfflineReadinessNote.vue`）

- 位置：Tony卡编辑页「到店打开」链接旁 + 现场页顶部工具条下方,每屏一条,不用 Tony 人格（状态说明非记忆/反馈场景）。
- 状态文案：
  - 就绪：`✓ 已准备好，到店断网也能打开`；
  - 准备中：`离线缓存正在准备，联网刷新一次后就绪`；
  - 不支持：`这个浏览器不支持离线缓存，建议导出 PNG 备用`；
  - 微信内置：`微信内浏览器离线不可靠，请先导出 PNG 存进相册`（优先级最高,覆盖其余状态）。
- 微信态与不支持态下,紧邻放「导出 PNG」按钮（复用现有导出）。

### 5.2 现场页（barber 模式）结构

1. 顶部工具条（现状保留：完成 / 保存图片备用）+ 就绪指示；
2. 第 1 层：`BriefStage` 主图 + 正面信息（≤7 条,由 `buildBarberLayers` 保证）；
3. 第 2 层：最在意 3 + 绝对不要 3,大字高对比,一屏收完；
4. 第 3 层：`details` 收起「顶部/刘海/两侧/鬓角/后脑/整体 + 溢出条目」；
5. Wake Lock：进入自动申请,页面显示「屏幕保持常亮中」或降级提示;离开页面释放；
6. 横屏：`@media (orientation: landscape)` 图左文右。

### 5.3 展示台 `BriefStage.vue`

- props：`states: { id: string; label: string; imageSource?: string; imageAlt: string; available: boolean }[]`、`modelValue: string`（当前状态 id）；
- 只渲染 `available` 状态;可用状态 ≥2 时渲染分段控件（`role="tablist"`）,否则不渲染控件;任何时刻 DOM 内只有一张 `<img>`；
- 无可用图片时显示占位文本（沿用「目标候选暂无可显示图片」）。

## 6. 错误与边界

- SW 注册失败 / 非安全上下文：应用照常运行,就绪指示显示「不支持」态,不抛错;
- 缓存探测超时（caches API 挂起）：1.5s 超时按「准备中」处理,不虚报就绪;
- Wake Lock 申请被拒（省电模式等）：按不支持降级提示;
- 断网时导航到未缓存的深链：SW 回退缓存的 `/`,SPA 路由接管后从 IndexedDB 渲染;计划不存在时沿用现有「没有找到这个计划」空态;
- 旧版本页面在新 SW 等待期间继续用旧缓存,不会混用;
- `storage.persist()` 拒绝：忽略,不打扰用户。

## 7. 测试计划

### 单元 / 组件（Vitest）

- `swCore.spec.ts`：缓存名版本化;activate 清理规则（只删本前缀旧版本,不动他人缓存）;fetch 策略分类（导航→网络优先回退 `/`;`assets/brand/demo`→缓存优先;`mediapipe/*`、跨域、非 GET→直通）;网络优先在断网异常时回缓存;
- `offlineReadiness.spec.ts`：支持/不支持、SW 未激活、缓存未命中、全部命中、探测超时五态;微信 UA 判定;
- `useScreenWakeLock.spec.ts`：支持→自动申请与释放、visibilitychange 重申请;不支持→`supported=false`;申请抛错→降级;
- `barberLayers.spec.ts`：常规内容分层正确;塞入超量（10 条在意/10 条不要/超长局部细节）→ 正面仍 ≤1 图 + ≤7 条,第 2 层 ≤3+3,溢出全部进第 3 层,零丢失（三层并集=输入全集）;
- `BriefStage.spec.ts`：单状态无分段控件;多状态切换后仍只有一张 img;不可用状态不出现;
- 现场页组件测试：第 3 层默认收起;降级提示条件渲染。

### e2e（Playwright,`e2e/offline-site.spec.ts`）

1. **断网重开现场页**：建档→计划→保存Tony卡→等待就绪指示变「✓ 已准备好」→`context.setOffline(true)`→重载现场页→主图、最在意、绝对不要完整可见→390px 截图;再验证断网直开深链 URL;
2. **就绪指示诚实性**：`addInitScript` 删除 `navigator.serviceWorker` → 指示显示「不支持」而非虚报;
3. **微信兜底**：UA 覆写为 MicroMessenger → 强提示 + 导出按钮可见;
4. **Wake Lock**：现场页进入后显示「屏幕保持常亮中」（权限授予）;`addInitScript` 删除 `navigator.wakeLock` → 显示降级提示;
5. **横屏可读**：viewport 844×390 截图,断言两栏布局关键元素可见;
6. 既有全部 e2e 回归（SW 注册后不得破坏任何现有用例）。

### 留给产品负责人（报告列为待办,不宣称完成）

- Android Chrome / iOS Safari / 微信内置浏览器真机断网复验。

## 8. 实施分解（TDD 顺序）

1. `swCore.ts` 纯策略 + 测试;
2. `sw.ts` 入口 + vite 双入口与预缓存清单注入插件 + `manifest.webmanifest` + `index.html` 关联 + 注册模块;构建产物验证（`dist/sw.js` 存在且含清单）;
3. `offlineReadiness.ts` + 微信判定 + 测试;
4. `useScreenWakeLock` + 测试;`HairstyleShowView` 重构复用;
5. `barberLayers.ts` + `BriefStage.vue` + 测试;
6. 现场页/编辑页接入（就绪指示、自动常亮、三层结构、横屏样式）+ 组件测试;
7. e2e `offline-site.spec.ts`;全量回归 + 截图 + 报告。

## 9. 验收红线自检（总纲 2.3）

| 红线 | 设计覆盖 |
| --- | --- |
| 断网重开现场页 Tony卡完整可见（Playwright） | 测试计划 e2e-1（含深链直开） |
| 缓存版本升级后旧缓存被替换,不卡死旧版 | 版本化缓存名 + activate 清理（单测）;导航网络优先保证 HTML 常新 |
| Wake Lock 生效与降级都有测试 | 单测三态 + e2e-4 两态 |
| 三层约束组件测试（超量折叠不溢出） | `barberLayers.spec` + 现场页组件测试 |
| 展示台单图/切换/多状态预留有测试 | `BriefStage.spec` |
| 离线指示真实反映缓存状态不虚报 | 逐项探测设计 + e2e-2 |
| 真机复验属产品负责人待办 | 报告固定条目,不宣称完成 |

全部红线在设计层有对应方案,无需向产品负责人升级决策;开始实施。
