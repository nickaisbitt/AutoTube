# Implementation Plan: AutoTube Quality Phase 2

## Overview

Six targeted improvements to the AutoTube pipeline: render speed (particle reduction, grain skip, yield interval, background caching, draft frame rate), YouTube metadata quality (rich description, smart tags, data-point embedding), thumbnail wiring (split-screen download, preview card, YouTube upload), procedural background quality (title card, stat card, accent letterbox bars), render progress UI (per-segment events, accurate track bars, ETA), and batch processing connectivity (store integration, job status, per-job output, progress display).

All changes are additive with backward-compatible defaults. No new external APIs or npm packages.

## Tasks

- [x] 1. Phase 1 — Render Speed
  - [x] 1.1 Add `isRendering` flag to `drawProceduralBackground` and reduce particle count
    - Add optional `isRendering?: boolean` parameter to `drawProceduralBackground` signature
    - When `isRendering` is `true`, draw 30 particles instead of 120; adjust particle `size` and `alpha` proportionally so visual density is equivalent at lower count
    - When `isRendering` is `false` or `undefined`, keep the existing 120-particle loop unchanged
    - Pass `isRendering: true` from `renderVideoToBlob` when calling `draw` (which calls `drawProceduralBackground`)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 23.1_

  - [x] 1.2 Add `isRendering` flag to `draw` and skip film grain loop
    - Add optional `isRendering?: boolean` parameter to the `draw` function signature
    - Wrap the film grain nested `for` loop in `if (!isRendering)` so it is skipped entirely during rendering
    - Ensure letterbox bars, vignette, lower-third title, captions, and progress bar are NOT skipped
    - Thread `isRendering: true` from `renderVideoToBlob` through all `draw(...)` call sites in the frame capture loop
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 23.1_

  - [x] 1.3 Write unit tests for `isRendering` flag behaviour
    - Test that `drawProceduralBackground` with `isRendering: true` draws 30 particles (mock `ctx.arc` call count)
    - Test that `drawProceduralBackground` with `isRendering: false` draws 120 particles
    - Test that `drawProceduralBackground` with no flag defaults to 120 particles
    - _Requirements: 1.2, 1.3, 1.5_

  - [x] 1.4 Increase frame yield interval from 30 to 60 frames
    - In `renderVideoToBlob`, change `if (f % 30 === 0)` to `if (f % 60 === 0)` in the frame capture loop
    - Add a guard so at least one yield occurs per segment regardless of frame count (yield when `f === totalFrames - 1` if no yield has occurred)
    - Verify abort signal is checked at each yield point
    - _Requirements: 3.1, 3.2, 3.3_

  - [x] 1.5 Cache procedural background per segment
    - Create a `bgCacheCanvas` (`document.createElement('canvas')`) and `bgCacheCtx` before the segment loop in `renderVideoToBlob`; fall back gracefully if `getContext('2d')` returns `null`
    - At the start of each segment (`f === 0`), call `drawProceduralBackground(bgCacheCtx, w, h, seg, 0, true)` to pre-render the background once
    - In subsequent frames, blit `bgCacheCanvas` onto `offCtx` with `offCtx.drawImage(bgCacheCanvas, 0, 0)` instead of calling `drawProceduralBackground`
    - Invalidate (re-render) the cache when the segment changes
    - Apply all foreground elements (image, letterbox, vignette, grain, title, captions, progress bar) on top of the blitted background each frame
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 1.6 Reduce draft frame sample rate to 3 fps
    - In `renderVideoToBlob`, change the `frameSampleRate` for `quality === 'draft'` from `4` to `3`
    - Verify `standard` stays at `6` and `high` stays at `8`
    - Confirm the reduced rate is passed to both the ffmpeg endpoint body and the `MediaRecorder` fallback
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 1.7 Write unit tests for render speed helpers
    - Test that `frameSampleRate` is `3` for draft, `6` for standard, `8` for high (extract the lookup into a pure helper if needed)
    - Test that the yield interval guard fires at least once per segment for a 1-frame segment
    - _Requirements: 5.1, 5.2, 3.1, 3.2_

  - [x] 1.8 Phase 1 checkpoint — ensure all tests pass
    - Run `vitest --run` and confirm no regressions in `videoRenderer.test.ts` or any other test file
    - Ask the user if any questions arise before proceeding

