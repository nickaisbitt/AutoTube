# Implementation Plan: AutoTube Quality Phase 3

## Overview

This plan implements all Priority 1 quality improvements across three domains: visual system overhaul (reliable image loading, scene layouts, title wrapping, safe zones, contrast), resolution/encoding upgrades (1080p@24fps, H.264/MP4), production quality (background music fallback), and script quality (purpose tags, pacing scores, promise-payoff validation, rhetorical variety, retention beats). All changes modify existing files — no new files are created. Shared rendering logic lives in `renderingShared.ts` and is mirrored in `server-render.mjs`.

## Tasks

- [x] 1. Update resolution presets and encoding pipeline
  - [x] 1.1 Update `RESOLUTION_PRESETS` in `src/services/renderingShared.ts`
    - Change 720p fps from 6 to 24, videoBitsPerSecond from 5_000_000 to 6_000_000
    - Change 1080p fps from 12 to 24, videoBitsPerSecond from 8_000_000 to 10_000_000
    - 4K stays at fps 24, videoBitsPerSecond 20_000_000
    - _Requirements: 6.1, 6.2, 6.3, 7.4, 7.5_

  - [x] 1.2 Update `RESOLUTION_PRESETS` in `server-render.mjs` to match
    - Mirror the same 720p/1080p/4K values from `renderingShared.ts`
    - Change the default resolution variables (`WIDTH`, `HEIGHT`, `FPS`) from 720p to 1080p (1920×1080, 24fps)
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 7.4, 7.5_

  - [x] 1.3 Switch ffmpeg encoding from VP9/WebM to H.264/MP4 in `server-render.mjs`
    - Replace `libvpx-vp9` codec args with `libx264 -preset fast -crf 23`
    - Add `-pix_fmt yuv420p` for broad playback compatibility
    - Change output file extension from `.webm` to `.mp4`
    - Update the `OUTPUT_FILE` default and any references to `.webm` in the file
    - _Requirements: 7.1, 7.2, 7.3_

  - [x] 1.4 Replace hardcoded frame counts with dynamic FPS-based calculations in `server-render.mjs`
    - Replace `SEGMENT_TITLE_FRAMES = 9` with `Math.round(1.5 * FPS)`
    - Replace `COLD_OPEN_FRAMES = 12` with `Math.round(2 * FPS)`
    - Update any other hardcoded frame counts (title card frames, end screen frames) to use `Math.round(seconds * FPS)`
    - _Requirements: 6.6_

  - [x] 1.5 Update default resolution fallback to 1080p in `src/services/videoRenderer.ts`
    - When no resolution is specified in export settings, default to the 1080p preset
    - _Requirements: 6.4, 6.5_

  - [x] 1.6 Write property test: All resolution presets specify 24 FPS
    - **Property 5: All Resolution Presets Specify 24 FPS**
    - Iterate over all keys in `RESOLUTION_PRESETS` and assert `fps === 24`
    - **Validates: Requirements 6.1, 6.2, 6.3**

  - [x] 1.7 Write property test: Dynamic frame counts equal duration × FPS
    - **Property 8: Dynamic Frame Counts Equal Duration Times FPS**
    - Generate random FPS (1–60) and duration (0.1–30) values
    - Verify `Math.round(duration * fps)` matches the computed frame count
    - **Validates: Requirement 6.6**

