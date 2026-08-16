# Hairstyle Library and Editorial Glass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` task by task. Every behavior change starts with an observed failing test and ends with an independent spec review plus code-quality review.

**Goal:** Build a truthful six-style curated catalog, a device-local private reference library with favorites and folders, connect both to haircut plans and barber viewing, retire the in-product public-poll surface, and replace the current shell with a responsive warm editorial-glass experience and original scissors logo.

**Architecture:** Curated styles are versioned TypeScript data backed only by same-origin project assets. They continue to enter plans through the existing `demo_ai` candidate contract and `demoImagePath`; no fourth candidate source is added. Private references, favorites and folders extend the existing Dexie database to v3 through `HairstyleLibraryRepository`; plans keep independent candidate snapshots. `/styles` owns discovery and private-library UX. Poll UI routes and calls are removed from the product while any historical remote cleanup remains a separate server-side operation.

**Toolchain:** Node 24.19.0, npm 11.17.0, Vue 3, TypeScript 6, Pinia, Dexie 4, existing Canvas image preparation, Vue Router, Vitest, Testing Library, Playwright and Vite.

## Shared constraints

- Do not add posts, submissions, comments, public likes, follows, author pages, feeds, rankings or moderation.
- Do not add auth, sync, cloud backup, image upload APIs, third-party image requests, GitHub/Vercel changes or deployment.
- Reuse the six existing project-generated AI adult images; do not scrape, hotlink or duplicate images to fake catalog size.
- Reuse `prepareLocalImage` for private uploads and keep private bytes on device.
- Keep existing archive, brief, privacy-mask, record and demo-try behavior unless this plan explicitly changes an entry point or visual surface.
- After each task: run focused tests, `typecheck`, `lint` where relevant, inspect the scoped diff, request spec review, request quality review, then commit only the listed task files.

---

### Task 0: Retire the public-poll product surface

**Files:**
- Modify: `src/router.ts`
- Modify: `src/views/ArchivePlanDetailView.vue`
- Modify: `src/views/ArchiveProfileView.vue`
- Modify: `src/views/ArchivePollDeletion.spec.ts`
- Modify: `src/features/archive/ArchiveRoutes.spec.ts`
- Modify: `src/App.spec.ts`
- Modify or replace: `e2e/polling.spec.ts`
- Modify only if required by the route removal: `src/features/polls/archivePollDeletion.ts`, its tests and typed mocks

- [ ] **RED:** add tests proving the plan detail has no “发起好友投票” action; `/archive/plans/:id/poll/new`, `/p/:id` and `/polls/:id/manage` resolve to the product not-found/unavailable state; visiting them makes zero `/api/polls` or `/api/uploads/masked` requests.
- [ ] **GREEN:** remove the three poll component imports/routes and the plan-detail entry. Keep dormant backend/history code out of this frontend change. Apply this exact local-draft retirement table in both plan and profile deletion paths: `draft` → discard; `uploading` → discard; `revoked` → discard; `creating` → preserve complete row/token but do not block archive deletion; `active` → preserve complete row/token but do not block archive deletion; `revoking` → preserve complete row/token but do not block archive deletion. The latter three remain in the separate poll database solely for the later server cleanup and are not linked from product UI. Never silently erase the only remote-cleanup credential and never leave archive deletion permanently blocked.
- [ ] **VERIFY:** run `npm run test:run -- src/App.spec.ts src/features/archive/ArchiveRoutes.spec.ts src/views/ArchivePollDeletion.spec.ts` and the replacement no-community E2E.
- [ ] **COMMIT:** `git commit -m "refactor: retire public poll surface"` with an explicit file list.

---

### Task 1: Curated catalog as the single metadata source

**Files:**
- Create: `src/features/hairstyle-library/types.ts`
- Create: `src/features/hairstyle-library/curatedCatalog.ts`
- Create: `src/features/hairstyle-library/curatedCatalog.spec.ts`
- Modify: `src/features/try-on/DemoProvider.ts`
- Modify: `src/features/try-on/DemoProvider.spec.ts`
- Modify: `src/features/archive/demoCandidates.ts`
- Create: `docs/design/curated-catalog.md`

- [ ] **RED:** test exactly six active entries; unique stable IDs, images and aliases; no HTTP URLs or `*-base.webp`; complete AI disclosure, feasibility, maintenance, tradeoffs and all barber-guide fields; search/filter behavior; the closed `StyleGoal` union.

```ts
expect(curatedHairstyles).toHaveLength(6)
expect(new Set(curatedHairstyles.map(({ id }) => id)).size).toBe(6)
expect(curatedHairstyles.every(({ coverImage }) => (
  coverImage.startsWith('/demo/') && !coverImage.includes('-base.')
))).toBe(true)
```

