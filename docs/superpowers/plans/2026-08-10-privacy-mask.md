# Privacy Mask Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a local-only privacy mask workflow that prepares an authorized adult's photo, detects a single face inside an isolated worker, supports deliberate manual adjustment, and exports one flattened image without uploading source pixels or face data.

**Architecture:** A small `src/features/privacy/` boundary owns normalized geometry, opaque mask drawing, flattened export, and a generation-aware worker client. The worker lazily loads version-pinned same-origin MediaPipe assets and only returns `none`, `single` with an initial transform, `multiple`, or a stable error code; the Vue page owns interaction state and never allows a multiple-face image to reach export.

**Tech Stack:** Vue 3, TypeScript, Vite, MediaPipe Tasks Vision 1.0.1, Web Worker, Canvas, Vitest, Playwright.

---

## Visual direction

- **Visual thesis:** A sober darkroom workbench: one large image, warm-black opaque material, paper-white controls, and warning brown reserved for privacy boundaries.
- **Content plan:** authorization gate; photo/detection state; full-width working canvas; adjustment inspector; flattened local export.
- **Interaction thesis:** the selected photo reveals into the canvas; direct drag and keyboard nudging move the mask; reduced-motion users receive state changes without transition.

### Task 1: Pin and verify same-origin inference assets

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `public/mediapipe/1.0.1/wasm/*`
- Create: `public/mediapipe/models/face-landmarker-float16-v1.task`
- Create: `scripts/verify-mediapipe-assets.mjs`
- Create: `docs/privacy/mediapipe-assets.md`

- [x] Install exact `@mediapipe/tasks-vision@1.0.1` with Node 24/npm 11.
- [x] Copy every published WASM runtime file without renaming and download the versioned official model URL.
- [x] Record byte sizes and SHA-256 values, then make `node scripts/verify-mediapipe-assets.mjs` fail on any missing, changed, or unexpected runtime asset.

### Task 2: Define tested geometry and flattened output

**Files:**
- Create: `src/features/privacy/types.ts`
- Create: `src/features/privacy/maskGeometry.ts`
- Create: `src/features/privacy/maskGeometry.spec.ts`
- Create: `src/features/privacy/flattenMask.ts`
- Create: `src/features/privacy/flattenMask.spec.ts`
- Create: `src/features/privacy/index.ts`

- [x] Write RED tests for clamped normalized transforms, landmark-to-initial-mask geometry, three opaque styles, and public result data that excludes transform/source/layers/face data.
- [x] Implement the smallest geometry and canvas draw boundary; draw at natural image dimensions and encode WebP before JPEG.
- [x] Write RED tests for quality/dimension reduction and the 1.5MB limit, then implement bounded retries by passing the flattened first-generation image through the existing local image preparation pipeline.

### Task 3: Isolate MediaPipe behind a generation-aware worker client

**Files:**
- Create: `src/features/privacy/faceLandmarker.protocol.ts`
- Create: `src/features/privacy/faceLandmarker.protocol.spec.ts`
- Create: `src/features/privacy/faceLandmarker.worker.ts`
- Create: `src/features/privacy/MaskEngine.ts`
- Create: `src/features/privacy/MaskEngine.spec.ts`

- [x] Write RED protocol tests that reject serialized landmarks, blendshapes, matrices, extra fields, stale generations, and malformed worker responses.
- [x] Implement lazy same-origin `FilesetResolver`, same-origin model fetch into `modelAssetBuffer`, `IMAGE` mode, `numFaces: 2`, and disabled optional outputs.
- [x] Convert worker-local landmarks immediately into a normalized transform; return only stable outcome contracts; always close the transferred bitmap and expose explicit worker disposal.
- [x] Write RED/GREEN tests for no-face fallback, single-face confirmation, multiple-face hard block, slow-detection manual escape, stale generation suppression, error fallback, and disposal.

### Task 4: Build the real privacy editor and route

**Files:**
- Create: `src/views/PrivacyMaskView.vue`
- Create: `src/views/PrivacyMaskView.spec.ts`
- Modify: `src/views/MeView.vue`
- Modify: `src/router.ts`
- Modify: `src/styles.css`

- [x] Write RED component tests for the 18+/authorization gate, prepare-before-detect order, explicit initial-mask confirmation, clear manual fallback, multiple hard block, race-safe replacement, and local download.
- [x] Implement a large canvas editor with drag, width/height/rotation ranges, four 45px nudge buttons, keyboard arrows, and three fully opaque mask styles.
- [x] Keep the exact copy boundaries visible: local-only handling, automatic placement needs confirmation, and masking does not promise anonymity from familiar people.
- [x] Add the `/privacy/mask` route and a functional entry from “我的”; clear every object URL, bitmap, worker, and in-flight generation on replacement/unmount.

### Task 5: Apply strict CSP in preview and Vercel

**Files:**
- Modify: `vite.config.ts`
- Create: `vercel.json`
- Test: `src/App.spec.ts`

- [x] Add the exact approved CSP to Vite preview and a matching all-response Vercel header without third-party runtime connections.
- [x] Verify the document and worker chunk receive CSP and that strict CSP failure moves the UI to manual mode instead of broadening policy.

### Task 6: Real-browser privacy, inference, accessibility, and visual acceptance

**Files:**
- Create: `e2e/privacy-mask.spec.ts`

- [x] Use a same-origin single-person demo image and confirm no MediaPipe request occurs before selection, then model/WASM same-origin GETs begin only after detection.
- [x] Confirm the real worker returns `single` without cross-boundary face data; use a generated same-origin two-person composition to prove `multiple` blocks manual/export.
- [x] Prove every request body excludes a unique source marker, there are no third-party/API/write requests, and flattened output is <=1.5MB without EXIF/source marker.
- [x] Exercise explicit manual fallback, keyboard controls, 360/390/430/desktop layouts, reduced motion, and capture visual evidence for manual inspection.
- [x] Run two independent read-only reviews; fix all Critical/Important findings with failing tests first.
- [x] Run fresh exact Node 24/npm 11 lint, typecheck, unit, build, E2E, audit, asset hashes, diff checks; explicitly stage and commit only M3C files.