- [x] 2. Checkpoint — Ensure resolution and encoding changes compile and tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Add type definitions and shared rendering utilities
  - [x] 3.1 Add new type definitions to `src/types.ts`
    - Add `SegmentPurposeTag` type union: `'stat_hook' | 'history' | 'moat' | 'risk' | 'prediction' | 'human_story' | 'competitive_analysis' | 'transition_bridge' | 'conclusion'`
    - Add `SceneLayoutType` type union: `'centered-text' | 'left-text-right-image' | 'lower-third-overlay' | 'stat-card' | 'quote-card'`
    - Add optional `purposeTag?: SegmentPurposeTag` field to `ScriptSegment`
    - Add optional `pacingScore?: number` field to `ScriptSegment`
    - Add optional `sceneLayout?: SceneLayoutType` field to `ScriptSegment`
    - _Requirements: 11.1, 11.2, 13.2_

  - [x] 3.2 Add `computeSafeZone()` function to `src/services/renderingShared.ts`
    - Returns `{ top, bottom, left, right }` margins scaled proportionally from 1080p reference (top=40px, bottom=60px, left/right=5% of width)
    - Export the `SafeZone` interface
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 3.3 Add `wrapTitleText()` function to `src/services/renderingShared.ts`
    - Accepts `ctx`, `title`, `canvasWidth`, `baseFontSize`
    - Computes safe zone margin of 10% on each side
    - Wraps title at word boundaries when text exceeds available width
    - If wrapped text exceeds 3 lines, reduces font size by 20% and re-wraps
    - Returns `{ lines: string[], fontSize: number }`
    - Export the `WrappedTitleResult` interface
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 3.4 Add `computePacingScore()` function to `src/services/renderingShared.ts`
    - Accepts narration string, returns integer 1–5
    - Scores based on sentence length distribution, punctuation density (`!` and `?`), and intensity word count
    - Returns 3 for empty/null input
    - _Requirements: 13.1_

  - [x] 3.5 Add `assignPurposeTag()` function to `src/services/renderingShared.ts`
    - Accepts a segment object `{ type, narration, title }`
    - Uses content heuristics (statistical patterns, risk keywords, prediction keywords, history keywords, etc.) to classify into a `SegmentPurposeTag`
    - Returns `'transition_bridge'` for transition segments, `'conclusion'` for outro segments
    - _Requirements: 11.1_

  - [x] 3.6 Add `assignSceneLayouts()` function to `src/services/renderingShared.ts`
    - Accepts array of segments with `type`, `purposeTag`, and `narration` fields
    - Returns `SceneLayoutType[]` of same length
    - Uses purpose tags and content heuristics to assign preferred layouts (stat-card for stats, lower-third for transitions, quote-card for human stories, left-text-right-image for sections)
    - Enforces no-consecutive-duplicate constraint by rotating to an alternative layout
    - Add helper `hasStatisticalContent(text)` that detects dollar amounts, percentages, and large numbers
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [x] 3.7 Add `scheduleRetentionBeats()` function to `src/services/renderingShared.ts`
    - Accepts array of segments with `duration` and `narration` fields
    - Returns `RetentionBeat[]` with `segmentIndex`, `timeOffsetSec`, and `type`
    - Detects natural hooks (questions, stats, dramatic phrases) in narration
    - Inserts visual break beats when any 25-second window lacks a hook
    - Export the `RetentionBeat` interface
    - _Requirements: 14.1, 14.2, 14.3_

  - [x] 3.8 Write property test: Title text never exceeds safe zone width
    - **Property 1: Title Text Never Exceeds Safe Zone Width**
    - Generate random title strings (1–200 characters) and canvas widths (640–3840)
    - Call `wrapTitleText()` with a mock context and verify every returned line measures within the safe zone width (canvas width minus 20% margins)
    - **Validates: Requirements 2.1, 2.2**

  - [x] 3.9 Write property test: No consecutive scene layouts are identical
    - **Property 2: No Consecutive Scene Layouts Are Identical**
    - Generate random segment arrays (2–20 segments) with random types and purpose tags
    - Call `assignSceneLayouts()` and verify `layouts[i] !== layouts[i+1]` for all valid i
    - **Validates: Requirement 3.2**

  - [x] 3.10 Write property test: Stat-heavy segments prefer stat-card layout
    - **Property 3: Stat-Heavy Segments Prefer Stat-Card Layout**
    - Generate segments where at least one has statistical content (dollar amounts, percentages)
    - Verify that segment gets `'stat-card'` when the previous segment has a different layout
    - **Validates: Requirement 3.3**

  - [x] 3.11 Write property test: Safe zone scales proportionally with resolution
    - **Property 4: Safe Zone Scales Proportionally With Resolution**
    - Generate random heights (360–4320) and widths
    - Verify `safeZone.bottom === Math.round(60 * height / 1080)` and `safeZone.top === Math.round(40 * height / 1080)`
    - **Validates: Requirements 5.1, 5.2**

  - [x] 3.12 Write property test: Pacing score is always in [1, 5]
    - **Property 6: Pacing Score Is Always In [1, 5]**
    - Generate random narration strings (0–2000 characters, including empty strings, all punctuation, single words)
    - Verify `computePacingScore()` returns an integer in [1, 5]
    - **Validates: Requirement 13.1**

  - [x] 3.13 Write property test: Purpose tags are from valid set
    - **Property 7: Purpose Tags Are From Valid Set**
    - Generate random segments with various types, titles, and narration content
    - Verify `assignPurposeTag()` returns a value from the defined `SegmentPurposeTag` union
    - **Validates: Requirement 11.1**

  - [x] 3.14 Write property test: Scene layout assignment produces exactly one layout per segment
    - **Property 10: Scene Layout Assignment Produces Exactly One Layout Per Segment**
    - Generate random segment arrays (1–20 segments)
    - Verify output length matches input length and all values are valid `SceneLayoutType` values
    - **Validates: Requirement 3.5**

  - [x] 3.15 Write property test: Retention beats cover every 25-second window
    - **Property 9: Retention Beats Cover Every 25-Second Window**
    - Generate random segment arrays (3–15 segments, 5–25 seconds each, total > 30s)
    - Verify that for every 25-second window in the timeline, at least one beat (natural or inserted) exists
    - **Validates: Requirement 14.1**

