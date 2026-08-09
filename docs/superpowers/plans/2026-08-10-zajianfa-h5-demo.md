# “咋剪发”H5 演示实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task-by-task. Follow TDD and review each milestone for specification compliance and code quality.

**Goal:** 交付可在手机浏览器真实使用的“咋剪发”高完成度 H5、私有 GitHub 仓库和 Vercel 演示地址。

**Architecture:** Vue 3 + TypeScript + Vite 客户端使用 Dexie/IndexedDB 保存私人档案；本地图片管线完成压缩、去元数据和遮罩导出。Vercel Functions、Vercel Blob 与 Neon Postgres 仅承载体验码、遮罩分享图和匿名投票。

**Tech Stack:** Node.js 24、npm、Vue 3、TypeScript、Vite、Vue Router、Pinia、Dexie、MediaPipe Tasks Vision、Vitest、Testing Library、Playwright、Vercel Functions、Vercel Blob、Neon Postgres。

---

## Milestone 1：工程基线与视觉外壳

- [ ] 初始化 Vue/Vite/TypeScript、质量脚本、Node 24 约束和 GitHub Actions。
- [ ] 建立设计令牌、四栏导航、首页双状态、响应式 App 外壳和无障碍基础。
- [ ] 创建三位成年合成人物及预生成发型示例，完成有永久“示例体验”标记的 AI 页面。
- [ ] 为路由、导航、示例数据和关键页面渲染先写失败测试，再实现并通过。

## Milestone 2：本地档案与沟通卡

- [ ] 定义 `HairProfile`、`HaircutPlan`、`Candidate`、`BarberBrief`、`HaircutRecord`、`HaircutPhoto`、`AvoidRule`、`StandardStyle`。
- [ ] 用 Dexie 实现 `ArchiveRepository` 事务和本地图片 Blob 存储。
- [ ] 实现档案增删改查、候选比较、复刻/避雷和首页历史状态。
- [ ] 实现沟通卡编辑、图片导出和打印。
- [ ] 每个行为按 RED-GREEN-REFACTOR 开发并补齐刷新持久化、失败写入和空间不足测试。

## Milestone 3：隐私遮罩

- [ ] 实现本地图片方向纠正、长边限制、压缩、Canvas 重绘和 EXIF 清除。
- [ ] 在 Worker 中按需加载 MediaPipe Face Landmarker，输出初始遮罩框；多人或检测失败进入明确回退状态。
- [ ] 实现拖动、缩放、旋转、样式切换和扁平 WebP/JPEG 导出。
- [ ] 验证原图、人脸关键点和编辑图层均不进入网络请求。

## Milestone 4：体验码与公网投票

- [ ] 建立 Neon schema、Vercel Blob 客户端上传令牌和服务端环境变量校验。
- [ ] 实现体验码换取 HttpOnly/SameSite 会话、2～4 选项投票创建、公开读取、匿名投票、结果查看和撤销。
- [ ] 对 `(poll_id, voter_cookie_hash)` 建唯一约束，管理令牌只存哈希，所有短评按纯文本处理。
- [ ] 实现 7 天过期、每日幂等清理、1.5MB 单图、10 个活动投票和 800MB 总量保护。
- [ ] 覆盖无权限、重复投票、过期、撤销、上传失败与重复清理测试。

## Milestone 5：集成、评审与发布

- [ ] 跑通体验码 → 建档 → 候选 → 沟通卡 → 遮罩 → 投票 → 结果/撤销 → 剪后记录 → 复刻/避雷。
- [ ] 在 360/390/430px、桌面、键盘、字体放大、减少动态效果和主流浏览器下验证。
- [ ] 完成规格评审、代码质量评审、隐私网络审计、lint、类型检查、单测、构建和 Playwright。
- [ ] 创建 `muxunson-9677/zajianfa` 私有仓库，连接 Vercel `zajianfa`，配置 Neon/Blob/环境变量并验证生产链接。

## Completion Criteria

- 所有真实功能可用，AI 示例从不被误称为真实生成。
- 原始人脸照片和关键点没有远端传输证据。
- 所有自动检查通过，生产地址完成真实跨设备投票。
- Git 工作区干净，外部服务保持免费额度且未启用自动付费。
