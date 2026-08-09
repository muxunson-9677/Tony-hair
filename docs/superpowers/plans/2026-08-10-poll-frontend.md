# “咋剪发”投票前端实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 从已有 2～4 个候选的发型计划出发，完成本地遮罩、幂等上传、创建投票、好友投票、结果查看与撤销的真实前端闭环。

**Architecture:** 投票草稿使用独立 Dexie 数据库保存本地管理 token、`clientRequestId`、每个候选的 `uploadId`、扁平图和上传进度；所有网络请求集中在 `PollService`。创建页始终只挂载一个 `MaskEditor`，以队列索引切换候选，避免复制隐私引擎。公开投票页和管理页隐藏底部导航并分别只承担“做选择”和“看结果/撤销”两种任务。

**Tech Stack:** Vue 3、TypeScript、Vue Router、Dexie、Vitest、Testing Library、Playwright。

---

## 文件边界

- `src/features/polls/types.ts`：本地草稿、API DTO、错误和状态类型。
- `src/features/polls/PollDraftRepository.ts`：独立 IndexedDB 与事务；不接触档案数据库。
- `src/features/polls/PollService.ts`：体验码、上传、创建、公开读取、投票、结果、撤销。
- `src/features/polls/pollCreateQueue.ts`：从档案候选解析遮罩队列与 disclosure。
- `src/views/PollCreateView.vue`：体验码、逐张遮罩、上传、创建和失败恢复。
- `src/views/PublicPollView.vue`：公开投票、60 字短评、重复/过期/离线状态。
- `src/views/PollManageView.vue`：本机 token 读取、结果和撤销。
- `src/router.ts`、`src/views/ArchivePlanDetailView.vue`：入口与三条路由。
- `src/styles.css`：投票界面响应式层级。
- `e2e/polling.spec.ts`：完整浏览器闭环和截图。

### Task 1: Dexie 草稿与幂等状态

**Files:**
- Create: `src/features/polls/types.ts`
- Create: `src/features/polls/PollDraftRepository.ts`
- Test: `src/features/polls/PollDraftRepository.spec.ts`

- [ ] **Step 1: 写失败测试**

```ts
it('在任何网络请求前原子保存 clientRequestId、managementToken 和 uploadId', async () => {
  const draft = await repository.createDraft({ planId: 'plan-1', title: '帮我选一个' }, candidates)
  expect(draft.status).toBe('draft')
  expect(draft.clientRequestId).toMatch(/^[A-Za-z0-9_-]{16,128}$/)
  expect(draft.managementToken).toMatch(/^[A-Za-z0-9_-]{43}$/)
  expect(draft.options.every(({ uploadId }) => uploadId.length >= 16)).toBe(true)
  expect(await repository.getByPlanId('plan-1')).toEqual(draft)
})

it('逐项保存扁平图和 assetId，刷新后仍可继续', async () => {
  await repository.saveMaskedImage(draft.id, 'candidate-1', exportResult)
  await repository.saveUploadedAsset(draft.id, 'candidate-1', uploaded)
  const restored = await repository.get(draft.id)
  expect(restored?.options[0]).toMatchObject({ assetId: uploaded.assetId, uploadStatus: 'uploaded' })
  expect(restored?.options[0].maskedImage).toEqual(exportResult.blob)
})
```

- [ ] **Step 2: 运行测试并确认因仓储不存在而失败**

Run: `npm run test:run -- src/features/polls/PollDraftRepository.spec.ts`

- [ ] **Step 3: 最小实现**

实现单表 `drafts`，以 `id, &planId, pollId, status, updatedAt` 建索引；`createDraft` 在单事务内生成并写入 32-byte base64url management token、稳定 `clientRequestId` 和每个候选的稳定 `uploadId`。后续更新保留已有随机值。

- [ ] **Step 4: 运行测试并确认通过**

Run: `npm run test:run -- src/features/polls/PollDraftRepository.spec.ts`

### Task 2: PollService 网络契约

**Files:**
- Create: `src/features/polls/PollService.ts`
- Test: `src/features/polls/PollService.spec.ts`

