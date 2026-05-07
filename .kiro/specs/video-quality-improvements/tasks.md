# Implementation Plan: Video Quality Improvements

## Overview

This plan implements eight areas of quality improvement across the AutoTube pipeline: dead code cleanup, pipeline reliability, script narrative quality, background music, thumbnail generation, motion graphics, YouTube SEO metadata, and higher-resolution rendering. Dead code cleanup and pipeline reliability are tackled first since they reduce file size and stabilize the foundation for subsequent changes. All new fields on `VideoProject` are optional for backward compatibility. Both server-side (`server-render.mjs`) and browser-side (`videoRenderer.ts`) renderers are updated consistently via shared logic in `renderingShared.ts`.

## Tasks

- [x] 1. Dead code cleanup in `src/services/media.ts`
  - [x] 1.1 Remove `searchUnsplash`, `searchPicsum`, `searchFirecrawl`, `searchSerper` functions and their associated interfaces (`SerperImage`, `FirecrawlItem`) from `src/services/media.ts`
    - Remove the four dead functions and two interfaces
    - Remove any `firecrawlKey` or `serperKey` references in config types if present
    - Remove any imports or type references only used by the removed functions
    - Verify no other module imports or references the removed functions
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 11.3_

  - [ ]* 1.2 Write unit tests verifying dead code removal
    - Grep-based verification that removed function names no longer appear in the codebase
    - Run `tsc --noEmit` to confirm zero compilation errors
    - Run existing test suite to confirm no regressions
    - _Requirements: 8.6, 8.7_

- [x] 2. Pipeline reliability fixes
  - [x] 2.1 Extract shared `repairTruncatedJson()` into `src/utils/jsonRepair.ts`
    - Create `src/utils/jsonRepair.ts` with the consolidated `repairTruncatedJson()` function
    - The function should strip markdown code fences, fix trailing commas, close unclosed braces/brackets/strings
    - Update imports in `src/services/visionCheck.ts`, `src/services/qualityScorer.ts`, `src/services/focalCropper.ts`, and `src/services/llmVisualDirector.ts` to use the shared utility
    - Remove the duplicated `repairTruncatedJson()` from each of those files
    - _Requirements: 7.1, 7.4, 7.8_

  - [ ]* 2.2 Write property test for JSON repair (Property 4)
    - **Property 4: JSON repair produces parseable JSON**
    - For any valid JSON string that has been truncated, `repairTruncatedJson(truncated)` produces a string that `JSON.parse()` can parse without throwing
    - Use fast-check to generate valid JSON objects, truncate them at random positions, and verify repair produces parseable output
    - **Validates: Requirements 7.1, 7.4**

  - [x] 2.3 Increase API timeouts and retries for Reka Edge calls
    - Change `VISION_TIMEOUT_MS` from 15,000 to 20,000 in `src/services/visionCheck.ts`
    - Change `QUALITY_TIMEOUT_MS` from 15,000 to 20,000 in `src/services/qualityScorer.ts`
    - Change `VISION_MAX_RETRIES` from 1 to 2 in `src/services/visionCheck.ts`
    - Change `QUALITY_MAX_RETRIES` from 1 to 2 in `src/services/qualityScorer.ts`
    - _Requirements: 7.3_

  - [x] 2.4 Add JSON repair to `visionCheck.ts` response parsing and improve `llmVisualDirector.ts` JSON handling
    - In `checkCandidateVision()`, use the shared `repairTruncatedJson()` when initial `JSON.parse()` fails, and fall back to a neutral score if repair also fails
    - In `generateAIPlan()`, use `repairTruncatedJson()` when the cleaned response fails to parse, before falling back to the default plan
    - Ensure the Visual Director unwraps nested wrapper objects (e.g. `{ "plan": { ... } }`) — already handled in `validateVisualPlan()`, verify it works with repaired JSON
    - Log all JSON repair attempts and fallback activations via `logger.warn()`
    - _Requirements: 7.1, 7.2, 7.4, 7.8_

  - [ ]* 2.5 Write property test for visual plan unwrapping (Property 5)
    - **Property 5: Visual plan unwrapping extracts fields from nested wrappers**
    - For any visual plan object wrapped in `{ "plan": { ...fields } }`, `validateVisualPlan(wrapped, fallbackTopic)` returns a plan with the same `intent` and `visualConcept` values as the inner object
    - Use fast-check to generate plan objects with various field combinations and wrapping levels
    - **Validates: Requirements 7.2**

  - [x] 2.6 Add fallback shot generation in `src/services/visualPlanner.ts`
    - Create `buildFallbackShots(beat, entities, topicContext, queries)` function that generates at least 1 shot with concrete, non-empty search queries from the segment's narration text and topic context entities
    - In `planSegmentVisuals()`, when `aiPlan.shots` is empty or undefined, call `buildFallbackShots()` to produce fallback shots
    - _Requirements: 7.6_

  - [ ]* 2.7 Write property test for fallback shots (Property 6)
    - **Property 6: Fallback shots always produce at least one shot with non-empty queries**
    - For any `NarrativeBeat`, entity array, and `TopicContext`, `buildFallbackShots()` returns at least 1 shot where `queries` is a non-empty array of non-empty strings
    - **Validates: Requirements 7.6**

  - [x] 2.8 Add broadened query fallback in media harvesting and CORS proxy retry
    - In `harvestMediaWithSafetyNet()` in `src/services/media.ts`, when all providers return empty for the initial query, attempt a broadened query using `topicContext.coreSubject` before falling back to the Wikipedia thumbnail
    - In `loadImage()` in `src/services/thumbnail.ts` and `src/services/videoRenderer.ts`, implement retry chain: (1) `images.weserv.nl` proxy, (2) original URL with `crossOrigin='anonymous'`, (3) procedural background fallback
    - Log all timeout events, fallback activations via `logger.warn()`
    - _Requirements: 7.5, 7.7, 7.8_

