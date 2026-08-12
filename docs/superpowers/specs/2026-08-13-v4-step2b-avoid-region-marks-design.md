# V4 第②B步设计：避雷区域打标 V1（喂给记忆系统）

日期：2026-08-13
分支：`v4-step2b-avoid-regions`
上游依据：`咋剪发_V4_全程执行总纲.md` 第 3 节

## 1. 现状审计

- **剪后表单**（`ArchiveRecordFormView.vue`）：outcome 三选（repeat/adjust/avoid），adjust 有 1–3 条调整、avoid 有 1–3 条避雷规则；照片按 stage 选择，`before`/`after` 为主推阶段，新照片经 `prepareLocalImage` 本地处理后有 `previewUrl` 预览。
- **记录详情**（`ArchiveRecordDetailView.vue`）：已有"剪前/剪后对比"双图（`comparisonPhotos`），outcome 摘要区分三种结果。
- **记忆通道**（第①步产物）：`buildPlanMemorySuggestions` 生成 keep/avoid 建议 → `PlanMemoryEditor` 可改可删可换入 → `savePlan` 原子写 `planMemoryItems` 快照。`PlanMemorySource` 为字符串 union，扩展新来源零迁移。
- **计划侧没有任何结构化"区域要求"**：Tony卡的 top/sides 等字段是自由文本；私人参考的 `focusAreas` 是 region × keep/avoid × 自由 note，没有"问题类型"词表。要满足"冲突提示只在结构化字段精确匹配时出现"，必须给计划新增一个最小的结构化区域要求选择器，与打标共用同一词表。
- **数据层**：Dexie 表存整对象，records/plans 增加非索引可选字段无需版本升级（零迁移）。本地备份 `localBackup.ts` 需确认导出/导入不丢新字段（实施时验证，若白名单序列化则补字段）。

## 2. 范围 / 不做

做：

1. 剪后结果为 adjust/avoid 时，可在**剪后照片**上点区域打标：区域（顶部/两侧/刘海/后脑/鬓角）× 问题（太短/太薄/形状不对/衔接生硬/自定义 ≤160 字）；可选步骤，不打标不阻塞保存。
2. 记录详情新增"目标图 / 剪后图 / 标注"三图并排存档区。
3. 打标产物进入记忆建议：新建计划时生成区域级避雷条目（如"两侧：上次剪太短，这次保留长度"），走 planMemoryItems 通道，来源可查、可删可改。
4. 计划表单新增可选"本次区域要求"（区域 × 方向），与打标同词表；**确定性冲突提示**：同区域且问题类型与方向直接矛盾（太短×还要更短、太薄×还要打薄）时展示两条来源，由用户裁决，不阻塞保存。

不做：

- 任何自由文本语义判断/关键词规则（V3 反模式）；
- 人脸检测自动定位区域（打标位置由用户手点）；
- 分享图引用打标（第③步）；
- avoid 规则自由文本与打标互转。

## 3. 方案选择

- **打标锚点**：点击照片记录相对坐标 x/y ∈ [0,1] + `photoId`。照片被替换后旧标注保内容不保定位：详情页若找不到对应照片则退化为纯文字列表（区域+问题），不做任何猜测性重锚定。
- **问题词表**（两侧共用）：`too_short 太短 / too_thin 太薄 / wrong_shape 形状不对 / harsh_transition 衔接生硬 / custom 自定义`。
- **计划方向词表**：`cut_shorter 剪更短·铲短 / thin_out 打薄 / keep_length 保留长度 / keep_volume 保留厚度`。每区域至多一个方向。
- **确定性冲突矩阵**（唯一判断来源，白名单）：
  - `too_short` × `cut_shorter` → 冲突；
  - `too_thin` × `thin_out` → 冲突；
  - 其余组合（含 wrong_shape、harsh_transition、custom、keep_*）一律不判。自由文本永不参与。
