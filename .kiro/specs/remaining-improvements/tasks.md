gre# Implementation Plan: Remaining Improvements

## Overview

This plan implements 7 improvements across three tracks: UI enhancements (Regenerate Script button, always-visible Replace button, TopicStep verification), codebase architecture (server-render module split, shared rendering logic), and data management (concurrent project support, project versioning). Each task builds incrementally, with tests validating correctness at each phase.

## Tasks

- [x] 1. Add Regenerate Script button to ScriptStep
  - [x] 1.1 Add `onRegenerate` prop to ScriptStep and render the button
    - Add `onRegenerate?: () => void` to `ScriptStepProps` interface in `src/components/ScriptStep.tsx`
    - Import `RefreshCw` from lucide-react
    - When `status === 'complete'` and `onRegenerate` is provided, render a "Regenerate Script" button in the header area with `RefreshCw` icon
    - Button has `aria-label="Regenerate script"` and is keyboard-focusable
    - Button is disabled when `status === 'processing'`
    - _Requirements: 1.1, 1.3, 1.5, 1.6_
  - [x] 1.2 Wire `onRegenerate` in App.tsx to call `generateScript`
    - Pass `onRegenerate={() => generateScript(topicConfig)}` to ScriptStep in `src/App.tsx`
    - Verify that calling `generateScript` resets downstream steps (media, narration, ai_edit, assembly, preview) to idle
    - _Requirements: 1.2, 1.4_
  - [ ]* 1.3 Write unit tests for ScriptStep regenerate button
    - Test button renders only when `status === 'complete'` and `onRegenerate` is provided
    - Test button calls `onRegenerate` on click
    - Test button is disabled when `status === 'processing'`
    - Test button does not render when `onRegenerate` is undefined
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 1.6_

- [x] 2. Make MediaStep Replace button always visible
  - [x] 2.1 Add always-visible Replace button to MediaStep card body
    - In `src/components/MediaStep.tsx`, the "Re-harvest" text button in the card metadata area already exists and is always visible — verify it has proper accessible labeling
    - Ensure the button text reads "Replace" (or keep "Re-harvest" if consistent with existing UX) and is clearly visible without hover
    - Add `aria-label` with segment context to the always-visible button
    - Keep the existing hover overlay button as a secondary interaction point
    - _Requirements: 2.1, 2.6_
  - [ ]* 2.2 Write unit tests for MediaStep replace button visibility
    - Test that the Replace/Re-harvest button is rendered in the DOM without hover interaction
    - Test that clicking the button calls `onReplace` with the correct asset ID
    - Test loading state shows spinner and disables button for the specific card
    - Test error state displays inline error message on the affected card
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

- [x] 3. Verify TopicStep AI suggestion loading states
  - [ ]* 3.1 Write unit tests verifying TopicStep loading/error/no-key states
    - Test loading spinner with "Generating fresh topic ideas..." text when fetching
    - Test no-API-key state shows KeyRound icon and instruction message
    - Test error state shows error message and "Retry" button
    - Test clicking "Refresh" re-invokes topic generation with loading spinner
    - Test successful load displays up to 8 topic buttons in 2-column grid
    - Test clicking a suggested topic populates the topic input field
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [x] 4. Checkpoint — Ensure all tests pass
  - Ensure all tests pass with `npm run test:unit`, ask the user if questions arise.