- [x] 2. Phase 2 — YouTube Readiness
  - [x] 2.1 Rewrite `generateYouTubeMetadata` to produce a rich description
    - Add an optional fourth parameter `project?: VideoProject` to `generateYouTubeMetadata` (backward-compatible default `undefined`)
    - Build the description in sections:
      1. Hook paragraph: first `ScriptSegment` narration truncated to 300 characters
      2. "What you'll learn:" section with one `• {seg.title}` bullet per segment
      3. "Key Numbers:" section (only when `extractDataPoints(project.media)` returns ≥ 1 item) listing each data point on its own line — omit section entirely when empty
      4. "Chapters:" section using `generateDetailedChapters(script)` output
      5. Hashtag line: at least 3 hashtags derived from topic words and style
    - Truncate the final description at 5000 characters at a sentence boundary (`.` or `\n`) where possible
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 8.1, 8.2, 8.3, 8.4, 8.5, 23.2_

  - [x] 2.2 Rewrite tag generation to produce smart long-tail tags
    - Extract base words longer than 3 characters from the topic string
    - Generate variants: `"{word} explained"`, `"{word} documentary {year}"`, `"{word} {style}"` for each base word
    - Include the full topic string and the style string as tags
    - Deduplicate case-insensitively and cap at 15 unique tags
    - If fewer than 2 base words exist, supplement with `"AI generated"`, `"documentary"`, `"explained"` to reach at least 5 tags
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

  - [x] 2.3 Write unit tests for `generateYouTubeMetadata`
    - Test that the description starts with the first segment's narration (up to 300 chars)
    - Test that the description contains a "What you'll learn:" section with one bullet per segment title
    - Test that the "Key Numbers:" section appears when `extractDataPoints` returns data points and is absent when it returns `[]`
    - Test that the description is ≤ 5000 characters
    - Test that the three-parameter call (no `project`) produces valid output without throwing
    - Test that tags are deduplicated and capped at 15
    - Test that topics with < 2 long words produce ≥ 5 tags
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.6, 7.5, 7.6, 7.7, 23.2_

  - [x] 2.4 Phase 2 checkpoint — ensure all tests pass
    - Run `vitest --run` and confirm `youtube.test.ts` (create if absent) and `seoTitles.test.ts` pass
    - Ask the user if any questions arise before proceeding

- [x] 3. Phase 3 — Thumbnail Wiring
  - [x] 3.1 Replace `generateThumbnail` with `generateSplitScreenThumbnail` in the "Download Thumbnail" handler
    - In `PreviewStep.tsx`, update the "Download Thumbnail" button `onClick` handler to call `generateSplitScreenThumbnail(project, project.title)` first
    - Wrap in try/catch: on error, fall back to `generateThumbnail(project.title, project.topic)`
    - Pass the resulting `Blob` to `downloadThumbnail` with filename `{sanitized_title}_thumbnail.png`
    - Ensure the handler never leaves the user in an unresolved or visible error state
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [x] 3.2 Add thumbnail preview card to `PreviewStep` sidebar
    - Add a `thumbnailPreviewUrl` state variable (string | null) initialised to `null`
    - In a `useEffect` that runs once on mount (empty dependency array), call `generateSplitScreenThumbnail(project, project.title)` and store the resulting object URL in state; fall back to `generateThumbnail` on error; display "Thumbnail preview unavailable" placeholder on total failure
    - Render a 160×90 `<img>` card above the "Download Thumbnail" button in the right-hand sidebar column
    - Revoke the object URL in the `useEffect` cleanup function
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

  - [x] 3.3 Pass split-screen thumbnail blob to "Upload to YouTube" handler
    - In `PreviewStep.tsx`, update the "Upload to YouTube" button `onClick` handler to generate the split-screen thumbnail blob before calling `openYouTubeUpload`
    - Construct a `File` object from the blob: `new File([blob], '{sanitized_title}_thumbnail.png', { type: 'image/png' })`
    - Pass the `File` as the `thumbnail` field in the `YouTubeUploadConfig` object
    - On thumbnail generation failure, call `openYouTubeUpload` without the `thumbnail` field (do not block the upload)
    - _Requirements: 11.1, 11.2, 11.3_

  - [x] 3.4 Phase 3 checkpoint — ensure all tests pass
    - Run `vitest --run` and confirm `thumbnail.test.ts` and `PreviewStep` snapshot/unit tests pass
    - Ask the user if any questions arise before proceeding