- [x] 4. Checkpoint — Ensure shared utilities compile and all property tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement reliable image loading in server renderer
  - [x] 5.1 Replace `fetchImage()` in `server-render.mjs` with enhanced version
    - Add 15-second per-request timeout using `AbortController`
    - Add up to 3 retry attempts with exponential backoff (1s, 2s, 4s, capped at 8s)
    - After proxy retries fail, attempt direct HTTPS fetch of the original URL as secondary fallback
    - Return `null` only after all attempts fail, logging a warning with the failed URL
    - _Requirements: 1.1, 1.2, 1.5_

  - [x] 5.2 Add image preloading phase before frame rendering in `server-render.mjs`
    - Before the main render loop, collect all unique image URLs from `project.media`
    - Call the enhanced `fetchImage()` for each URL concurrently (with concurrency limit)
    - Log the count of successfully loaded images and the count of failed images
    - Only begin writing frames to the ffmpeg pipe after all preloading completes
    - _Requirements: 1.3, 1.4_

- [x] 6. Implement scene layout rendering in both renderers
  - [x] 6.1 Add scene layout drawing functions to `server-render.mjs`
    - Implement `drawStatCard(ctx, seg, img, w, h, safeZone)` — large number/stat centered with accent background
    - Implement `drawQuoteCard(ctx, seg, img, w, h, safeZone)` — narration excerpt in large italic font with attribution
    - Implement `drawLeftTextRightImage(ctx, seg, img, w, h, safeZone)` — 40/60 split with text left, image right
    - Implement `drawLowerThirdOverlay(ctx, seg, img, w, h, safeZone)` — full-bleed image with text overlay in bottom third
    - Implement `drawCenteredText(ctx, seg, img, w, h, safeZone)` — current default layout with safe zone enforcement
    - Each layout draws a semi-transparent dark gradient overlay behind text areas for contrast
    - All layouts position elements within safe zone boundaries
    - _Requirements: 3.1, 3.5, 4.1, 5.3_

  - [x] 6.2 Update `drawFrame()` in `server-render.mjs` to use scene layouts
    - Read `seg.sceneLayout` (or look up from the layout assignment array) to determine which layout function to call
    - Replace the current uniform centered-text rendering with the appropriate layout function
    - Fall back to `drawCenteredText` when no layout is assigned
    - _Requirements: 3.5, 4.1_

  - [x] 6.3 Update title card rendering in `server-render.mjs` to use `wrapTitleText()` logic
    - Replace the current `ctx.fillText(displayTitle.substring(0, 60), ...)` with word-boundary wrapping
    - Apply 10% horizontal safe zone margins
    - Reduce font size by 20% and re-wrap if title exceeds 3 lines
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 6.4 Add text contrast overlays to all text rendering in `server-render.mjs`
    - When rendering text over an image background, draw a semi-transparent dark gradient behind the text area
    - When rendering text over a procedural gradient, verify text fill colour provides sufficient visual separation
    - Apply to segment titles, narration overlays, and caption text
    - _Requirements: 4.1, 4.2_

  - [x] 6.5 Enforce safe zone margins for all overlay positioning in `server-render.mjs`
    - Use `computeSafeZone(WIDTH, HEIGHT)` to get margins
    - Ensure bottom margin of at least 60px at 1080p (scaled for other resolutions) to avoid YouTube progress bar
    - Ensure top margin of at least 40px at 1080p (scaled for other resolutions) to avoid YouTube title overlay
    - Update segment title, caption, and overlay positioning to respect safe zone boundaries
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 6.6 Mirror scene layout rendering in `src/services/videoRenderer.ts`
    - Import `computeSafeZone`, `wrapTitleText`, and layout type from `renderingShared.ts`
    - Implement the same 5 scene layout drawing functions for the browser renderer
    - Apply the same title wrapping, contrast overlays, and safe zone margins
    - _Requirements: 2.4, 3.6, 4.3, 5.4_