- [ ] **GREEN:** define the catalog using the six existing option images. Keep persona demographics/base images in `DemoProvider`, but map persona options and archive demo choices from catalog IDs without duplicating catalog copy.
- [ ] **VERIFY:** run the catalog, DemoProvider and existing archive candidate-source tests; confirm three personas still expose two options each.
- [ ] **DOCUMENT:** record project-generated AI provenance, 4:5 front-view-only limitation, and prohibition on claiming side/back coverage.
- [ ] **COMMIT:** `git commit -m "feat: define curated hairstyle catalog"`.

---

### Task 2: Dexie v3 private-library repository

**Files:**
- Modify: `src/features/archive/ArchiveRepository.ts`
- Modify: `src/features/archive/ArchiveRepository.spec.ts`
- Create: `src/features/hairstyle-library/HairstyleLibraryRepository.ts`
- Create: `src/features/hairstyle-library/HairstyleLibraryRepository.spec.ts`

- [ ] **RED:** test v3 migration, valid reference persistence and Blob reopen, real SHA-256 calculation from prepared Blob bytes, caller-supplied/mismatched fingerprint rejection at the write boundary, duplicate fingerprint, invalid MIME/bytes/dimensions/time, text limits, normalized unique tags/folder names, idempotent favorite, and storage error mapping.
- [ ] **RED transactions:** prove `deletePrivateReference` atomically deletes its favorite only; `deleteFolder` atomically moves its favorites to `folderId = null`; `replaceReferenceImage` computes a new SHA-256 and atomically updates image/metadata, while duplicate/invalid/hash-failure paths leave every old field and byte unchanged.
- [ ] **RED migration fidelity:** seed v1/v2 data and prove old photo/candidate Blob bytes or hashes plus candidate/barber-brief fields remain deep-equal after v3 open. Plan-mode normalization is implemented atomically with all typed construction sites in Task 6, not as a temporarily optional field here.
- [ ] **GREEN schema:** add only:

```ts
privateReferences: 'id, &fingerprint, updatedAt'
favoriteFolders: 'id, &name, updatedAt'
favorites: 'id, folderId, &itemKey, updatedAt'
```

- [ ] **GREEN repository:** implement the explicit list/get/save/replace/delete reference, list/toggle/move favorite and list/save/delete folder port. Write DTOs omit `fingerprint`; the repository derives it from the prepared Blob. Do not copy historical candidate images during upgrade.
- [ ] **VERIFY:** focused repository suites, full archive suite, `npm run typecheck`, `npm run lint`.
- [ ] **COMMIT:** `git commit -m "feat: persist private hairstyle library"`.

---

### Task 3: Library store and plan-candidate adapters

**Files:**
- Create: `src/features/hairstyle-library/libraryStore.ts`
- Create: `src/features/hairstyle-library/libraryStore.spec.ts`
- Create: `src/features/hairstyle-library/libraryCandidates.ts`
- Create: `src/features/hairstyle-library/libraryCandidates.spec.ts`
- Modify only as required: existing archive store/port test doubles

- [ ] **RED store:** test single-flight load, older-load suppression, stable state on failed reload, no-profile use, reference actions, folder actions and idempotent favorite toggles.

```ts
expect(store.isFavorite('curated_style:lin-bob')).toBe(false)
await store.toggleFavorite({ itemType: 'curated_style', itemId: 'lin-bob' })
expect(store.isFavorite('curated_style:lin-bob')).toBe(true)
```

- [ ] **RED adapters:** catalog ID resolves to the existing `demo_ai` candidate shape and exact catalog `coverImage`; private reference resolves to `user_reference` with copied prepared Blob metadata. The catalog-pointer resolver rejects invalid/retired IDs before Candidate construction; the existing `savePlanWithCandidates` boundary separately rejects malformed `demo_ai` paths and hybrid candidate fields.

```ts
expect(catalogToCandidateDraft(style).source).toBe('demo_ai')
expect(catalogToCandidateDraft(style).demoImagePath).toBe(style.coverImage)
expect(privateReferenceToCandidateDraft(reference).referenceImage).toBe(reference.image)
```

- [ ] **GREEN:** keep the library store independent from `archiveStore`; use operation generations; do not change the `Candidate.source` union. Expose a resolver that revalidates catalog/private pointers rather than trusting route query text.
- [ ] **VERIFY:** focused library/store/adapter tests, full candidate-source and repository suites, typecheck and lint.
- [ ] **COMMIT:** `git commit -m "feat: connect hairstyle library data"`.

---