- [ ] 3. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Motion graphics and shared rendering logic
  - [x] 4.1 Implement deterministic Ken Burns parameter computation in `src/services/renderingShared.ts`
    - Create `computeKenBurnsParams(segmentIndex, assetId, prevPanX?, prevPanY?)` that returns `KenBurnsConfig` with `zoomStart` and `zoomEnd` in `[1.0, 1.25]` and `panDirectionX`/`panDirectionY` in `[-1, 1]`
    - Use a seeded hash of `segmentIndex + assetId` for determinism — same inputs always produce same output
    - Ensure consecutive segments have different pan directions (differ by at least one axis when `prevPanX`/`prevPanY` are provided)
    - _Requirements: 4.1, 4.2, 10.1_

  - [ ]* 4.2 Write property tests for Ken Burns parameters (Properties 7, 8, 9)
    - **Property 7: Ken Burns zoom parameters stay within [1.0, 1.25]**
    - **Property 8: Ken Burns parameters are deterministic**
    - **Property 9: Consecutive segments have different Ken Burns pan directions**
    - **Validates: Requirements 4.1, 4.2, 10.1**

  - [x] 4.3 Implement crossfade alpha computation in `src/services/renderingShared.ts`
    - Create `computeCrossfadeAlpha(frameInTransition, totalTransitionFrames)` that returns a value monotonically increasing from 0.0 to 1.0
    - Both renderers will use this for consistent crossfade transitions lasting 300-800ms
    - _Requirements: 4.3, 10.2_

  - [ ]* 4.4 Write property test for crossfade alpha (Property 14)
    - **Property 14: Crossfade alpha is monotonically increasing from 0 to 1**
    - For any total transition frame count > 0, the sequence from frame 0 to frame total is monotonically non-decreasing, starting at 0.0 and ending at 1.0
    - **Validates: Requirements 4.3**

  - [x] 4.5 Implement multi-asset alternation and resolution scaling in `src/services/renderingShared.ts`
    - Create `computeActiveAssetIndex(timeInSegment, assetCount, intervalSec)` for alternating between primary and secondary shots at 3-5 second intervals
    - Create `scaleToResolution(baseDimension, baseWidth, targetWidth)` for proportional overlay scaling across resolutions
    - _Requirements: 4.4, 6.3_

  - [ ]* 4.6 Write property test for overlay scaling (Property 11)
    - **Property 11: Overlay element scaling is proportional to resolution**
    - For any base dimension > 0, base width > 0, and target width > 0, `scaleToResolution()` returns `baseDimension * (targetWidth / baseWidth)`
    - **Validates: Requirements 6.3**

  - [x] 4.7 Integrate motion graphics into both renderers
    - Update `src/services/videoRenderer.ts` to use `computeKenBurnsParams()`, `computeCrossfadeAlpha()`, and `computeActiveAssetIndex()` from `renderingShared.ts`
    - Update `server-render.mjs` (or `server-render/index.mjs`) to use the same shared constants and logic for Ken Burns, crossfade, and multi-asset alternation
    - Ensure crossfade uses `ctx.globalAlpha` blending in both renderers
    - Render video clips directly when `MediaAsset.type === 'video'` instead of applying Ken Burns to a static thumbnail
    - Add procedural background fallback (gradient + topic text) when a MediaAsset fails to load during rendering
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 10.1, 10.2, 10.3_

