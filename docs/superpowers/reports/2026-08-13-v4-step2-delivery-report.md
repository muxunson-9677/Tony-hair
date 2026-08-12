# V4 第②步交付报告：理发现场信任（离线保证 + 现场体验强化）

> 日期：2026-08-13 · 分支 `v4-step2-offline-trust`
> 设计文档：`docs/superpowers/specs/2026-08-13-v4-step2-offline-site-trust-design.md`

## 1. 改了什么 / 为什么

### 范围 A：离线保证

- **Service Worker**（`src/pwa/sw.ts` → 构建为根路径 `/sw.js`,策略核心 `swCore.ts` 纯函数可单测）：
  - install 预缓存应用外壳：`/`、全部构建产物、`brand/*`、`demo/*`、manifest;构建时由 vite 内联插件把产物清单注入占位符,占位符缺失直接构建失败,杜绝空清单上线;`mediapipe/*`（>10MB,现场用不上）刻意排除;
  - 缓存名版本化 `tonybao-shell-v1`,activate 只清理本前缀旧版本;**不 skipWaiting、不 clients.claim**——新版本下次打开生效,绝不打断现场使用;
  - fetch：导航网络优先（在线永远拿最新 HTML,不会卡死旧版）断网回退缓存外壳;同源静态资源缓存优先;其余直通;
  - 仅生产构建注册,失败静默降级。
- **manifest.webmanifest** + `index.html` 关联（Tony宝、standalone、既有 scissors 图标,第①步刻意未建,本步补上）。
- **离线就绪指示**（`OfflineReadinessNote.vue` + `offlineReadiness.ts`）：逐项真实探测（浏览器支持 → SW 激活 → 缓存实际命中外壳 URL,1.5s 超时按未就绪算）,全部通过才显示「✓ 已准备好，到店断网也能打开」;未就绪显示诚实原因;放在Tony卡编辑页「到店打开」旁与现场页顶部。
- **微信内置浏览器**：UA 检测,指示条变为强提示「请先导出 PNG 存进相册」,紧邻导出按钮。
- **持久存储**：Tony卡保存成功时请求 `navigator.storage.persist()`,降低系统回收 IndexedDB 概率,拒绝静默。

### 范围 B：现场体验强化

- **屏幕常亮**：`useScreenWakeLock` 组合式函数,现场页进入自动申请、回前台自动重申请、离开释放;不支持/被拒时显示「这台设备不能自动常亮，建议先调长自动锁屏时间」;`HairstyleShowView` 重构复用同一实现(行为不变)。
- **三层阅读结构硬约束**：`buildBarberLayers` 纯函数——正面 ≤1 图 + ≤7 条信息,第 2 层最在意 ≤3 + 绝对不要 ≤3,超量条目与局部六项细节全部折叠进第 3 层,三层并集=输入全集(零静默丢失);现场页模板消费该函数输出。
- **主图展示台** `BriefStage.vue`：状态数组驱动,任何时刻只渲染一张大图;≥2 个可用状态才出现分段控件;本步生产只传「参考原图」一个状态,AI 效果图/日常状态仅架构预留、不实现不显示。
- **理发店环境**：现场页第 1、2 层大字号高对比;横屏(landscape)图左信息右两栏;第 3 层默认收起,理发师读第 1、2 层无需触摸。

## 2. 没改什么（刻意）

- 未引入 `vite-plugin-pwa`/workbox（策略黑盒,违反「不卡死旧版」可控性）;
- 无后台同步、推送、周期更新;无任何 AI 状态;无登录/统计;
- IndexedDB 数据层零改动(零迁移);BarberBrief 模型未动;
- 分享导出增强留给第③步。

## 3. 测试证据（2026-08-13 全部新鲜通过）

| 项目 | 结果 |
| --- | --- |
| `npm run test:run` | 72 文件 662 通过 / 2 跳过（新增 37 条） |
| `npm run test:e2e` | 31 通过（新增 `e2e/offline-site.spec.ts` 3 条） |
| `npm run lint` / `typecheck` / `build` | 通过（`dist/sw.js` 含注入清单） |
| `npm run verify:mediapipe` | 7 项通过 |
| `npm audit --audit-level=high` | 0 漏洞 |
| `git diff --check` | 干净 |

### 验收红线对照（总纲 2.3）

- 断网重开现场页：e2e 真实 `context.setOffline(true)` + 重载 + 深链直开,Tony卡主图/最在意/绝对不要完整可见 ✅
- 缓存版本升级旧缓存被替换：`swCore.spec` activate 清理规则(只删本前缀旧版本);导航网络优先保证 HTML 常新 ✅
- Wake Lock 生效与降级：单测 5 条(自动申请/释放/回前台重申请/拒绝降级/手动开关) + e2e 两态 ✅
- 三层约束组件测试：塞入 10 条在意/10 条不要 → 正面 ≤7 条、第 2 层 3+3、溢出全部折叠、零丢失 ✅
- 展示台单图/切换/多状态预留：组件测试 4 条 ✅
- 离线指示不虚报：逐项探测 + e2e 删除 serviceWorker 后显示「不支持」而非虚报 ✅
- **真机断网复验（Android Chrome / iOS Safari / 微信内置）：产品负责人待办,未完成、未宣称完成** ⚠️

## 4. 390px 截图路径（`test-results/` 下）

- 断网现场页(竖屏)：`offline-site-reopens-…/offline-barber-390x844.png`
- 断网现场页(横屏 844×390)：同目录 `offline-barber-landscape-844x390.png`
- 诚实降级(无 SW + 无 WakeLock)：`offline-site-degrades-…/offline-degraded-390x844.png`
- 微信兜底提示：`offline-site-WeChat-…/offline-wechat-390x844.png`

## 5. 已知风险 / 待产品负责人裁决

1. **微信真机行为未验证**：UA 检测与兜底提示已就位,但微信内 SW 实际可用性因版本而异,真机复验是待办。
2. **CACHE_VERSION 手动递增**：hash 资源自版本化 + 导航网络优先已覆盖常规更新;只有缓存策略本身变化时需要手动 bump `swCore.ts` 的版本号(已注释说明)。
3. Playwright 的 Wake Lock 走了确定性注入(浏览器 headless 下原生锁不稳定),原生 API 路径由单测与真机复验覆盖。
4. iOS Safari 对 `storage.persist()` 支持有限,IndexedDB 仍可能在极端存储压力下被回收——导出 PNG 兜底路径因此始终保留。
