# Guided Directions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用本地确定性规则把“帮我选”入口变成三问、三方向、一次加入计划的低认知流程。

**Architecture:** 新建无副作用的推荐纯函数与单一展示组件；计划表单只负责把推荐款映射为现有 `demo_ai` 候选，不改变 Dexie schema 或 Repository。现有目录是唯一素材与现实信息来源。

**Tech Stack:** Vue 3、TypeScript、Vitest、Testing Library、Playwright、现有 tactile 指令。

---

### Task 1: 确定性三方向规则

**Files:**
- Create: `src/features/hairstyle-library/guidedDirections.ts`
- Create: `src/features/hairstyle-library/guidedDirections.spec.ts`

- [ ] 写失败测试：三角色唯一、相同输入稳定、未知资料不编造、时间限制和目标影响排序。
- [ ] 运行目标测试并确认因模块缺失失败。
- [ ] 实现最小评分、角色选择和解释文案。
- [ ] 复跑目标测试。

### Task 2: 一次一个问题的选择器

**Files:**
- Create: `src/features/hairstyle-library/components/GuidedDirectionPicker.vue`
- Create: `src/features/hairstyle-library/components/GuidedDirectionPicker.spec.ts`

- [ ] 写失败测试：三问顺序、返回修改、三角色结果、无匹配度/AI 文案、一次采用事件。
- [ ] 运行失败测试。
- [ ] 用现有 tactile 指令实现最小组件。
- [ ] 复跑目标测试和 typecheck。

### Task 3: 接入计划表单

**Files:**
- Modify: `src/views/ArchivePlanFormView.vue`
- Modify: `src/features/archive/ArchiveRoutes.spec.ts`

- [ ] 写失败路由测试：`intent=choose` 三问后加入三个唯一候选，普通计划不显示引导器。
- [ ] 运行失败测试。
- [ ] 把推荐结果映射为现有候选草稿；保留手动更换能力。
- [ ] 复跑相关 archive tests。

### Task 4: 手机体验和回归

**Files:**
- Modify: `src/styles.css`
- Modify: `e2e/v3-experience.spec.ts`

- [ ] 把 V3 E2E 改为真实完成三问并采用三方向。
- [ ] 补充 360/390/430 宽度、45px 触控和刷新持久化断言。
- [ ] 先运行浏览器测试观察 RED，再完成最小样式。
- [ ] 运行 lint、typecheck、unit、build、完整 Playwright、audit 和 diff-check。