### Task 4: Required haircut-plan mode contract

**Files:**
- Modify: `src/features/archive/types.ts`
- Modify: `src/features/archive/ArchiveRepository.ts`
- Modify: `src/features/archive/ArchiveRepository.spec.ts`
- Modify: `src/features/archive/archiveStore.ts`
- Modify: `src/features/archive/archiveStore.spec.ts`
- Modify: `src/features/archive/ArchiveRoutes.spec.ts`
- Modify: `src/views/ArchivePollDeletion.spec.ts`
- Modify: `src/views/PollCreateView.spec.ts`
- Modify any additional strongly typed `HaircutPlan` construction site discovered by `rg -l "HaircutPlan" src e2e`, but no unrelated behavior

- [ ] **RED:** add required `HaircutPlan.mode: 'exploration' | 'repeat'` and table tests that legacy rows without the field read as `exploration`; invalid runtime modes are rejected. Observe typecheck failures at every production constructor and typed fixture before updating them.
- [ ] **GREEN:** update `HaircutPlanDraft`, every production constructor and every strongly typed fixture in one atomic task. Ordinary plan creation writes `exploration`. A Dexie reading normalization supplies `exploration` for legacy rows without rewriting their other fields or Blob bytes. Do not make `mode` optional.
- [ ] **BOUNDARY:** keep the existing 2～4 candidate rule for both modes in this contract-only task; no reachable UI creates `repeat` yet. Task 7 adds the StandardStyle-backed one-candidate repeat rule after the type is available.
- [ ] **VERIFY:** full archive and affected poll-fixture unit tests, typecheck and lint.
- [ ] **COMMIT:** `git commit -m "refactor: add haircut plan modes"`.

---

### Task 5: Brand shell plus curated discovery and favorites

**Files:**
- Create: `public/brand/zajianfa-scissors-master.png`
- Create: `public/brand/zajianfa-scissors-512.png`
- Create: `public/brand/zajianfa-scissors-touch-180.png`
- Create: `public/brand/zajianfa-scissors-32.png`
- Create: `public/brand/zajianfa-scissors-16.png`
- Create: `src/features/hairstyle-library/components/HairstyleTile.vue`
- Create: `src/features/hairstyle-library/components/StyleFilterBar.vue`
- Create: `src/features/hairstyle-library/components/StyleActionDock.vue`
- Create: `src/views/HairstyleLibraryView.vue`
- Create: `src/views/HairstyleDetailView.vue`
- Create: `src/features/hairstyle-library/LibraryRoutes.spec.ts`
- Modify: `index.html`
- Modify: `src/router.ts`
- Modify: `src/App.vue`
- Modify: `src/components/BottomNav.vue`
- Modify: `src/views/HomeView.vue`
- Create: `src/features/home/resolveHomeAction.ts`
- Create: `src/features/home/resolveHomeAction.spec.ts`
- Modify: `src/views/MeView.vue`
- Modify: `src/App.spec.ts`
- Modify: `src/styles.css`
- Modify: `docs/design/visual-thesis.md`

- [ ] **RED shell/home:** test visible scissors logo with `alt=""` beside visible brand text, route title/focus, `首页 / 找发型 / 档案 / 我的`, and compact actionable “我的”. Add pure `resolveHomeAction` table tests using local calendar days and `draft|ready` as active states: record age 1–6 days missing `after_wash`, or 7–14 days missing `day_7` → record edit; multiple active plans → archive choice; one ready plan dated no later than today+3 days (including overdue) → brief; one exploration plan below two candidates → `/styles`; one repeat plan without a candidate → its edit route for StandardStyle selection; mode-valid candidate counts → brief selection/open based on brief presence; active StandardStyle with no plan → new plan; profiled/no plan → `/styles`; no profile → profile. Assert exact labels/routes and priority collisions.
- [ ] **RED catalog UI:** cover `/styles`, `/styles/favorites`, `/styles/catalog/:id`, six results, text/goal/maintenance filters, resettable empty state, favorite `aria-pressed`, reload-backed state, folder create/rename/delete and favorite move. The new navigation and its destination must land in the same task—never commit a `/styles` link without the route.
- [ ] **ASSET:** process
  `E:/AgentData/Codex/generated_images/019fe730-3190-7de2-a2c1-c18ab0893729/exec-a8cb2b40-fef6-4de1-a3ad-3131108d14b5.png`
  with the installed chroma-key helper. Inspect alpha/despill, then derive transparent 1024/512 masters, an opaque warm-ivory 180px touch icon with safe area, and optically simplified 32/16 favicons. Do not substitute an unrelated icon.