- **记忆建议文案模板**（确定性拼接，非语义生成）：
  - too_short → `{区域}：上次剪太短，这次保留长度`
  - too_thin → `{区域}：上次打太薄，这次保留厚度`
  - wrong_shape → `{区域}：上次形状不对，这次先确认轮廓再动手`
  - harsh_transition → `{区域}：上次衔接生硬，这次要求过渡自然`
  - custom → `{区域}：{note}`
  - 来源 `region_mark`（新 `PlanMemorySource` 成员），按记录时间取最新、同区域同问题去重，并与现有 avoid 规则合并走既有 3 条上限+溢出换入机制。

## 4. 数据设计（零迁移）

`src/features/archive/types.ts` 新增：

```ts
export type HairRegion = 'top' | 'sides' | 'fringe' | 'back' | 'sideburns'
export type RegionMarkIssue = 'too_short' | 'too_thin' | 'wrong_shape' | 'harsh_transition' | 'custom'
export interface RegionMark {
  readonly id: string
  readonly region: HairRegion
  readonly issue: RegionMarkIssue
  readonly note?: string   // custom 必填、≤160；其余可空
  readonly x: number       // 0–1 相对坐标
  readonly y: number
  readonly photoId?: string
}
export type RegionRequestDirection = 'cut_shorter' | 'thin_out' | 'keep_length' | 'keep_volume'
export interface PlanRegionRequest {
  readonly region: HairRegion
  readonly direction: RegionRequestDirection
}
```

- `AdjustHaircutRecord` / `AvoidHaircutRecord` 增加 `regionMarks?: readonly RegionMark[]`（repeat 为 `never`）；
- `HaircutPlan` 增加 `regionRequests?: readonly PlanRegionRequest[]`；
- `PlanMemorySource` 增加 `'region_mark'`；
- 均为非索引可选字段：Dexie 不升版本，旧记录读出即 `undefined`，行为不变；
- 本地备份：确认整对象序列化则免改，否则把两个字段加进导出/导入并保持旧备份可导入。

## 5. 交互设计

### 5.1 剪后表单打标（`RegionMarkAnnotator.vue`）

- 仅当 outcome 为 adjust/avoid 且存在剪后照片（新选预览或编辑时已有 after 照）时出现，标题"在照片上点出问题位置（可选）"。
- 点照片任意处 → 出现待确认标记点 + 面板：区域 5 个 chip、问题 5 个 chip、custom 时出现 ≤160 字输入框；"添加标注"确认，"取消"丢弃。
- 已确认标注在照片上显示编号圆点（触控目标 ≥45px），下方列表逐条显示"① 两侧 · 太短"+ 删除按钮（≥45px）。
- 上限 5 条；不打标可直接保存，打标数据随 `saveRecord` 原子提交。
- 编辑已有记录：回填已有标注；替换剪后照片时提示旧标注将失去定位（保留文字内容）。

### 5.2 记录详情三图并排

- outcome 为 adjust/avoid 且（有标注或有关联计划目标图）时显示"当时想剪的 / 实际剪成的 / 哪里出了问题"三栏：
  1. 目标图：`record.planId` → 该计划 Tony卡 `targetCandidateId` → 候选参考图/示例图；缺失显示"没有关联目标图"占位；
  2. 剪后图：现有 after（退化 styled/unstyled）照片；
  3. 标注图：同一张剪后照片 + 编号圆点覆盖层 + 图下图例；照片丢失定位时只显示图例列表。
- 窄屏纵向堆叠，≥720px 三栏并排。

### 5.3 计划表单区域要求 + 冲突提示

- 候选区之后新增可折叠"本次区域要求（可选）"：5 行区域，每行 4 个方向 chip 单选可取消（≥45px）。
- 冲突提示：`detectRegionConflicts(regionRequests, records)` 非空时在该区块内渲染 `role="alert"` 卡片：
  - "两侧：上次（2026-08-01 · 短碎）标了'太短'，这次又要求'剪更短·铲短'。确定要这样吗？"
  - 附原记录链接 + 本次要求两条来源；仅提示，不阻塞保存，用户裁决。