- [ ] 5. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Script narrative quality improvements
  - [x] 6.1 Enhance script generation prompts in `src/services/llm.ts`
    - Update the system prompt and user prompt in `generateAIScript()` to enforce:
      - Hook-first intro structure (specific claim/statistic/question, not generic "Welcome to" or "In this video")
      - Transition segments for scripts with >4 segments
      - At least one data-driven segment with numeric content from `topicContext.extract`
      - Narrative callback in the conclusion referencing the hook
      - Tone-specific rules: `'dramatic'` → shorter sentences (avg ≤12 words), active voice; `'casual'` → conversational phrasing, rhetorical questions, second-person address
    - Handle empty `topicContext.extract` gracefully — produce hook using topic name and style-appropriate framing without fabricating statistics
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_

  - [x] 6.2 Add post-parse validation for transition segments
    - In `validateSegment()` or post-parse logic, if script has >4 segments and none have `type: 'transition'`, inject a transition segment between the midpoint sections with a forward-looking statement
    - _Requirements: 1.2_

- [x] 7. Background music
  - [x] 7.1 Add background music utility functions in `src/services/renderingShared.ts`
    - Create `getBackgroundMusicPath(style)` that maps video style to `public/audio/bg-{style}.aac` file path, returns null if file missing
    - Create `computeBgMusicVolume(hasNarration)` that returns 0.15 if narration present, 0.60 if no narration
    - Ensure at least 4 royalty-free ambient audio loops exist in `public/audio/` (one per style: `bg-business-insider.aac`, `bg-warfront.aac`, `bg-documentary.aac`, `bg-explainer.aac`)
    - _Requirements: 2.1, 2.3, 2.4_

  - [x] 7.2 Integrate background music into browser renderer
    - In `renderVideoToBlob()` in `src/services/videoRenderer.ts`, use Web Audio API `GainNode` to mix background music at the computed volume
    - Loop the background music seamlessly when it's shorter than the video duration
    - If the background music file is missing or unreadable, render with narration only without throwing an error
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 2.7_

  - [x] 7.3 Integrate background music into server renderer
    - In `server-render.mjs`, use ffmpeg `amix` or `amerge` filter to combine narration and background music
    - Set background music volume to 15% of narration volume (or 60% if no narration)
    - Loop the track seamlessly if shorter than video duration
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 2.6_

  - [x] 7.4 Add background music UI toggle
    - Add `backgroundMusic?: boolean` field to `VideoProject.exportSettings` (optional, defaults to `true`)
    - Add a toggle in `src/components/AssemblyStep.tsx` to enable/disable background music before rendering
    - _Requirements: 2.8, 11.5_