- [ ] **GREEN:** rebuild the shell as a true responsive product, not a 520px desktop phone strip, and ship the real `/styles` destination with it. Use warm ivory, graphite and one caramel accent. Glass is limited to navigation and transient controls, with solid fallbacks; it must not cover content cards, forms, archive rows, communication cards or privacy canvas. Catalog mobile uses an image-first two-column flow; desktop uses a real sticky filter region and at least three columns. Tiles show only name, maintenance and one reality cue. Detail shows disclosure, suitability, maintenance, tradeoffs and barber guide. No counts, authors or social wording.
- [ ] **ERRORS:** invalid/retired IDs render an honest terminal state; never substitute a different style.
- [ ] **FIRST VISUAL CHECKPOINT:** at settled 390×844 and 1440×900, review the shell, stateful home, catalog, catalog detail and favorites before continuing. Wait for fonts, image decode and route transition completion. On mobile show two complete items plus a visible continuation cue, not compressed “three cards at any cost”.
- [ ] **VERIFY:** App/archive/catalog route tests, keyboard/focus checks, typecheck, lint and build; use Canvas/image inspection for transparent master corners/holes and visual checks for 16/32/180 sizes.
- [ ] **COMMIT:** `git commit -m "feat: add editorial hairstyle discovery"`.

---

### Task 6: Private reference upload, detail and barber view

**Files:**
- Create: `src/views/HairstyleReferenceFormView.vue`
- Create: `src/views/HairstyleReferenceDetailView.vue`
- Create: `src/views/HairstyleShowView.vue`
- Modify: `src/views/HairstyleLibraryView.vue`
- Modify: `src/features/hairstyle-library/LibraryRoutes.spec.ts`
- Modify: `src/router.ts`
- Modify: `src/styles.css`

- [ ] **RED image safety:** inject `prepareLocalImage`; prove only the prepared Blob/metadata is stored, original filename/bytes are absent, preview URL derives from the prepared Blob and is revoked on replace/clear/unmount, failed selection can be cleared, saving locks input/form, and preparation failure writes nothing.
- [ ] **RED behavior:** edit preserves image bytes, replacement obeys fingerprint atomicity, tags normalize to eight, delete removes its favorite but not a fake plan snapshot, and no-profile users can upload/favorite.
- [ ] **RED barber views:** private mode shows only processed image/name/user notes; curated mode shows every guide field, AI disclosure and front-view limitation. Both hide global bottom navigation.
- [ ] **GREEN:** reuse existing image preparation and Object URL race discipline. Do not add upload APIs or infer haircut instructions from a lone user image.
- [ ] **SECOND VISUAL CHECKPOINT:** review private empty, processing, saved, validation-error and storage-error states plus both barber views at 390×844 and 1440×900 before plan integration.
- [ ] **VERIFY:** LibraryRoutes and image-preparation regressions, typecheck, lint and build.
- [ ] **COMMIT:** `git commit -m "feat: add private hairstyle references"`.

---

### Task 7: Add catalog/private items to plans and briefs

**Files:**
- Modify: `src/features/archive/types.ts`
- Modify: `src/features/archive/ArchiveRepository.ts`
- Modify: `src/features/archive/ArchiveRepository.spec.ts`
- Modify: `src/features/archive/archiveStore.ts`
- Modify: `src/features/archive/archiveStore.spec.ts`
- Modify: `src/views/ArchivePlanFormView.vue`
- Modify: `src/views/ArchiveProfileView.vue`
- Modify: `src/views/ArchivePlanDetailView.vue`
- Modify: `src/views/ArchiveBriefView.vue`
- Create: `src/features/archive/archiveReturnPath.ts`
- Create: `src/features/archive/archiveReturnPath.spec.ts`
- Modify: `src/features/archive/ArchiveRoutes.spec.ts`
- Modify: `src/features/archive/briefExport.spec.ts`

