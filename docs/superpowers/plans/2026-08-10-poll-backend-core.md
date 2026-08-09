# Poll Backend Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the server-only experience-code, masked-upload, public-poll, voting, management, deletion, and cleanup APIs with a recoverable Neon/Blob state machine.

**Architecture:** Small Web-standard handler factories validate HTTP requests and delegate persistence/blob work through narrow interfaces; production adapters bind Neon serverless SQL and Vercel Blob. PostgreSQL constraints and PL/pgSQL functions own concurrency-sensitive reservations, idempotent poll creation, vote uniqueness, deletion tombstones, and cleanup claims.

**Tech Stack:** Node.js 24.19.0, npm 11.17.0, TypeScript 6, Vitest, `@neondatabase/serverless@1.1.0`, `@vercel/blob@2.7.0`, PostgreSQL.

---

### Task 1: Test/runtime boundary and security primitives

**Files:**
- Modify: `package.json`, `package-lock.json`, `tsconfig.node.json`, `vitest.config.ts`
- Create: `api/_lib/http.ts`, `api/_lib/security.ts`, `api/_lib/config.ts`
- Test: `api/_lib/security.spec.ts`, `api/_lib/http.spec.ts`, `api/_lib/config.spec.ts`

- [ ] Install the two exact production packages from `https://registry.npmjs.org/` and include `api/**/*.ts` in TypeScript, ESLint, and Vitest.
- [ ] Write failing tests for versioned scrypt verification, malformed-hash uniform rejection, signed/expired/tampered cookies, strict same-origin checks, bounded JSON/raw bodies, stable JSON errors, and missing configuration.
- [ ] Run the focused tests and confirm failure is caused by missing modules.
- [ ] Implement minimal Web-standard helpers using async `scrypt`, `timingSafeEqual`, HMAC-SHA256, constant-time comparisons, `no-store`, and no CORS headers.
- [ ] Run focused tests and the existing suite.

### Task 2: PostgreSQL contract and production adapters

**Files:**
- Create: `db/migrations/001_polling.sql`
- Create: `api/_lib/contracts.ts`, `api/_lib/database.ts`, `api/_lib/blob.ts`
- Test: `api/_lib/database-contract.spec.ts`, `api/_lib/neon.integration.spec.ts`

- [ ] Write failing SQL contract tests for required tables, checks, composite foreign keys, uniqueness, advisory-lock quota functions, idempotent poll creation, vote insertion, deletion transition, and bounded cleanup claims.
- [ ] Add a gated real-Neon integration test that skips only when `TEST_DATABASE_URL` is absent.
- [ ] Implement the migration and parameterized Neon adapter without an ORM; add Vercel Blob `put`/`del` adapter with 60-second public cache TTL.
- [ ] Run contract tests; record a real-integration skip honestly when no test database is configured.

### Task 3: Experience-code and masked-upload APIs

**Files:**
- Create: `api/access/verify.ts`, `api/uploads/masked.ts`
- Create: `api/_lib/access.ts`, `api/_lib/uploads.ts`, `api/_lib/runtime.ts`
- Test: `api/access/verify.spec.ts`, `api/uploads/masked.spec.ts`

- [ ] Write failing handler tests covering methods, origin, malformed/incorrect code, 2-hour HttpOnly cookie, tampering/expiry, raw streaming without `Content-Length`, 1,500,000-byte hard cap, JPEG/WebP content/magic agreement, stable `x-upload-id`, SHA-256-bound idempotency, random pathname, per-session pending limit, global cap, and Blob failure reservation recovery.
- [ ] Implement dependency-injected handler factories and production default exports.
- [ ] Ensure uploads never accept a filename/pathname and document that the server cannot prove from pixels that a face was masked.
- [ ] Run focused and aggregate tests.

### Task 4: Poll create/read/manage APIs

**Files:**
- Create: `api/polls.ts`, `api/polls/[id].ts`, `api/polls/[id]/results.ts`
- Create: `api/_lib/polls.ts`
- Test: `api/polls.spec.ts`, `api/polls/[id].spec.ts`, `api/polls/[id]/results.spec.ts`

- [ ] Write failing tests for 2-4 unique ready owned assets, title and demo/reference disclosure, 10 active polls, exact seven-day expiry, client request id idempotency, client-generated management token in `x-poll-management-token` with HMAC binding, public read plus Cookie-derived `viewerHasVoted`, 404/410, management-header verification, result comments, and delete-before-Blob/finalize retry behavior.
- [ ] Implement factories whose database call performs validation and creation atomically; never put management tokens in URLs or storage.
- [ ] Run focused and aggregate tests.

### Task 5: Anonymous vote API

**Files:**
- Create: `api/polls/[id]/votes.ts`, `api/_lib/votes.ts`
- Test: `api/polls/[id]/votes.spec.ts`

- [ ] Write failing tests for a random HttpOnly voter cookie, domain-separated HMAC-only persistence, null (`都不合适`), cross-poll option rejection, concurrent uniqueness conflict, 60/61 Unicode code points, NUL removal, and literal HTML round trip.
- [ ] Implement the minimal vote handler and atomic database call; do not use IP, user agent, or device fingerprinting.
- [ ] Run focused and aggregate tests.

### Task 6: Idempotent cleanup and documented boundaries

**Files:**
- Create: `api/internal/cleanup.ts`, `api/_lib/cleanup.ts`
- Create: `docs/backend/polling.md`, `.env.example`
- Test: `api/internal/cleanup.spec.ts`, `api/security-contract.spec.ts`

- [ ] Write failing tests for missing/wrong cron secret, bounded claims of expired polls and stale assets/delete-pending rows, absent Blob deletion, finalize failures, double execution, tombstone purge, and client/build secret scans.
- [ ] Implement authorization and retry-safe cleanup batches; deletion claims remain recoverable until Blob deletion and database finalization both complete.
- [ ] Document API contracts, deployment variables, image/privacy limits, cookie/browser duplicate-vote limitation, and unverified real-Neon state when applicable.
- [ ] Run all tests and scan source/build for secrets.

### Task 7: Independent review and final verification

**Files:**
- Modify only files required by review findings.

- [ ] Request an independent specification review and a separate code-quality/security review against the approved backend contract.
- [ ] Reproduce every valid finding with a failing test before fixing it, then re-run focused tests.
- [ ] With exact Node/npm, freshly run `npm ci`, lint, typecheck, unit tests, production build, audit, `git diff --check`, SQL-contract tests, and the gated Neon integration test.
- [ ] Stage only this backend scope, inspect the staged diff, commit once, and report the commit SHA, exact verification evidence, and any integration test skipped for lack of `TEST_DATABASE_URL`.