- [x] 7. Checkpoint — Ensure scene layout rendering compiles and visual output is correct
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Implement script quality improvements
  - [x] 8.1 Integrate purpose tag assignment into the script pipeline in `src/services/llm.ts`
    - After `reviewAndImproveScript()` returns, call `assignPurposeTag()` from `renderingShared.ts` on each segment
    - Store the result in `segment.purposeTag`
    - _Requirements: 11.1, 11.2_

  - [x] 8.2 Integrate pacing score computation into the script pipeline in `src/services/llm.ts`
    - After purpose tag assignment, call `computePacingScore()` from `renderingShared.ts` on each segment's narration
    - Store the result in `segment.pacingScore`
    - _Requirements: 13.1, 13.2_

  - [x] 8.3 Enhance the `reviewAndImproveScript()` prompt in `src/services/llm.ts` for promise-payoff validation
    - Add instructions to the review prompt to detect transition phrases that promise upcoming content (e.g., "But here's where it gets interesting")
    - Instruct the LLM to verify the following segment delivers ≥3 concrete details (names, numbers, dates, specific events)
    - If a promise phrase is followed by a weak segment, instruct the LLM to enrich it with specifics
    - If enrichment fails, retain the original segment and log a warning
    - _Requirements: 9.1, 9.2, 9.3_

  - [x] 8.4 Enhance the `reviewAndImproveScript()` prompt in `src/services/llm.ts` for specificity enrichment
    - Add instructions to identify generic phrases without specific attribution ("many experts say", "some companies", "significant growth")
    - Instruct the LLM to rewrite with concrete names, numbers, or sources
    - Add attribution phrases for unattributed statistical claims
    - Preserve original segment if enrichment produces a shorter result
    - _Requirements: 10.1, 10.2, 10.3_

  - [x] 8.5 Enhance the `reviewAndImproveScript()` prompt in `src/services/llm.ts` for rhetorical variety
    - Add instructions to count sentence-opening patterns across all segments
    - When any pattern appears >3 times, instruct the LLM to rewrite at least half of the duplicates
    - Preserve meaning and tone while varying sentence structure
    - _Requirements: 12.1, 12.2, 12.3_

- [x] 9. Wire scene layouts and retention beats into the pipeline
  - [x] 9.1 Integrate scene layout assignment into `src/store.ts`
    - After script review completes, call `assignSceneLayouts()` on the project's segments
    - Store the layout assignment on each segment's `sceneLayout` field
    - Use `purposeTag` as primary input for layout selection
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 11.3_

  - [x] 9.2 Integrate retention beat scheduling into `src/store.ts`
    - After scene layout assignment, call `scheduleRetentionBeats()` on the project's segments
    - Log the placement of each retention beat for debugging and quality review
    - _Requirements: 14.1, 14.2, 14.3_

  - [x] 9.3 Apply pacing score to Ken Burns rendering in `server-render.mjs`
    - When rendering a segment with `pacingScore` of 4 or 5, use faster Ken Burns zoom speeds and shorter asset alternation intervals (e.g., 2s instead of 4s)
    - When rendering a segment with `pacingScore` of 1 or 2, use slower Ken Burns zoom speeds and longer asset alternation intervals (e.g., 6s instead of 4s)
    - _Requirements: 13.3, 13.4_

- [x] 10. Implement background music fallback
  - [x] 10.1 Update `resolveBackgroundMusicPath()` in `server-render/audio.mjs`
    - When the style-specific audio file does not exist on disk, fall back to `public/audio/ambient-bg.aac`
    - Return the fallback path only if `ambient-bg.aac` exists, otherwise return `null`
    - _Requirements: 8.1, 8.2_

  - [x] 10.2 Write unit tests for background music fallback
    - Test that known styles resolve to their specific file when it exists
    - Test that missing style-specific files fall back to `ambient-bg.aac`
    - Test that unknown styles fall back to `ambient-bg.aac`
    - Test that `null` is returned when neither style-specific nor fallback file exists
    - _Requirements: 8.1, 8.2_

- [x] 11. Final checkpoint — Ensure all tests pass and full pipeline compiles
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation after each major phase
- Property tests validate universal correctness properties from the design document
- All scene layout functions and shared utilities go in `renderingShared.ts` for reuse across both renderers
- The `server-render.mjs` file duplicates shared logic since it cannot import `.ts` directly
- No new files are created — all changes modify existing files per the design document