- [ ] **RED pointers:** `/archive/plans/new?add=catalog:lin-bob` resolves the catalog entry into the existing `demo_ai` candidate; `add=private_reference:<id>` resolves the local reference into a `user_reference` snapshot. Malformed, missing and retired pointers add nothing and display an alert.
- [ ] **RED no-profile continuation:** both valid pointer kinds redirect to `/archive/profile?next=<encoded allowlisted path>` without a partial plan; profile save returns to the exact local plan URL and consumes the pointer once. Reject absolute/protocol-relative URLs, unrelated paths, duplicate params, malformed and retired IDs so this cannot become an open redirect.
- [ ] **RED plan rules:** exploration plans accept mixed 2–4 candidates. On creation, candidate replacement or mode conversion, a one-candidate repeat plan is legal only when that candidate is `past_record` and its `pastRecordId` resolves to an active `StandardStyle` for the same profile; catalog, upload and non-standard history singletons remain rejected. A repeat plan with no candidate opens its edit page for StandardStyle selection; if none remain active, the form offers an explicit “转为探索计划” action and never silently redirects to `/styles`. After a legal repeat save, detail, communication card and export use its candidate snapshot: disabling/deleting the source StandardStyle or record must not break them, while a later source edit revalidates. Cover Repository, Store, form, detail, brief and export. Catalog candidates persist existing demo ID/path fields only; private candidates copy prepared Blob metadata. Deleting a private source must likewise leave snapshots intact.
- [ ] **GREEN:** hydrate archive/library before consuming each pointer exactly once; preserve candidate IDs during edit; keep existing safe-edit and source validation behavior. Revoke every private Blob Object URL on replacement/unmount.
- [ ] **VERIFY:** full archive tests, brief export, typecheck, lint and build.
- [ ] **COMMIT:** `git commit -m "feat: add hairstyle library to haircut plans"`.

---

### Task 8: Full E2E, visual, privacy and release verification

**Files:**
- Create: `e2e/hairstyle-library.spec.ts`
- Create or modify: `e2e/no-community.spec.ts`
- Modify: `e2e/navigation.spec.ts`
- Modify: `e2e/archive.spec.ts`
- Modify: `e2e/privacy-mask.spec.ts`
- Modify: `e2e/barber-brief.spec.ts`
- Modify: `playwright.config.ts`
- Modify `.github/workflows/ci.yml` only if existing globs do not already collect the new tests

- [ ] **E2E RED:** cover catalog browse/search/filter/reset; favorite/folder/reload; real browser-generated JPEG private upload/edit/favorite; add catalog + private reference to an exploration plan; open plan/brief; delete source reference and prove snapshot remains; open both barber views; separately cover one-candidate repeat plan.
- [ ] **PRIVACY:** record every request and assert no private source bytes, EXIF marker, Blob, face keypoints or new write request leaves the browser; all catalog images are same-origin. Assert retired poll URLs make no poll/upload request and render no interaction UI.
- [ ] **VISUAL:** settled screenshots for shell, home states, catalog, detail, favorites, reference empty/processing/error/saved and barber view at 390×844 and 1440×900. Also check 360×800, 430×932 and 1280×900 overflow. Wait for `document.fonts.ready`, all relevant `img.decode()` calls and route-transition detachment.
- [ ] **A11Y:** ordinary text contrast 4.5:1; controls/focus/non-text graphics 3:1; 44px rounded touch targets; visible focus; `aria-pressed`; 200% text; reduced motion/transparency; no `backdrop-filter` fallback; bottom safe area and action dock never obscure final content.
- [ ] **LOGO:** sample transparent master corner/handle-hole alpha through Canvas, inspect warm/dark backgrounds and favicon/touch-icon output.
- [ ] **ISOLATED TEST SERVER:** make `PLAYWRIGHT_PORT` select a test-only preview port while `reuseExistingServer` stays false. Derive all E2E same-origin assertions from the configured base URL instead of hard-coded `4173`; run this worktree on a free port such as 4317 and do not stop or reuse the user’s existing 4173 preview.
- [ ] **FOCUSED GREEN:** run new hairstyle, no-community, navigation and archive E2E files and inspect every fresh screenshot.
- [ ] **FRESH RELEASE MATRIX:** with exact Node/npm, run `npm ci`, MediaPipe asset verification, lint, typecheck, all unit tests, production build, all Playwright tests, `npm audit --audit-level=high`, secret/network scans, `git diff --check` and a scoped diff review.
- [ ] **FINAL REVIEWS:** independent spec and quality/security reviews must both report zero Critical/Important; fix findings through RED→GREEN and re-review.
- [ ] **COMMIT:** `git commit -m "test: verify hairstyle library experience"`; leave the branch clean. Do not push or deploy.

## Completion definition

- The user can browse six honest curated styles without a profile, privately upload references, organize private favorites, add valid items to plans and show clear views to a barber.
- The home experience remains state-driven; exploration and repeat candidate counts both remain valid.
- No in-product post/comment/like/follow/poll interaction or public poll route remains reachable.
- Private image bytes remain on device and all legacy archive/brief/photo bytes survive Dexie v3 unchanged.
- The warm editorial-glass shell passes real mobile/desktop visual review and does not degrade archive, privacy or brief clarity.
- The scissors logo is integrated at correct transparent, favicon and touch-icon variants.
- Exact-toolchain quality gates and full browser tests pass; worktree is clean; nothing has been pushed or deployed.
