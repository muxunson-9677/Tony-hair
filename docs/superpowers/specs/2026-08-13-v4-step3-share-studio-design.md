# V4 第③步设计：分享工作室 = 增长引擎

日期：2026-08-13
分支：`v4-step3-share-studio`
上游依据：`咋剪发_V4_全程执行总纲.md` 第 4 节

## 1. 现状审计

- **Tony卡 PNG 导出已存在**（`briefExport.ts`）：声明式布局 + 依赖注入画布 + `canvas.toBlob` 下载，中文换行按字符宽度估算。分享工作室沿用同一套「纯函数布局 → 注入渲染」的架构，但版式独立（3:4 社交规格 vs Tony卡的沟通单）。
- **隐私遮罩全链路已存在**（`src/features/privacy/`）：`MaskEngine` 用本地 MediaPipe worker 检测人脸，产出 `none / single(transform) / multiple / error`；`drawOpaqueMask` 在画布上画不透明遮罩（3 种样式）；多人照片在现有产品里是硬拦截。分享工作室直接复用检测与遮罩绘制，不重写。
- **照片来源**：剪后记录照片（IndexedDB Blob）、候选参考图（Blob 或 demo 路径）、②B 区域打标（`regionMarks` 相对坐标）。
- **品牌**：`config/brand.ts` 有 `PRODUCT_NAME`（Tony宝）等常量。产品负责人**未提供公开落地 URL**，二维码按总纲决议不做，只放文字角标。
- **导出**：现有 briefExport 只有下载。分享工作室需要 `navigator.share({ files })` 优先 + 下载兜底。

## 2. 范围 / 不做

做（五类图，全部本地 Canvas 生成，主规格 3:4 = 1080×1440）：

1. **剪前/剪后对比图**：两图并排 + 发型名 + 日期 + 满意度；
2. **本次复盘图**：剪后图 + 结果结论（就这样/有一点要改/别再这样）+ 对应清单（标准发型/调整/避雷 ≤3 条）；
3. **翻车避雷图**（重点）：剪后图 + ②B 区域打标圆点 + 图例 + 避雷规则，标题自嘲向（「这次翻车了，帮你避雷」）；
4. **Tony卡分享图**：参考图 + 效果位双联版式。**效果位规则：显示参考图副本并标注「参考原图」，或（无图时）显示「效果图位·期待剪后」占位文字——绝不伪造 AI 效果**；下方最在意/绝对不要各 ≤3；
5. **「帮我选」求助图**：方案 A vs 方案 B 双图 + 名称 + 「你觉得哪个适合我？」；仅生成图片文件，**站内不出现任何投票交互**。

技术与入口：

- 隐私策略：每张进入分享图的**人像照片**先过 `MaskEngine`——单人自动套用现有遮罩样式（editorial_bar）；多人硬拦截（该图类型不可用并说明）；检测失败硬拦截（诚实报错，不提供绕过）；未检出人脸原样使用（如纯后脑照片）。预制示例图（demo 素材）非用户人像，不检测。
- 品牌角标「Tony宝 · 本地生成」右下角固定；无二维码。
- 导出：`navigator.share({ files })` 可用则走系统分享，不可用或失败兜底为 PNG 下载。
- 入口三处：剪后保存成功提示内、记录详情、Tony卡详情。首页不加入口。
- 路由：`/archive/share?record=<id>` 与 `/archive/share?plan=<id>`，按上下文列出可用图类型。

不做：

- 1:1 / 9:16 规格（后置）；
- 二维码（无公开 URL）；追踪参数；任何上传；
- 站内投票/社区任何形式的复活；
- AI 效果图；
- 遮罩样式选择器（分享图固定用 editorial_bar，减少决策；隐私工具里的选择不受影响）。

## 3. 方案选择

- **架构**：`src/features/share/`
  - `shareCards.ts`（纯函数）：五个 `build*Card(content) → ShareCardLayout`；`ShareCardLayout` 是声明式绘制清单（背景/图片槽/遮罩槽/文本行/圆点/角标），坐标全部写死在 1080×1440 网格上；文本超长走统一 `truncateShareText(text, maxChars)`（截断加 …）。**布局纯函数可单测：角标恒在、无二维码、超长必截断、条目数上限。**
  - `shareRender.ts`：把 `ShareCardLayout` 画到画布（依赖注入 `createCanvas`/`loadImage`），图片槽 cover 裁切，遮罩槽调 `drawOpaqueMask`，输出 PNG Blob。
  - `sharePhotos.ts`：照片准入策略——`resolveSharePhoto(blob, engine) → { status: 'ready', maskTransform? } | { status: 'blocked_multiple' } | { status: 'blocked_error' }`；对同一照片结果缓存，避免重复推理。
  - `shareExport.ts`：`exportShareCard(blob, filename, deps)`——`navigator.canShare({files})` → share；异常/不可用 → `URL.createObjectURL` + a[download]。
  - `ShareStudioView.vue`：读取 record/plan 上下文 → 列出可用图类型（数据不足的类型显示原因而非空白）→ 预览（生成的 PNG 以 `<img>` 展示，**屏显预览 = 导出成品同一张位图**，天然满足 V4 4.4）→ 「分享/保存图片」。