- [x] 4. Phase 4 — Procedural Background Quality
  - [x] 4.1 Render segment title card when no CORS-safe image is available
    - In the `draw` function, after the image-drawing block, add a condition: if `asset` is `undefined` OR `img.safeForCanvas` is `false` (or asset not in cache)
    - Draw the segment title in bold 72px white text, vertically centred between the letterbox bars (not in the lower-third position)
    - Use `wrapText` if the title exceeds `w - 120` pixels of horizontal padding
    - Draw a 4px horizontal underline below the title using `accentColor`, spanning 60% of canvas width, centred horizontally
    - The existing lower-third title overlay must still render regardless
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_

  - [x] 4.2 Render data stat card when no CORS-safe image is available
    - In the same no-image condition block, extract the first number matching `/\d+/` from `seg.narration`
    - If a number is found, render it in 96px bold white text centred horizontally at 35% canvas height
    - Render a label (up to 5 surrounding words) in 24px regular white text below the stat number
    - When both title card and stat card apply: render stat card at 30% canvas height and title card at 60% canvas height
    - If no number is found, skip the stat card entirely
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5_

  - [x] 4.3 Apply accent-coloured letterbox bars
    - In the `draw` function, replace the hardcoded `'rgba(0, 0, 0, 0.85)'` letterbox fill with the segment's `accentColor` at 85% opacity
    - Derive the colour from the existing `accentColors` lookup (same map used for the lower-third underline)
    - Apply to both top and bottom bars for all segment types
    - Fall back to `'rgba(0, 0, 0, 0.85)'` when the segment type is not in the `accentColors` map
    - _Requirements: 14.1, 14.2, 14.3, 14.4_

  - [x] 4.4 Write unit tests for procedural background quality helpers
    - Test that the stat-card number extraction regex `/\d+/` returns the first number from a narration string
    - Test that narration with no digits returns `null` / no match
    - Test that the `accentColors` fallback returns `'rgba(0, 0, 0, 0.85)'` for an unknown segment type
    - _Requirements: 13.1, 13.5, 14.4_

  - [x] 4.5 Phase 4 checkpoint — ensure all tests pass
    - Run `vitest --run` and confirm `videoRenderer.test.ts` passes with no regressions
    - Ask the user if any questions arise before proceeding

- [x] 5. Phase 5 — Render Progress UI
  - [x] 5.1 Emit per-segment progress events from `renderVideoToBlob`
    - At the start of each segment's frame loop (`f === 0`), call `onProgress(overallPct, \`Rendering segment ${i+1}/${total}: ${seg.title}\`)`
    - Continue emitting intermediate progress events within the segment every `totalFrames / 10` frames using the same message format
    - _Requirements: 15.1, 15.2, 15.3_

  - [x] 5.2 Parse segment progress in `AssemblyStep` and display segment counter
    - In `AssemblyStep.tsx`, parse the `message` prop using the regex `/Rendering segment (\d+)\/(\d+)/` to extract `currentSeg` and `totalSegs`
    - Display a line below the main progress percentage in the format `"Segment {currentSeg} of {totalSegs}"` when the pattern matches
    - Hide the line when the pattern does not match (e.g. during ffmpeg assembly)
    - _Requirements: 15.4, 15.5_

  - [x] 5.3 Wire accurate track bar values in `AssemblyStep`
    - Replace the cosmetic `progress * 1.2` formula for all four track bars with accurate mappings:
      - "Video Track": `Math.min(progress / 80 * 100, 100)` clamped to 0–100 (fills as `progress` goes 0→80)
      - "Audio Track": `(project.narration.filter(n => n.status === 'ready').length / Math.max(1, project.narration.length)) * 100`
      - "Text Overlay": same value as "Video Track"
      - "Effects": `progress >= 80 ? ((progress - 80) / 20) * 100 : 0` (fills only from 80→100)
    - Ensure `AssemblyStep` uses the `project` prop (already passed) to compute the Audio Track value
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5_

  - [x] 5.4 Add per-segment ETA display to `AssemblyStep`
    - Add `startTimeRef` (via `useRef`) that records `Date.now()` when `status` transitions to `'processing'`
    - Parse `currentSeg` and `totalSegs` from the `message` prop (reuse the regex from 5.2)
    - Compute ETA: `(elapsedSeconds / currentSeg) * (totalSegs - currentSeg)`, rounded to nearest second
    - Display `"~{N}s remaining"` for values < 60, or `"~{M}m {S}s remaining"` for values ≥ 60
    - Display `"Calculating..."` when `currentSeg === 0` or no segment data is available yet
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5_

  - [x] 5.5 Write unit tests for ETA and track bar logic
    - Test ETA formula: `elapsedSeconds=30, currentSeg=3, totalSegs=10` → `70s` → `"~1m 10s remaining"`
    - Test ETA formula: `elapsedSeconds=10, currentSeg=5, totalSegs=10` → `10s` → `"~10s remaining"`
    - Test ETA when `currentSeg=0` → `"Calculating..."`
    - Test "Effects" track bar: `progress=80` → `0%`, `progress=90` → `50%`, `progress=100` → `100%`
    - Test "Audio Track" bar: 3 of 5 clips ready → `60%`
    - _Requirements: 17.2, 17.3, 17.5, 16.1, 16.4_

  - [x] 5.6 Phase 5 checkpoint — ensure all tests pass
    - Run `vitest --run` and confirm no regressions in assembly-related tests
    - Ask the user if any questions arise before proceeding

