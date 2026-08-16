# V4 第①步交付报告：记忆继承 + 归因 + 品牌

> 日期：2026-08-13 · 分支 `v4-step1-memory-brand`（worktree `.worktrees/v4-step1-memory-brand`）
> 设计文档：`docs/superpowers/specs/2026-08-12-v4-step1-memory-brand-design.md`

## 1. 改了什么 / 为什么

### 1.1 记忆继承（planMemoryItems 通道）

- 新增 `PlanMemoryItem` 数据模型（`kind: keep/avoid`、`source: repeat/adjust/avoid_rule`、来源记录快照字段），Dexie 由 v3 升 v4 仅新增 `planMemoryItems` 表，零迁移零重写，旧数据不动。
- `savePlanWithCandidates` 扩展为计划 + 候选 + 记忆快照三者同一事务原子保存；删除计划/档案时级联删除记忆快照。
- 纯函数 `buildPlanMemorySuggestions`（`src/features/archive/planMemory.ts`）实现建议生成：
  - 最近一次 `repeat` → 「整体照上次的「X」复刻」；晚于该次 repeat 的 `adjust` 备注逐条带入（更早的调整视为已被成功理发覆盖，不再自动带入——设计修订3）；
  - 活动避雷规则全部进入 avoid 组，展示上限 3 条，超出进入「还有 N 条避雷没带入，查看」溢出区，可两步换入（设计修订2），不静默丢弃；
  - 每条建议携带来源（日期 + 发型名），可改可删，改动不回写原记录。
- 新建计划页「本次已带入」分组编辑器（`PlanMemoryEditor.vue`）；编辑计划页展示已保存快照；计划详情页只读展示，来源记录被删除时显示「原记录已删除，保留当时快照」。
- Tony卡（理发师沟通卡）：计划有记忆快照时,「最在意/绝对不要」默认值优先取自快照；旧计划（无快照）回退到旧逻辑并继续合并全局活动避雷规则（设计修订1），旧数据安全信息不降级。

### 1.2 剪后归因反馈

- 保存剪后记录后按结果给一次性反馈（`recordAttribution.ts`，内存态，消费一次即清除，刷新不复现）：
  - 就这样 → 「Tony 记住了：这次的成功剪法已存档，下次一句话复刻。」
  - 有一点要改 → 「Tony 记住了：下次会带上你刚写的调整。」
  - 别再这样 → 「这次的雷 Tony 记住了，下次替你挡。」

### 1.3 首页记忆与情绪价值

- 「距离上次理发 N 天」（有已完成记录才显示）；
- 活跃计划有记忆快照时显示「已带上 N 条你的经验」，点击直达计划详情。

### 1.4 品牌

- 新增 `src/config/brand.ts`：`PRODUCT_NAME=Tony宝`、`BARBER_CARD_NAME=Tony卡`、`PRODUCT_PROMISE(_SHORT)=剪前帮你定，剪时替你说，剪后帮你记`、`pageTitle()`。
- 用户可见文案全量替换（首页、导航、页面标题、Tony卡编辑/预览/PNG 导出、index.html 描述）；内部标识符（db 名、存储 key、路由、CSS 类名）刻意不动，保证既有数据兼容。

## 2. 没改什么（刻意）

- 未建 manifest / Service Worker（总纲留给第②步）；
- 无二维码、无外链、无上传，纯本地；
- 数据库无迁移、无重写，v3 旧库直接升 v4 打开；
- 社区/投票/登录/支付/统计零代码；发型素材库未扩充；
- Tony 人格每屏至多一次，仅用于反馈/提醒/记忆场景。

## 3. 测试证据（2026-08-13 全部新鲜通过）

| 项目 | 结果 |
| --- | --- |
| `npm run test:run` | 66 文件 625 通过 / 2 跳过 |
| `npm run test:e2e` | 28 通过（含新增 `e2e/plan-memory.spec.ts` 3 条旅程） |
| `npm run lint` | 通过 |
| `npm run typecheck` | 通过 |
| `npm run build` | 通过 |
| `npm run verify:mediapipe` | 7 项固定资产校验通过 |
| `npm audit --audit-level=high` | 0 漏洞 |
| `git diff --check` | 干净 |

新增测试覆盖：记忆建议纯函数（时序/去重/上限/溢出换位）、Dexie v3→v4 升级与事务回滚、级联删除、备份导入兼容缺表、`PlanMemoryEditor` 组件交互、Tony卡默认值优先级与旧计划兜底、归因消息一次性消费、首页天数与经验数、品牌常量；e2e 三条旅程（继承-编辑-快照稳定-Tony卡、避雷溢出两步换入-刷新持久、旧计划兜底 + 新计划删除生效）。

## 4. 390px 截图路径（`test-results/` 下）

- 计划表单「本次已带入」：`plan-memory-inherits-…-Tony-card/plan-form-memories-390x844.png`
- 计划详情记忆摘要：同目录 `plan-detail-memories-390x844.png`
- 原记录删除后快照保留：同目录 `plan-detail-source-deleted-390x844.png`
- 剪后归因反馈：同目录 `attribution-adjust-390x844.png`
- 首页天数 + 经验链接 + Tony宝品牌：同目录 `home-memory-390x844.png`
- Tony卡保存：同目录 `tony-card-saved-390x844.png`
- 避雷溢出展开 / 换入后持久：`plan-memory-shows-the-avoi-…/avoid-overflow-open-390x844.png`、`avoid-swap-persisted-390x844.png`
- 旧计划兜底 Tony卡 / 新计划删除避雷后 Tony卡：`plan-memory-keeps-the-lega-…/legacy-fallback-brief-390x844.png`、`new-plan-brief-no-avoid-390x844.png`

## 5. 已知风险 / 待产品负责人裁决

1. 首页品牌承诺「剪前帮你定，剪时替你说，剪后帮你记」在 390px 下换行为两行、末字换行位置略生硬，属排版微调项，未阻塞。
2. 商标核查（Tony宝 vs Toni&Guy 等）是产品负责人待办，代码侧已把品牌收敛到 `src/config/brand.ts` 单点，改名成本为改一个文件。
3. 记忆建议只取最近一次 repeat + 其后的 adjust + 全部活动避雷；更久远的成功经验不自动带入（设计有意为之，避免噪音），用户可手动补写。
4. 真机（Android Chrome / iOS Safari / 微信内置）体验复验未做，属产品负责人待办。