- [ ] **Step 1: 写失败测试**

```ts
it('上传使用原始扁平 Blob 和稳定 x-upload-id', async () => {
  await service.uploadMasked({ uploadId: 'upload_1234567890', image: maskedBlob })
  expect(fetchMock).toHaveBeenCalledWith('/api/uploads/masked', expect.objectContaining({
    method: 'POST',
    body: maskedBlob,
    credentials: 'same-origin',
    headers: expect.objectContaining({ 'x-upload-id': 'upload_1234567890' }),
  }))
})

it('创建时只在 header 发送 management token', async () => {
  await service.createPoll(draft)
  const [, init] = fetchMock.mock.calls[0]
  expect(init.headers['x-poll-management-token']).toBe(draft.managementToken)
  expect(JSON.parse(String(init.body))).toMatchObject({ clientRequestId: draft.clientRequestId })
  expect(String(init.body)).not.toContain(draft.managementToken)
})

it('投票前 GET 建立 voter session；服务端要求重建时只重试一次', async () => {
  fetchMock
    .mockResolvedValueOnce(publicPollResponse)
    .mockResolvedValueOnce(errorResponse(409, 'VOTER_SESSION_REQUIRED'))
    .mockResolvedValueOnce(publicPollResponse)
    .mockResolvedValueOnce(voteCreatedResponse)
  await service.vote('poll-1', { optionId: null, comment: '' })
  expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
    '/api/polls/poll-1', '/api/polls/poll-1/votes', '/api/polls/poll-1', '/api/polls/poll-1/votes',
  ])
})
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npm run test:run -- src/features/polls/PollService.spec.ts`

- [ ] **Step 3: 最小实现**

所有调用使用相对同源 URL 与 `credentials: 'same-origin'`。统一解析 `{ error: { code, message } }` 为 `PollServiceError`；网络异常映射为 `offline`，但保留可重试状态。GET 公开投票必须先成功，再允许 POST vote；仅对 `VOTER_SESSION_REQUIRED` 执行一次 GET + POST 重试。

- [ ] **Step 4: 运行测试并确认通过**

Run: `npm run test:run -- src/features/polls/PollService.spec.ts`

### Task 3: 单 MaskEditor 创建队列

**Files:**
- Create: `src/features/polls/pollCreateQueue.ts`
- Test: `src/features/polls/pollCreateQueue.spec.ts`
- Create: `src/views/PollCreateView.vue`
- Test: `src/views/PollCreateView.spec.ts`
- Modify: `src/views/ArchivePlanDetailView.vue`
- Modify: `src/router.ts`

- [ ] **Step 1: 写失败测试**

```ts
it('始终只渲染一个 MaskEditor，并在导出后推进到下一候选', async () => {
  render(PollCreateView, { global: appPlugins })
  await screen.findByText('01 / 03')
  expect(screen.getAllByTestId('mask-editor')).toHaveLength(1)
  await fireEvent.click(screen.getByRole('button', { name: '导出单层遮罩图' }))
  await screen.findByText('02 / 03')
  expect(screen.getAllByTestId('mask-editor')).toHaveLength(1)
})

it('刷新后从第一个未完成候选继续，而不生成新 token 或 uploadId', async () => {
  const restored = await repository.getByPlanId('plan-1')
  expect(restored?.managementToken).toBe(originalToken)
  expect(restored?.options.map(({ uploadId }) => uploadId)).toEqual(originalUploadIds)
})
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npm run test:run -- src/features/polls/pollCreateQueue.spec.ts src/views/PollCreateView.spec.ts`

- [ ] **Step 3: 最小实现**

路由为 `/archive/plans/:id/poll/new`，隐藏底栏。页面顺序固定为体验码 → 18+ 与授权确认 → 创建/恢复本地草稿 → 逐一遮罩 → 逐项上传 → 创建投票。候选 Blob 通过现有 `resolveCandidateImageBlob` 获取；demo 图片使用同源 `fetch` 转 Blob。`MaskEditor` 只实例化一次，`:initial-blob` 随当前索引更新，`@exported` 写入草稿后推进。

