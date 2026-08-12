# V4 第③步交付报告：分享工作室 = 增长引擎

日期：2026-08-13
分支：`v4-step3-share-studio`
设计文档：`docs/superpowers/specs/2026-08-13-v4-step3-share-studio-design.md`

## 1. 改了什么

### 新模块 `src/features/share/`（全部纯本地，零新表零迁移）

| 文件 | 职责 |
| --- | --- |
| `shareCards.ts` | 五类分享图的声明式布局纯函数（1080×1440，3:4）。所有文本上限按「字符宽 × 字号 + 起点 ≤ 画布宽」推导，超长统一截断加 `…`。品牌角标「Tony宝 · 本地生成」恒在右下角，无二维码。 |
| `shareRender.ts` | 布局 → Canvas → PNG Blob。人像遮罩**先在原图分辨率压平**（复用 `drawOpaqueMask`），再进入版面 cover 裁切，保证遮罩永远锚定人脸。区域打标画编号圆点。 |
| `sharePhotos.ts` | 照片准入策略：单人脸→自动遮罩；多人→硬拦截；检测失败→硬拦截（不冒险裸发）；无人脸→原样。`createSharePhotoResolver` 按 Blob 缓存，一张照片只推理一次。 |
| `shareExport.ts` | `navigator.share({files})` 优先；不支持或失败兜底 PNG 下载；用户取消（AbortError）静默不降级。 |

### 页面与入口

- `src/views/ShareStudioView.vue` + 路由 `/archive/share?record=<id>` / `?plan=<id>`：按上下文列出可用图类型；数据不足显示原因而非空白；预览即导出成品同一张位图。
- 入口三处（首页不加）：
  1. 剪后保存成功归因提示内「去做分享图」（`ArchiveRecordDetailView`）；
  2. 记录详情操作区「分享这次理发」；
  3. Tony卡编辑页「分享Tony卡」（`ArchiveBriefView`）。
- 样式：`apple-light-pages.css` 新增 `.share-studio-view` 等，触控目标 ≥45px。

### 五类图落地要点

1. **对比图**：剪前/剪后并排 + 满意度；
2. **复盘图**：结论标题（就这样/微调/避雷）+ 清单 ≤3 条；
3. **避雷图**（重点）：深底自嘲标题「这次翻车了，帮你避雷」+ ②B 区域打标编号圆点 + 图例清单；
4. **Tony卡分享图**：参考原图 + 「效果位 · 期待剪后」明示占位——**不伪造 AI 效果**；下方「最在意/绝对不要」双列各 ≤3；
5. **帮我选**：A/B 双图 + 「回我 A 或 B」；只产图，站内零投票交互。

## 2. 为什么这么做

- 布局与渲染分离（纯函数 + 注入渲染）沿用 briefExport 已验证的架构，布局可单测（角标恒在、无二维码、必截断、不越界）。
- 遮罩在原图分辨率先压平而不是在版面坐标上画：cover 裁切会平移缩放图片，直接在版面画遮罩会偏位漏脸，这是隐私红线，不能赌。
- 检测失败选择「拦截」而不是「原图放行」：宁可少一张图，不能漏一张脸。
- demo 示例图（精选发型库素材）不是用户人像，不检测直接使用。

## 3. 没改什么

- 1:1 / 9:16 规格（总纲允许后置）；
- 二维码（无公开落地 URL，沿用第①步决议只放文字角标）；
- 分享历史/统计（刻意不落任何记录）；
- 遮罩样式选择器（分享图固定 editorial_bar，隐私工具内的选择不受影响）；
- 任何站内投票/社区形式。

## 4. 测试证据（全部新鲜通过）

| 项 | 结果 |
| --- | --- |
| `npm run lint` | 0 错误 |
| `npm run typecheck` | 通过 |
| `npm run test:run` | 78 文件 718 通过（含 share 模块 28 条：布局/截断/越界不变量/准入缓存/渲染顺序/导出兜底） |
| `npm run build` | 成功 |
| `npm run verify:mediapipe` | 7 项资产校验通过 |
| `npm audit --audit-level=high` | 0 漏洞 |
| `npm run test:e2e` | 39 通过（新增 share-studio 5 条） |
| `git diff --check` | 干净 |

share-studio e2e 覆盖（390×844）：

1. **记录流**：三入口可达 → 对比/复盘/避雷依次生成 → 断言「已自动遮住脸部」→ 导出走下载兜底并校验 PNG 字节 >0；全程断言**无跨域请求、无 POST/PUT/PATCH/DELETE**；
2. **计划流**：Tony卡入口 → Tony卡分享图 + 帮我选生成导出，断言页面无「投票」字样；
3. **多人拦截**：双人脸合成样张 → 复盘图硬拦截并显示原因，无预览无重试按钮；
4. **性能**：检测器预热后 4× CPU 节流生成避雷图 <3s（实测约几百 ms，阈值 3000ms）；
5. **首页无入口**：`/` 无任何分享链接。

## 5. 样张路径（供产品负责人审美终审）

`test-results/share-studio-record-flow-*/`：

- `share-compare.png` / `share-review.png` / `share-avoid.png`（成品 1080×1440）
- `share-*-preview-390x844.png`、`share-studio-record-390x844.png`（页面截图）

`test-results/share-studio-plan-flow-*/`：

- `share-brief.png` / `share-choose.png`（成品）
- `share-studio-plan-390x844.png`（页面截图）

## 6. 对抗性自审中发现并已修复

- **中文越界**：初版右列清单按 22 字截断，但右列实际只有 448px 宽，长句会画出画布外（Tony卡第三条「不要」已顶边）。已按列宽重推各上限（`SHARE_SIDE_LINE_LIMIT=9`、`SHARE_COLUMN_LINE_LIMIT=11`、标题 14），Tony卡下部改为列头式排版，并新增「任何文本不得越界」的不变量单测（用超长输入轰炸全部五类）。
- **浮点截断误差**：0.55×40 ASCII 累加出现 22.000000000004 导致误截断，已加 epsilon。

## 7. 已知风险 / 留给产品负责人

- **审美终审**：分享图好不好看由产品负责人定，样张见上；避雷图右列较空、可考虑后续加大图占比。
- **真机 `navigator.share`**：桌面 Chromium 无 share API，e2e 只能验证下载兜底路径；系统分享面板需 Android Chrome / iOS Safari 真机复验（与第②步真机待办合并执行）。
- **检测器不可用时含人像类型全部拦截**：这是设计选择（诚实降级），意味着模型加载失败的用户暂时发不了带脸的图，文案已解释原因。
- 帮我选取候选列表**前两个有图候选**；计划有 3–4 个候选时暂无手动挑选 A/B 的 UI（V1 范围裁剪）。