- [x] 5. Create shared rendering module
  - [x] 5.1 Create `src/services/renderingShared.ts` with generic context interface and shared functions
    - Define `RenderContext2D` interface covering the subset of CanvasRenderingContext2D used by both renderers
    - Implement `computeKenBurnsTransform(progress, imgW, imgH, canvasW, canvasH, kenBurns?, isSecondaryShot?)` — returns `{ zoom, panX, panY, scale, dw, dh }`
    - Implement `drawLetterboxBars(ctx, w, h, segType, accentColors)` — returns barH
    - Implement `drawVignette(ctx, w, h)`
    - Implement `drawProgressBar(ctx, w, h, progress, accentColor)`
    - Implement `wrapText(ctx, text, x, y, maxW, lineH)`
    - Implement `roundRect(ctx, x, y, w, h, r)`
    - Implement `hexToRgba(hex, alpha)` — pure string conversion
    - All functions accept `RenderContext2D` (not browser-specific types)
    - _Requirements: 5.1, 5.5, 5.6_
  - [ ]* 5.2 Write property tests for shared rendering functions
    - **Property 1: Shared drawing functions accept any valid generic context**
    - **Validates: Requirements 5.5**
    - Use fast-check to generate mock RenderContext2D objects and valid ScriptSegment-like inputs
    - Verify no exceptions thrown for progress in [0, 1], valid dimensions
  - [ ]* 5.3 Write property test for Ken Burns bounded output
    - **Property 2: Ken Burns transform produces bounded output**
    - **Validates: Requirements 5.7**
    - Use fast-check to generate valid image/canvas dimensions and progress values
    - Assert zoom ≥ 1.0, |panX| < canvasWidth, |panY| < canvasHeight
  - [ ]* 5.4 Write unit tests for `hexToRgba` and other pure helpers
    - Test `hexToRgba('#ff0000', 0.5)` returns `'rgba(255, 0, 0, 0.5)'`
    - Test edge cases: 3-char hex, invalid input
    - _Requirements: 5.1, 5.5_

- [x] 6. Integrate shared rendering module into browser renderer
  - [x] 6.1 Refactor `src/services/videoRenderer.ts` to import from `renderingShared.ts`
    - Replace inline Ken Burns calculations with `computeKenBurnsTransform`
    - Replace inline letterbox bar drawing with `drawLetterboxBars`
    - Replace inline vignette drawing with `drawVignette`
    - Ensure existing tests still pass after refactor
    - _Requirements: 5.2, 5.4, 5.7_

- [x] 7. Checkpoint — Ensure all tests pass and build succeeds
  - Run `npm run test:unit` and `npx vite build` to verify no regressions.

- [x] 8. Split server-render.mjs into modules
  - [x] 8.1 Create `server-render/narration.mjs` module
    - Extract `generateNarration(segments, outputDir)` and silence generation logic
    - Export both functions
    - _Requirements: 4.5, 4.8_
  - [x] 8.2 Create `server-render/audio.mjs` module
    - Extract `concatenateAudio(audioFiles, outputFile)` and `mixWithBackgroundMusic(videoFile, narrationFile, bgMusicPath, outputFile, duration)`
    - Export both functions
    - _Requirements: 4.6, 4.8_
  - [x] 8.3 Create `server-render/thumbnail.mjs` module
    - Extract thumbnail generation logic into `generateThumbnail(project, imgCache, fetchImage, fetchVideoFrame, outputDir)`
    - Export the function
    - _Requirements: 4.7, 4.8_
  - [x] 8.4 Create `server-render/drawing.mjs` module
    - Extract `drawProceduralBackground`, `drawFrame`, `drawTitleCardFrame`, `drawEndScreenFrame`, `drawTechnicalLabel`
    - Import shared logic from `src/services/renderingShared.ts` where applicable
    - Export all drawing functions
    - _Requirements: 4.4, 4.8, 5.3_
  - [x] 8.5 Create `server-render/index.mjs` as the main orchestrator
    - Import from all sub-modules (drawing, narration, audio, thumbnail)
    - Keep `fetchProject`, `fetchImage`, `fetchVideoFrame`, and the main `render()` loop
    - Ensure the CLI interface (`node server-render/index.mjs [output.webm]`) works identically to the old `server-render.mjs`
    - _Requirements: 4.1, 4.2, 4.3_
  - [x] 8.6 Update vite.config.ts to reference new server-render path
    - Update the `/api/server-render` endpoint to spawn `server-render/index.mjs` instead of `server-render.mjs`
    - _Requirements: 4.2_

