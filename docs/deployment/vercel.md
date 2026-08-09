# Vercel 部署契约

## 运行时与构建

- `package.json`、GitHub Actions 和本地验收固定使用 Node.js `24.19.0` 与 npm `11.17.0`。
- Vercel 只接受 Node 主版本选择，因此云端项目实际运行在 Node `24.x`，不能承诺精确到 `24.19.0`。每次升级 Node 24 小版本后都应重新执行完整验收。
- 推送时 CI 依次执行 MediaPipe 资产校验、lint、类型检查、单元测试和生产构建。Playwright 只在拉取请求和 `main` 分支运行，以控制私有仓库的免费 Actions 用量。

## 路由边界

- `api/**/*.ts` 中的七个入口由 Vercel Node Functions 构建。
- `.vercelignore` 排除所有 `**/*.spec.ts`，避免测试文件被发布成公网函数；它也显式排除 `.env` 与 `.env.*`，只放行无密钥的 `.env.example`。
- SPA fallback 只匹配非 `/api` 路径；未知 API 必须返回 404，不能落到 `index.html`。
- CSP 对静态页面和 API 响应统一生效，策略值由 `src/security/csp.ts` 与配置契约测试共同锁定。

## 每日清理

`vercel.json` 每天 UTC 03:00 请求一次 `/api/internal/cleanup`。当项目配置了 `CRON_SECRET` 时，Vercel Cron 会发送 `Authorization: Bearer <CRON_SECRET>`；处理器使用常量时间比较拒绝缺失或错误的凭据。任务是幂等的，不依赖精确到分钟的触发时间。

## 本地部署验收

只有获准接触项目设置的维护者才能在被忽略的 `.vercel/` 中执行 `vercel link` 与 `vercel pull`。不要查看、打印或提交生成的环境文件。`vercel build --target preview` 的验收标准是：

1. 静态 Vite 构建成功；
2. 输出包含七个真实 API Function，且不含任何 `*.spec.ts`；
3. 输出配置包含每日 cleanup Cron；
4. 输出路由先走文件系统，SPA fallback 排除 `/api` 与 `/api/**`。

真实 Neon 行为只允许在可丢弃测试库或已配置的预览环境中验证；无数据库连接时，本地打包通过不等同于数据库集成通过。
