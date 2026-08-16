# V4 第②B步交付报告：避雷区域打标 V1（喂给记忆系统）

> 日期：2026-08-13 · 分支 `v4-step2b-avoid-regions`
> 设计文档：`docs/superpowers/specs/2026-08-13-v4-step2b-avoid-region-marks-design.md`

## 1. 改了什么 / 为什么

### 数据模型（零迁移）

- `types.ts` 新增 `RegionMark`（5 区域 × 5 问题 + 相对坐标 + 照片锚点）与 `PlanRegionRequest`（区域 × 4 方向）；adjust/avoid 记录得到可选 `regionMarks`，计划得到可选 `regionRequests`，全部非索引字段，**Dexie 不升版本**，旧记录读出即 undefined 行为不变。
- `PlanMemorySource` 增加 `'region_mark'`，仓库层来源白名单同步放行。
- 本地备份是整对象序列化，新字段自动无损往返（新增往返测试验证）。

### 纯函数核心（`regionMarks.ts`，全部可单测）

- 词表：区域（顶部/两侧/刘海/后脑/鬓角）× 问题（太短/太薄/形状不对/衔接生硬/自定义 ≤160 字）× 计划方向（剪更短·铲短/打薄/保留长度/保留厚度）。
- `buildRegionMarkSuggestions`：打标 → 确定性模板文案（如「两侧：上次剪太短，这次保留长度」），最新记录优先、同区域同问题去重；**不做任何自由文本语义判断**。
- `detectRegionConflicts`：**冲突白名单只有两对**——太短×剪更短、太薄×打薄；同区域精确匹配才报，wrong_shape/custom/keep_* 一律不判。

### UI

- **剪后表单**（`RegionMarkAnnotator.vue`）：outcome 为「有一点要改/别再这样」且有剪后照片时出现；点照片落点 → 选区域+问题（custom 要一句话）→ 编号圆点上图 + 列表可删；上限 5 条；**可选步骤，不打标照常保存**。新选照片预分配 id，标注保存前就能锚定；换照片时提示旧标注保文字失定位。
- **记录详情三图并排**：「当时想剪的（计划 Tony卡目标候选图，缺失显示占位）· 实际剪成的 · 哪里出了问题（剪后照 + 圆点 + 图例）」；≥720px 三栏，窄屏堆叠；照片失锚只显示文字图例，不猜位置。
- **计划表单「本次区域要求（可选）」**：5 区域 × 4 方向 chip 单选可取消；冲突时 `role="alert"` 卡片展示两条来源（当时的记录链接 + 本次要求），**只提醒不阻塞保存**；计划详情展示已选要求。
- **记忆通道**：区域打标建议以 `region_mark` 来源排在自由文本避雷之前进入「这次一定避开」，沿用第①步 3 条上限、溢出换入、可改可删、来源可查、快照机制。

### 过程中修掉的真 bug

- 计划保存把 Vue reactive 代理数组直接交给 IndexedDB，真浏览器 structuredClone 遇 Proxy 抛 `DataCloneError`（fake-indexeddb 不严格所以单测漏过，e2e 抓到）→ store 层拷贝为普通对象。
- 「本次区域要求」折叠面板曾用 `regionRequests.length` 反应式绑定 `open`，取消最后一个选择时面板会突然收起 → 改为仅编辑回填时展开一次。

## 2. 没改什么（刻意）

- 不做人脸检测自动定位区域（用户手点，位置只是示意锚点）；
- 不做关键词/语义冲突判断（V3 反模式）；自由文本避雷规则与打标互不转换；
- 分享图引用打标留给第③步；
- avoid 规则原有 1–3 条自由文本流程未动，打标是纯增量。

## 3. 测试证据（2026-08-13 全部新鲜通过）

| 项目 | 结果 |
| --- | --- |
| `npm run test:run` | 74 文件 690 通过 / 2 跳过（新增 28 条） |
| `npm run test:e2e` | 34 通过（新增 `e2e/region-marks.spec.ts` 3 条） |
| `npm run lint` / `typecheck` / `build` | 通过 |
| `npm run verify:mediapipe` | 7 项通过 |
| `npm audit --omit=dev` | 0 漏洞 |
| `git diff --check` | 干净 |

### 验收红线对照（总纲 3.2）

- 打标可选、不阻塞复盘主流程：e2e「marking stays optional」不打标直接保存 ✅
- 零迁移、旧记录不受影响：非索引可选字段，无 Dexie 升版；备份往返测试 ✅
- 冲突只在结构化精确匹配出现，**正反测试**：单测 6 条（同区域同类型→报；不同区域/非矛盾方向/custom/形状/衔接→不报）+ e2e 正例 1 反例 2 ✅
- 触控目标 ≥45px 且 Playwright 覆盖：圆点/删除按钮/方向 chip 的 boundingBox 断言 ✅
- 区域条目走 planMemoryItems 通道、可查可删可改：复用第①步机制，e2e 验证建议文案与来源链接 ✅
- 三图并排存档于记录详情：e2e 断言三栏 + 圆点数 + 图例 ✅

## 4. 390px 截图路径（`test-results/` 下）

- 表单打标（两个标注 + 列表）：`region-marks-marks-regions-…/record-form-marks-390x844.png`
- 记录详情三图并排：同目录 `record-detail-triptych-390x844.png`
- 计划表单冲突提示：`region-marks-feeds-marks-…/plan-form-conflict-390x844.png`
- 计划详情区域要求：同目录 `plan-detail-region-requests-390x844.png`

## 5. 已知风险 / 待产品负责人裁决

1. **坐标不代表解剖学区域**：圆点位置只是用户点选的示意锚点，区域语义完全由用户选择的 chip 决定——刻意如此，避免假 AI。
2. **冲突矩阵只有两对**：形状不对/衔接生硬没有可确定性对立的计划方向，宁缺毋滥；后续如新增方向词表需同步补正反测试。
3. 旧记录编辑后再换剪后照片，历史标注只保留文字（设计决定，不做猜测性重锚定）。
4. 计划方向词表（4 项）是本步新增的最小集合，是否要扩充（如「推更高」「留鬓角」）待真实使用反馈。
