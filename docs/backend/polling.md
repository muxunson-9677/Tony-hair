# 投票后端边界与接口

这部分只保存遮罩后分享图、投票结构和匿名票数。浏览器中的原图、人脸关键点和可编辑遮罩图层不属于任何接口请求。服务端会检查 JPEG/WebP 声明与文件魔数，但无法仅凭像素证明图片已经遮脸；前端必须先扁平导出，界面也必须明确“遮罩不等于匿名，熟人仍可能识别”。

## 服务端配置

部署时必须提供以下仅服务端环境变量：

- `DATABASE_URL`
- `BLOB_READ_WRITE_TOKEN`
- `ACCESS_CODE_HASH`：`scrypt$v1$N$r$p$saltHex$derivedKeyHex`
- `COOKIE_SIGNING_SECRET`
- `MANAGEMENT_TOKEN_PEPPER`
- `CRON_SECRET`

不要给这些名字添加 `VITE_` 前缀，不要把真实值写进仓库。`TEST_DATABASE_URL` 只允许指向可丢弃测试库；未提供时，真实 Neon 集成测试会明确显示 skipped，SQL 并发行为不能据此声称已经在 Neon 实测。

## API

所有响应均为 `Cache-Control: no-store`，不设置 CORS。POST 和 DELETE 必须携带与请求 URL 精确一致的 `Origin`。

- `POST /api/access/verify`：JSON `{ "code": string }`。验证成功签发 2 小时 `zjf_session`，属性为 `HttpOnly; SameSite=Lax; Path=/`，生产环境另加 `Secure`。错误码 `ACCESS_DENIED` 不区分错误码、畸形输入或畸形 scrypt 配置。
- `POST /api/uploads/masked`：请求体为原始 JPEG 或 WebP，硬上限 1,500,000 bytes。即使没有 `Content-Length` 也按流累计拦截。客户端先在本地持久化稳定随机 `uploadId`，每次通过 `x-upload-id` 发送；服务端返回数据库 `assetId` 和公开分享 URL。相同会话、uploadId、MIME、字节数和 SHA-256 内容可安全重试：`ready` 返回原 asset，`reserved` 复用同一 pathname，`attached` 拒绝；换内容返回 409。pathname 完全由服务端生成，含至少 192-bit 随机量，Blob 缓存 60 秒。
- `POST /api/polls`：JSON `{ "clientRequestId", "title", "options": [{ "assetId", "label", "disclosure" }] }`，2 到 4 个不重复图片；`disclosure` 只能是 `demo` 或 `reference`，供公开页永久标注预制示例。首次请求与重试都必须在 `x-poll-management-token` 发送同一个客户端本地生成的 32-byte base64url token。token 不进入 JSON、URL 或数据库；数据库只保存按 poll ID 分域的 HMAC。相同会话和 `clientRequestId` 的重试只有在原投票 HMAC 验证成功后才返回原 `pollId`。
- `GET /api/polls/:id`：公开读取，无需登录。缺少或无法验证 voter Cookie 时会先签发随机的 `HttpOnly; SameSite=Lax` Cookie；合法 Cookie 会被本地验证并分域 HMAC 后查询，只返回 `viewerHasVoted` 布尔值，不向数据库发送 Cookie 原值。投票状态、选项和 `viewerHasVoted` 在同一条 SQL 快照内读取。过期或已撤销返回 410，不存在返回 404。
- `POST /api/polls/:id/votes`：JSON `{ "optionId": uuid | null, "comment": string }`。`null` 表示“都不合适”。先移除 NUL，再按 Unicode code points 限制 60；文本原样存储并由客户端按纯文本渲染。请求必须携带由公开 GET 建立的有效 `zjf_voter` Cookie；缺少或无效时返回 409 `VOTER_SESSION_REQUIRED`、签发 Cookie 且不计票，客户端应重新 GET 后重试。数据库只保存按 poll ID 分域的 HMAC。唯一约束保证同一 Cookie 并发请求只有一票，但清 Cookie 或换浏览器仍可再次投票；系统不采集 IP、User-Agent 或设备指纹。
- `GET /api/polls/:id/results`：必须带 `x-poll-management-token`。返回票数与非空短评；短评保持纯文本字面值，不返回 voter hash 或任何网络/设备字段。
- `DELETE /api/polls/:id`：必须带相同管理 header。事务先写最小 tombstone 并把图片转为 `delete_pending`，因此随后读取立即为 410；再删 Blob，最后清数据库。Blob 或数据库失败会保留可重试状态。
- `GET /api/internal/cleanup`：必须带 `Authorization: Bearer <CRON_SECRET>`。每次只认领有限批次，处理过期投票、陈旧 `reserved`/`ready`、已有 `delete_pending` 和到期 tombstone。Blob 已不存在视为可继续完成；重复执行安全。

稳定 HTTP 状态包括 400、401、403、404、409、410、413、415、422、500 和 503。错误 JSON 形状为 `{ "error": { "code", "message" } }`。

## 数据状态与配额

`db/migrations/001_polling.sql` 是唯一迁移。并发敏感操作由 PostgreSQL 约束、事务 advisory lock 和 PL/pgSQL 函数完成，而不是“先查再写”：

- 单会话未附着的 `reserved` + `ready` 图片最多 8 张；
- `reserved`、`ready`、`attached`、`delete_pending` 合计最多 `800 * 1024 * 1024` bytes；
- 单会话最多 10 个未过期活动投票；
- `(session_hash, upload_id)` 与 `(session_hash, client_request_id)` 唯一；
- `(poll_id, voter_cookie_hash)` 唯一；
- 组合外键阻止使用另一投票的 option；
- 投票默认严格为创建时间加 7 天。

Blob 上传失败时保留 `reserved`，数据库就绪失败时也不假装成功；清理任务会删除可能存在的随机 pathname。删除失败保留 `delete_pending`。tombstone 只含 poll ID、原因、删除时间和清除时间，不保存评论、Blob URL 或会话。

## 验证

本地默认测试使用依赖注入 fake 覆盖 HTTP、失败恢复和边界；SQL contract 测试检查关键约束与函数。若有可丢弃 Neon 测试库，可设置 `TEST_DATABASE_URL` 后运行：

```powershell
npm run test:run -- api/_lib/neon.integration.spec.ts
```

没有该变量时必须把真实 Neon 集成记录为“未执行”，不能用 fake 或正则 contract 测试替代并发数据库证据。