- [x] 8. Thumbnail generation improvements
  - [x] 8.1 Implement thumbnail helper functions in `src/services/thumbnail.ts`
    - Create `selectThumbnailBackground(assets)` that returns the highest-scored non-fallback `MediaAsset`
    - Create `truncateOverlayText(text, maxLength)` that truncates to maxLength chars with '…' if exceeded
    - Export `extractKeyPhrase()` from `src/services/seoTitles.ts` (already exists, ensure it's exported)
    - _Requirements: 3.2, 3.5, 3.6_

  - [ ]* 8.2 Write property tests for thumbnail helpers (Properties 10, 12, 13)
    - **Property 10: Overlay text truncation** — `truncateOverlayText(text, 80)` returns at most 80 chars; if input exceeds 80, output ends with '…' and has length exactly 80
    - **Property 12: Thumbnail background selection picks highest-scored non-fallback asset** — for any non-empty array with at least one non-fallback asset, returns the highest-scored non-fallback asset
    - **Property 13: extractKeyPhrase returns a non-empty substring of the input** — for any non-empty hook line, returns a non-empty string
    - **Validates: Requirements 3.2, 3.5, 3.6**

  - [x] 8.3 Enhance `generateThumbnail()` in `src/services/thumbnail.ts`
    - Use `selectThumbnailBackground()` to pick the best media asset as background image
    - Apply dark gradient overlay: `rgba(0,0,0,0.4)` top → `rgba(0,0,0,0.8)` bottom
    - Draw title in bold 56px `system-ui` with white fill and dark text shadow (blur 20px, offset 0,4)
    - Use hook line key phrase (via `extractKeyPhrase()`) as overlay text when available
    - Truncate overlay text to 80 characters with ellipsis via `truncateOverlayText()`
    - Implement fallback chain: CORS proxy → original URL → gradient-only background (no error thrown)
    - Use only system fonts (`system-ui`, `sans-serif`)
    - Produce 1280×720 pixel PNG image
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 11.2_

- [ ] 9. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. YouTube SEO metadata generation
  - [x] 10.1 Implement tag generation in `src/services/seoTitles.ts`
    - Create `sanitizeTag(raw)` that trims, removes invalid chars (only alphanumeric + spaces + hyphens allowed), enforces 2-30 char length, returns null if invalid
    - Create `generateTags(topicContext, style)` that produces 5-15 tags from `topicContext.entities`, `coreSubject`, and `kind` field
    - If topic context has no entities or extract is empty, generate tags from topic name and style keywords without fabricating entity names
    - _Requirements: 5.4, 5.5, 5.8_

  - [ ]* 10.2 Write property test for tag generation (Property 3)
    - **Property 3: Tag generation produces valid tags within count and character bounds**
    - For any `TopicContext` and style string, `generateTags()` returns 5-15 tags, each 2-30 chars, containing only alphanumeric + spaces + hyphens
    - **Validates: Requirements 5.4, 5.5**

  - [x] 10.3 Implement video description generator in `src/services/seoTitles.ts`
    - Create `generateVideoDescription(segments, topic, topicContext, style)` that returns `{ summary, chapters, tags, fullDescription }`
    - Summary: 2-3 sentences derived from intro and conclusion segments
    - Chapters: YouTube chapter markers from `generateChapterMarkers()` with timestamps matching segment start times
    - Tags: from `generateTags()`
    - Full description: combined summary + chapters + tags block
    - _Requirements: 5.2, 5.3, 5.4_

  - [ ]* 10.4 Write property tests for title generation and chapter timestamps (Properties 1, 2)
    - **Property 1: Title generation returns valid titles with correct length bounds** — `generateTitleOptions(topic, style)` returns ≥3 titles each 40-70 chars
    - **Property 2: Chapter timestamps are cumulative sums of segment durations** — each timestamp equals sum of all preceding segment durations
    - **Validates: Requirements 5.1, 5.3, 11.1**

  - [x] 10.5 Enhance `copyChaptersToClipboard()` and add SEO metadata to preview UI
    - Update `copyChaptersToClipboard()` in `src/services/chapters.ts` to accept the full description string (summary + chapters + tags) instead of just chapter markers
    - Present generated title options, description, and tags in the preview step UI (`src/components/PreviewStep.tsx`) so the user can review and copy them
    - _Requirements: 5.6, 5.7_

- [x] 11. Higher resolution rendering
  - [x] 11.1 Add resolution presets and extend export settings
    - Create `RESOLUTION_PRESETS` constant in `src/services/renderingShared.ts` with 720p (1280×720, 6fps), 1080p (1920×1080, 12fps), and 4K (3840×2160, 24fps) presets including `videoBitsPerSecond`
    - Add `resolution?: '720p' | '1080p' | '4K'` to `VideoProject.exportSettings` in `src/types.ts` (optional, defaults to '720p')
    - _Requirements: 6.1, 6.6, 11.5_

  - [x] 11.2 Update both renderers to use resolution presets
    - In `src/services/videoRenderer.ts`, create canvas at the selected resolution's width and height from `RESOLUTION_PRESETS`
    - Scale all overlay elements (captions, labels, progress bars, title text) proportionally using `scaleToResolution()`
    - In `server-render.mjs`, increase ffmpeg frame rate to at least 24 FPS for 4K rendering
    - Add canvas allocation fallback: if 4K canvas fails (memory constraints), fall back to 1080p and log a warning
    - Default to 720p when no resolution is explicitly selected
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.6, 6.7_

  - [x] 11.3 Add resolution-aware media scoring and UI controls
    - In media scoring, boost candidates whose `resolvedWidth` meets or exceeds the target resolution width
    - Display the selected resolution in the export settings UI (`src/components/ExportModal.tsx`) alongside existing quality and format options
    - _Requirements: 6.5, 6.8_

- [ ] 12. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document (14 total)
- Unit tests validate specific examples and edge cases
- Dead code cleanup (task 1) and pipeline reliability (task 2) are done first to reduce file size and stabilize the pipeline before other changes
- All new fields on `VideoProject` are optional for backward compatibility (Requirement 11.5)
- The project uses Vitest for testing and fast-check (already installed) for property-based tests