- 保存：`regionRequests` 随 `savePlan` 提交；计划详情页展示已选要求。

## 6. 错误与边界

- custom 未填 note 或超 160 字：面板内联报错，不生成标注；store 侧同样校验兜底。
- x/y 越界：store 校验 clamp 拒绝（0–1 之外视为无效标注）。
- 标注引用的 photoId 不在当前照片集：详情页与表单退化为文字列表，不崩溃。
- 目标图候选被删/计划无 Tony卡：目标位显示占位文案。
- 冲突判断只读取结构化字段，记录被删后其标注不再参与冲突与建议（与现有 avoid 规则行为一致）。
- 旧记录/旧计划（无新字段）：全部路径按"无标注/无要求"处理。

## 7. 测试计划

单元/组件（Vitest）：

- `regionMarks.spec.ts`：词表标签、`validateRegionMarks`（custom 必填、160 上限、坐标范围）、`buildRegionMarkSuggestions`（模板文案、最新优先、同区域同问题去重、repeat 记录不产出）、`detectRegionConflicts` **正反用例**（同区域同类型→冲突；不同区域→不冲突；wrong_shape/custom/keep_* →不冲突；自由文本永不参与）。
- `planMemory.spec.ts` 增补：region_mark 建议进入 avoid 组、与 avoid 规则合并后仍守 3 条上限+溢出。
- `archiveStore.spec.ts` 增补：saveRecord 携带 regionMarks 原子保存/编辑回填/非法标注拒绝；savePlan 携带 regionRequests；旧数据读取不受影响。
- `RegionMarkAnnotator.spec.ts`：点选→面板→确认/取消、custom 校验、删除、上限 5 条。
- 详情页三图：有目标图/无目标图/照片失锚三态。
- 备份兼容：含新字段导出→导入往返无损；旧备份导入正常。

E2E（Playwright，390px）：

- `region-marks.spec.ts`：
  1. 建档案→记录剪后（avoid）→照片上打两个标→保存→详情三图并排可见、图例正确；
  2. 新建计划→记忆区出现区域级避雷条目（来源可点）→选"两侧×剪更短"→冲突提示出现；改选"顶部×剪更短"→提示消失（反例）；
  3. 打标圆点与方向 chip 的 boundingBox ≥45px；
  4. 不打标直接保存记录 → 主流程无阻塞（红线）。

## 8. 实施分解（TDD 顺序）

1. types + `regionMarks.ts` 纯函数（词表/校验/建议/冲突）+ 测试；
2. `planMemory.ts` 合并 region_mark 建议 + 测试；
3. store：saveRecord/savePlan 扩展 + 备份兼容 + 测试；
4. `RegionMarkAnnotator.vue` + 表单集成 + 测试；
5. 详情页三图 + 测试；
6. 计划表单区域要求 + 冲突提示 + 计划详情展示 + 测试；
7. e2e + 全量回归 + 截图 + 报告。

## 9. 验收红线自检

| 红线 | 设计覆盖 |
| --- | --- |
| 打标可选，不阻塞 60 秒复盘 | 5.1：无标注可保存；e2e 用例 4 |
| 零迁移，旧记录不受影响 | 4：非索引可选字段，Dexie 不升版本；6：旧数据路径 |
| 冲突只在结构化精确匹配出现，有正反测试 | 3 冲突白名单矩阵；7 正反用例 |
| 触控目标 ≥45px，移动端 Playwright 覆盖 | 5.1/5.3 尺寸约定；e2e 用例 3 |
| 区域级条目走 planMemoryItems 通道，可查可删可改 | 3 模板 + 复用第①步编辑器与快照机制 |
| 三图并排存档于记录详情 | 5.2 |
