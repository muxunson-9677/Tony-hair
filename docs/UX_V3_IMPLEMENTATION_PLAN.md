# 咋剪发 V3 P0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 不改变本机隐私与现有档案主键，把现有功能重新组织成低认知的私人理发决策流程。

**Architecture:** 保留 Vue 3、Pinia、Dexie 和现有 Repository；新增纯状态解析器和小型展示组件，视图只消费状态，不复制业务判断。非索引可选字段沿用现有 Dexie 表，不升级数据库版本；任何历史行都必须有读取默认值。

**Tech Stack:** Vue 3、TypeScript、Pinia、Dexie、Vitest、Playwright、CSS Pointer Events。

---

### Task 1：首页与三条自然语言入口

**Files:** `src/features/home/resolveHomeAction.ts`、`src/features/home/resolveHomeAction.spec.ts`、`src/views/HomeView.vue`、`src/App.spec.ts`

- [x] 先写失败测试：无档案只显示“先认识一下我的头发”；已有档案无活动任务显示“帮我选 / 我有参考图 / 照上次剪（仅有满意历史时）”；活动任务保持唯一主动作。
- [x] 运行 focused Vitest，确认失败来自新状态合同。
- [x] 最小实现状态解析和首页结构，去掉首屏产品说明负担。
- [x] 复跑 focused tests。

### Task 2：最小建档与自然语言资料

**Files:** `src/features/archive/ArchiveRoutes.spec.ts`、`src/views/ArchiveProfileView.vue`、`src/styles.css`

- [x] 先写失败测试：第一次只需称呼、可选正面照片和最小头发条件即可保存；其余资料放入“以后再补”。
- [x] 运行失败测试。
- [x] 把保存动作移到首个可完成段，保留完整编辑入口和原有字段值。
- [x] 验证旧档案读取、照片 Blob 和多档案防误删不受影响。

### Task 3：方案比较、主方案与备用方案

**Files:** `src/features/archive/types.ts`、`src/features/archive/ArchiveRepository.ts`、`src/features/archive/ArchiveRepository.spec.ts`、`src/views/ArchivePlanDetailView.vue`、`src/views/ArchiveBriefView.vue`

- [x] 先写失败测试：主/备用必须属于同一计划且不能相同；历史 brief 缺备用仍可读。
- [x] 最小扩展 `BarberBrief.backupCandidateId?`，不新增索引、不升 Dexie schema。
- [x] 详情页用四个固定维度比较，并支持设为主方案、备用方案和撤销。
- [x] 沟通卡自动带入主图和可选备用图。

### Task 4：理发师现场 Hero

**Files:** `src/features/archive/ArchiveRoutes.spec.ts`、`src/views/ArchiveBriefView.vue`、`src/styles.css`

- [x] 先写失败测试：首屏只包含主目标、最在意、绝对不要；区域细节可展开；隐藏全局导航。
- [x] 最小实现到店模式与普通编辑模式分层，保留 PNG/打印兜底。
- [x] 验证 390×844 首屏和大字高对比。

### Task 5：60 秒剪后学习

**Files:** `src/features/archive/types.ts`、`src/features/archive/ArchiveRepository.ts`、`src/features/archive/ArchiveRepository.spec.ts`、`src/views/ArchiveRecordFormView.vue`、`src/views/ArchiveRecordDetailView.vue`

- [x] 先写失败测试：“就这样 / 有一点要改 / 别再这样”三态持久化，旧 repeat/avoid 兼容。
- [x] 最小实现 `adjust` 结果及一句区域调整；照片、店铺和价格等保持渐进披露。
- [x] 保存后显示系统学到的具体内容，而不是通用成功提示。

### Task 6：统一 motion、错误和撤销语言

**Files:** `src/styles.css`、`src/ui/tactile.ts`、相关组件测试、`e2e/apple-light-interactions.spec.ts`

- [ ] 删除后的通用 Undo 状态（本轮仍使用二次确认；不阻塞主流程）。
- [x] 验证 pressed、drag-cancel、release、reduced-motion 和错误恢复。
- [x] 建立 motion tokens；不引入新动画依赖。
- [x] 修复浮动操作遮挡、按钮层级和玻璃范围。

### Task 7：真实流程与最终验收

**Files:** `e2e/archive.spec.ts`、`e2e/hairstyle-library.spec.ts`、`e2e/barber-brief.spec.ts`、新增 `e2e/v3-core-flows.spec.ts`

- [x] 更新旧脚本，只通过用户可见控件操作渐进披露表单。
- [x] 覆盖新用户→沟通卡、参考图→主方案、照上次剪、现场模式、三种剪后结果、刷新恢复、错误和减少动态。
- [x] 运行 lint、typecheck、unit、build、MediaPipe hash、audit 和完整 Playwright。
- [x] 生成 360/390/430/desktop 截图，人工检查后再提交。

## 边界

- 不恢复 M4/M7。
- 不实现真实 AI、邮箱登录、社区、支付、站内分享或商家端。
- 不 reset/clean 数据库或工作树。
- 不把固定文案描述成 AI 结论。
- 不为了动效引入新的运行时依赖。