- [x] 9. Checkpoint — Ensure build succeeds and server renderer works
  - Run `npx vite build` to verify the build. Run `npm run test:unit` to verify no regressions. Ask the user if questions arise.

- [x] 10. Implement project-ID-scoped temp files
  - [x] 10.1 Create `src/services/projectPaths.ts` with path helper
    - Implement `getProjectTempPath(projectId: string): string` returning `/tmp/autotube-project-${projectId}.json`
    - _Requirements: 6.1, 6.2_
  - [x] 10.2 Update `src/store.ts` to use project-ID-scoped paths
    - In `saveProjectForServer` (the fetch to `/api/save-project`), pass project ID as query parameter: `/api/save-project?id=${project.id}`
    - _Requirements: 6.2_
  - [x] 10.3 Update vite.config.ts endpoints to support project-ID-scoped paths
    - `/api/save-project?id={projectId}` writes to `/tmp/autotube-project-{projectId}.json`
    - `/api/export-project?id={projectId}` reads from the same path
    - Fall back to `/tmp/autotube-project.json` if no `id` param (backward compat)
    - _Requirements: 6.5, 6.6_
  - [x] 10.4 Update `server-render/index.mjs` to accept project file path
    - Accept project file path as second CLI argument or derive from project ID
    - Clean up the project-specific temp file after render completes
    - _Requirements: 6.3, 6.4_
  - [ ]* 10.5 Write property test for project temp path uniqueness
    - **Property 3: Project-ID-scoped temp paths are unique and well-formed**
    - **Validates: Requirements 6.1, 6.2, 6.5**
    - Use fast-check to generate pairs of distinct non-empty strings
    - Assert `getProjectTempPath(a) !== getProjectTempPath(b)` and paths match expected pattern

- [x] 11. Implement project format versioning with migration system
  - [x] 11.1 Add `version` field to VideoProject type
    - Add `version: number` to `VideoProject` interface in `src/types.ts`
    - _Requirements: 7.1_
  - [x] 11.2 Create `src/services/projectMigrations.ts` with migration registry
    - Implement `CURRENT_PROJECT_VERSION` constant (initially `1`)
    - Implement `registerMigration(fromVersion, fn)` to register migration functions
    - Implement `migrateProject(project)` that applies sequential migrations from project version to current
    - Register initial migration: v0 → v1 (adds version field)
    - Handle forward compatibility: if version > current, log warning and return as-is
    - _Requirements: 7.3, 7.4, 7.5, 7.6_
  - [x] 11.3 Update `src/store.ts` to set version on new projects and migrate on load
    - When creating a new `VideoProject`, set `version: CURRENT_PROJECT_VERSION`
    - In `validateStoredProject`, call `migrateProject` on the loaded project data before validation
    - _Requirements: 7.2, 7.3, 7.4_
  - [ ]* 11.4 Write property test for migration correctness
    - **Property 4: Migration system brings any older version to current**
    - **Validates: Requirements 7.3, 7.4**
    - Use fast-check to generate project-like objects with version in [0, CURRENT_PROJECT_VERSION)
    - Assert output has `version === CURRENT_PROJECT_VERSION` and preserves existing fields
  - [ ]* 11.5 Write unit tests for project migrations
    - Test v0 → v1 migration adds version field
    - Test project with no version field is treated as v0
    - Test project with version > current logs warning and loads as-is
    - Test migration preserves all existing fields
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

- [x] 12. Final checkpoint — Ensure all tests pass and build succeeds
  - Run `npm run test:unit` and `npx vite build`. Ensure all 401+ tests pass. Ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation after each phase
- Property tests validate universal correctness properties from the design document
- The server-render module split (task 8) keeps `.mjs` files since they run outside the Vite build pipeline
- No new npm packages are introduced — all implementations use existing dependencies (vitest, fast-check, React, lucide-react)