- **中文排版**：与 briefExport 同思路按字符估宽（中文=1、ASCII=0.55），行数上限 + 字符截断双保险；长店名 ≤ 18 字符、清单行 ≤ 22 字符、标题 ≤ 16 字符，超出截断加 …。
- **性能**：单画布 1080×1440、无滤镜无阴影渐变叠加、照片先 `createImageBitmap` 解码；4× CPU 节流 Playwright 采样 <3s 为验收代理指标。人脸检测只在含用户人像照片的类型首次生成时发生，且缓存。
- **不发一个字节**：全流程只用 Blob/ObjectURL；e2e 全程监听网络请求断言无跨域请求、无 POST。

## 4. 数据设计

- **零新表零迁移**：分享工作室是纯读消费者（records/photos/plans/candidates/briefs/regionMarks）。
- 不落任何分享历史（V1 刻意不记录，避免变相统计）。

## 5. 交互设计

- 分享工作室页（390px 优先）：顶部说明「图片在本机生成，不会上传」；类型卡片纵向列表，每张：预览图（生成后）/ 生成按钮 / 不可用原因（如「这条记录没有剪前照片，拼不了对比图」）/「分享/保存图片」按钮。
- 隐私状态行：含人像照片的类型生成前显示「将自动为人脸打上遮罩」；多人拦截显示「照片里有多个人，为保护他人隐私，这张不能用于分享图」；检测失败显示「没能完成人脸检测，这张先不用于分享」。
- 入口：
  1. 剪后保存成功（记录详情页顶部的归因提示区）追加「去做分享图」链接；
  2. 记录详情操作区常驻「分享这次理发」链接；
  3. Tony卡详情（预览/现场模式外的编辑页脚）「分享Tony卡」链接。
- 导出成功提示「已交给系统分享」或「PNG 已开始下载」；失败提示保留在页内。

## 6. 错误与边界

- 数据不足：每类型给出确定性可用条件（对比=剪前+剪后照；复盘=任意记录；避雷=avoid/adjust 记录；Tony卡=已保存 brief+目标图；帮我选=计划 ≥2 候选且候选有图），不满足显示原因。
- 检测器不可用（无 worker/模型丢失）：按 blocked_error 硬拦截含人像类型，不影响纯文字/示例图类型。
- `navigator.share` 抛 AbortError（用户取消）：静默，不报错。
- 照片解码失败：该类型显示生成失败可重试。
- demo 图（跨源同站静态资源）：`loadImage` 用同源路径，无 taint 风险。

## 7. 测试计划

单元（Vitest）：

- `shareCards.spec`：五类布局——角标文本恒含「Tony宝」、绘制清单无二维码元素、标题/店名/清单行超长截断、清单 ≤3、帮我选恒为两个图槽、Tony卡效果位在无效果时输出占位文字（不复制参考图当"效果"标签）。
- `sharePhotos.spec`：single→ready+transform、none→ready 无 transform、multiple→blocked、error→blocked、缓存命中不再调用引擎。
- `shareExport.spec`：canShare 可用走 share；share 抛错回退下载；AbortError 静默。
- `shareRender.spec`：注入 stub 画布断言绘制调用（图片 cover 裁切参数、遮罩调用发生在对应槽）。

E2E（Playwright，390px，`share-studio.spec.ts`）：

1. 记录（含前后照+打标）→ 三入口可达 → 依次生成对比/复盘/避雷图 → 预览可见 → 导出（无 share API 环境走下载）→ 断言下载事件；全程网络监听：无跨域请求、无 POST；
2. Tony卡 → 生成 Tony卡分享图与帮我选图（计划 2 候选）→ 同上导出；
3. 多人照片（复用隐私遮罩 e2e 的多人样张）→ 含人像类型被硬拦截并显示原因；
4. 4× CPU 节流（CDP）下生成避雷图计时 <3s；
5. 首页无分享入口。
6. 每类成品 390px 截图 + 成品 PNG 本身存入 test-results 供终审。

## 8. 实施分解（TDD 顺序）

1. `shareCards.ts` 布局纯函数 + 截断 + 测试；
2. `shareRender.ts` 渲染器 + 测试；
3. `sharePhotos.ts` 遮罩准入 + 测试；
4. `shareExport.ts` 分享/下载 + 测试；
5. `ShareStudioView.vue` + 路由 + 三入口 + 样式；
6. e2e + 性能采样 + 全量回归 + 样张 + 报告。

## 9. 验收红线自检

| 红线 | 设计覆盖 |
| --- | --- |
| 五类图生成/遮罩/导出/兜底各有 Playwright 用例 | §7 e2e 1–3 |
| 分享全流程无图片字节外发 | §7 网络监听断言；§3 纯 Blob 管线 |
| 每类 390px 成品截图供终审 | §7 e2e 6；报告附样张 |
| 入口只在三个峰值时刻，首页不堆 | §5 入口；e2e 5 |
| 3:4 主规格 | 1080×1440 固定 |
| 人脸自动遮罩+多人硬拦截 | §3 sharePhotos 策略复用现有引擎 |
| 品牌角标，无本地地址二维码 | 布局纯函数测试断言 |
| 中文截断规则明确 | truncateShareText + 单测 |
| 低端安卓 <3 秒（4× 节流代理） | e2e 4 |
| 预览=成品同一设计语言 | 预览直接展示导出位图 |
| 不复活投票 | 帮我选仅产图；无任何站内投票 UI |