- [ ] **Step 4: 运行测试并确认通过**

Run: `npm run test:run -- src/features/polls/pollCreateQueue.spec.ts src/views/PollCreateView.spec.ts`

### Task 4: 公开投票与管理

**Files:**
- Create: `src/views/PublicPollView.vue`
- Test: `src/views/PublicPollView.spec.ts`
- Create: `src/views/PollManageView.vue`
- Test: `src/views/PollManageView.spec.ts`
- Modify: `src/router.ts`

- [ ] **Step 1: 写失败测试**

```ts
it('公开页提供 2～4 个方案和都不合适，短评按纯文本显示', async () => {
  render(PublicPollView, { global: publicPollPlugins })
  expect(await screen.findAllByRole('radio')).toHaveLength(4)
  expect(screen.getByLabelText('短评（可选，最多 60 字）')).toHaveAttribute('maxlength', '60')
  expect(document.querySelector('[v-html]')).toBeNull()
})

it('已投、过期撤销、重复和离线各有不可误解状态', async () => {
  expect(await screen.findByText('这个浏览器已经投过了')).toBeVisible()
  expect(await screen.findByText('投票已结束')).toBeVisible()
  expect(await screen.findByText('网络不可用，尚未计票')).toBeVisible()
})

it('管理页仅从本机草稿读取 token，并可查看结果和撤销', async () => {
  render(PollManageView, { global: managePlugins })
  await screen.findByText('3 票')
  await fireEvent.click(screen.getByRole('button', { name: '撤销并删除投票' }))
  expect(service.revoke).toHaveBeenCalledWith('poll-1', localDraft.managementToken)
})
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npm run test:run -- src/views/PublicPollView.spec.ts src/views/PollManageView.spec.ts`

- [ ] **Step 3: 最小实现**

公开路由 `/p/:id`、管理路由 `/polls/:id/manage` 均隐藏底栏。公开页以图片为主，单选一个方案或“都不合适”，提交后锁定；所有文本使用插值或 `textContent`，禁止 `v-html`。管理页找不到本机 token 时明确说明“只能在创建投票的这台设备管理”，不允许从 URL 输入 token。撤销成功后清除本地图片 Blob，仅保留最小 revoked 记录。

- [ ] **Step 4: 运行测试并确认通过**

Run: `npm run test:run -- src/views/PublicPollView.spec.ts src/views/PollManageView.spec.ts`

### Task 5: 视觉、E2E 与发布前验证

**Files:**
- Modify: `src/styles.css`
- Create: `e2e/polling.spec.ts`

- [ ] **Step 1: 写失败 E2E**

API 使用 Playwright `page.route` 模拟与真实契约相同的状态机，覆盖体验码、三张遮罩图、上传、创建、复制链接、好友 GET、投票、结果、撤销和刷新恢复。另测 upload 503、offline、duplicate、410。

- [ ] **Step 2: 运行 E2E 并确认因页面/行为缺失而失败**

Run: `npm run test:e2e -- e2e/polling.spec.ts`

- [ ] **Step 3: 完成响应式视觉**

移动端 390px 使用单列全幅候选图；桌面端应用壳扩展为 960px，并让候选图与选择区形成左右信息层级。所有按钮至少 45px，保留 `prefers-reduced-motion`，公开页首屏只出现标题、候选与一个提交动作。

- [ ] **Step 4: 完整验证与截图**

Run: `npm run lint && npm run typecheck && npm run test:run && npm run build && npm run test:e2e`

分别在 390×844 和 1280×900 截取创建、公开和管理页；逐张检查溢出、层级、纯文本、焦点与底栏隐藏。

- [ ] **Step 5: 双只读审查后修复 Critical/Important**

审查一：逐条对照后端契约、隐私与失败恢复。审查二：代码质量、安全、无障碍和视觉层级。所有修复继续遵循 RED → GREEN。

- [ ] **Step 6: 仅提交 M4B 前端范围**

提交前确认工作区不包含运行时、缓存、后端、`vercel.json` 或环境密钥。
