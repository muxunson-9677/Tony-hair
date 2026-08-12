# Personal Archive Finish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the personal archive, haircut record and tactile mobile experience using existing local data.

**Architecture:** Add pure derived presentation helpers and small view-level composition changes. Keep repositories, database schema and privacy boundaries unchanged.

**Tech Stack:** Vue 3, TypeScript, Dexie, Vitest, Playwright, existing tactile directives and Apple-light CSS.

---

### Task 1: Personal archive summary

**Files:**
- Create: `src/features/archive/profileExperience.ts`
- Create: `src/features/archive/profileExperience.spec.ts`
- Modify: `src/views/ArchiveView.vue`
- Modify: `src/features/archive/ArchiveRoutes.spec.ts`

- [x] Write failing table tests for presentation labels, missing photo angles and unknown facts.
- [x] Run the focused tests and confirm RED.
- [x] Implement pure derived helpers and render the personalised summary/photo-wall status.
- [x] Run focused tests and confirm GREEN.

### Task 2: Short record path and discoverable salon

**Files:**
- Modify: `src/views/ArchiveRecordFormView.vue`
- Modify: `src/features/archive/ArchiveRoutes.spec.ts`

- [x] Add failing tests for the two optional disclosures and before/after-only inputs.
- [x] Split shop/location/barber from deeper optional metadata without changing saved fields.
- [x] Verify saved records preserve all existing fields and legacy photos.

### Task 3: Physical interaction and responsive finish

**Files:**
- Modify: `src/views/ArchiveView.vue`
- Modify: `src/views/ArchiveRecordFormView.vue`
- Modify: `src/views/ArchiveRecordDetailView.vue`
- Modify: `src/styles/apple-light-pages.css`
- Modify: `e2e/archive.spec.ts`

- [x] Add failing interaction/viewport assertions for tactile controls, 44px targets and mobile fit.
- [x] Add tactile behavior only to real controls and refine card depth/photo geometry.
- [x] Run focused E2E at 360/390/430px and inspect fresh screenshots.

### Task 4: Verification

- [x] Run lint, typecheck, unit tests, build, full Playwright and audit.
- [x] Inspect the staged diff and secret/network boundaries.
- [x] Commit and push only after every fresh check passes.