- [x] 6. Phase 6 — Batch Processing
  - [x] 6.1 Add `batchGenerate` function and batch state to the Store
    - Add `batchJobs` state (`BatchJob[]`, initially `[]`) and `isBatchProcessing` state (`boolean`, initially `false`) to `useVideoProject`
    - Implement `batchGenerate(jobs: { topic: string; config: Omit<TopicConfig, 'topic'> }[])` in the store:
      - Set `isBatchProcessing = true`
      - For each job sequentially (concurrency = 1): set job status to `'running'`, run `generateScript → sourceMedia → generateNarration → assembleVideo`, set status to `'complete'` with the resulting `VideoProject`, or `'error'` with the error message on failure
      - Set `isBatchProcessing = false` when all jobs finish
    - Expose `batchJobs`, `isBatchProcessing`, and `batchGenerate` from the `useVideoProject` return value
    - _Requirements: 18.1, 18.2, 18.3, 19.1, 19.2, 19.3, 19.5, 20.1, 20.4_

  - [x] 6.2 Wire `batchGenerate` and `isProcessing` into `App.tsx`
    - Destructure `batchGenerate` and `isBatchProcessing` from `useVideoProject()` in `App.tsx`
    - Import `BatchProcessor` component and render it (e.g. in the topic step or as a persistent panel)
    - Pass `onGenerate={batchGenerate}` and `isProcessing={isBatchProcessing}` to `BatchProcessor`
    - _Requirements: 18.4, 18.5_

  - [x] 6.3 Update `BatchProcessor` component to show live job status and progress
    - Accept `batchJobs` prop (`BatchJob[]`) from the store so the component reflects server-side status rather than local state only
    - Add a summary line: `"{completed}/{total} videos complete"` while processing; replace with `"Batch complete — {n} succeeded, {m} failed"` when all jobs are done
    - Add an overall progress bar that fills proportionally as jobs complete
    - Add a "Download" button next to each `'complete'` job; trigger a browser download of `job.project.thumbnail` using the job topic as filename
    - Disable the "Download" button (with tooltip "Video no longer available") if the blob URL is no longer valid
    - _Requirements: 19.4, 20.2, 20.3, 20.5, 21.1, 21.2, 21.3, 21.4_

  - [x] 6.4 Write unit tests for `batchGenerate` store logic
    - Test that `batchJobs` transitions from `pending` → `running` → `complete` for a successful job (mock pipeline functions)
    - Test that a failing job transitions to `'error'` and stores the error message
    - Test that `isBatchProcessing` is `true` during processing and `false` after all jobs finish
    - _Requirements: 19.1, 19.2, 19.3, 18.2_

  - [x] 6.5 Phase 6 checkpoint — ensure all tests pass
    - Run `vitest --run` and confirm no regressions across all test files
    - Ask the user if any questions arise before proceeding

- [x] 7. End-to-end verification
  - [x] 7.1 Run the autotube-tester pipeline to verify end-to-end quality
    - Start the dev server (`npm run dev`) and run the autotube-tester pipeline on a representative topic (e.g. "The Rise of Nvidia")
    - Confirm render completes without errors and the progress UI shows per-segment messages
    - Confirm the YouTube metadata description contains "What you'll learn:" and "Chapters:" sections
    - Confirm the "Download Thumbnail" button produces a split-screen PNG
    - Confirm batch queue processes at least two topics sequentially and both show "Done" status
    - _Requirements: 1–21, 22, 23_

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation after each phase
- The `isRendering` flag is the single toggle that gates all render-time optimisations (Phases 1–2)
- All new function parameters must be optional with backward-compatible defaults (Requirement 23.1)
- No new external APIs or npm packages may be introduced (Requirement 22)
