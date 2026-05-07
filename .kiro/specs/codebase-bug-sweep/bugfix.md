# Bugfix Requirements Document

## Introduction

This document covers 15 bugs identified across the AutoTube codebase spanning state management (store.ts), preview component (PreviewStep.tsx), service layer (media.ts, aiEditor.ts, llm.ts), and rendering (videoRenderer.ts). The bugs range from critical race conditions and memory leaks to medium-severity data validation and timing issues. They are grouped into four categories: State Management & Lifecycle, Preview Component, Service Layer (AI Editor, LLM, Media), and Rendering.

---

## Bug Analysis

### Current Behavior (Defect)

**Group A — State Management & Lifecycle Bugs (store.ts)**

1.1 WHEN the user cancels media sourcing (abort signal fires) THEN the `sourceMedia` function returns before the `finally` block executes in the abort path, leaving `sourcingRef.current = true` permanently, which prevents any subsequent media sourcing attempts — the pipeline gets stuck.

1.2 WHEN `assembleVideo` starts and reads `activeProject` from state, and an auto-save or other callback mutates the underlying project state during the async render THEN the render operates on a stale snapshot while the live state diverges, risking data corruption or inconsistent output.

1.3 WHEN `resetUsedUrlsMap()` is called at the start of each batch job in `batchGenerate`, and the previous job's async media sourcing has not fully completed due to timing THEN the URL dedup map may be cleared while the previous job is still writing to it, or the next job may inherit stale entries, starving later jobs of media options.

**Group B — Preview Component Bugs (PreviewStep.tsx)**

1.4 WHEN the thumbnail preview effect runs and creates a blob URL inside the `generate()` closure THEN the cleanup function captures a stale `objectUrl` reference (initialized as `null` before `generate()` completes), so `URL.revokeObjectURL` is never called on the actual blob URL, leaking memory on each preview mount/unmount cycle.

1.5 WHEN the user seeks backward to a segment they already heard using `jumpToTime` THEN `lastNarratedSegment.current` is not reset, so the narration sync effect sees the segment index as already narrated and skips replay for that segment.

1.6 WHEN the PreviewStep component unmounts during active audio playback THEN the `audioRef` Audio element is not paused or cleared in all unmount paths, causing audio to continue playing in the background after the component is gone.

1.7 WHEN `totalDuration` is calculated in the `useMemo` hook THEN it sums durations from `project.script` only and ignores `editPlan.segments` which may contain `adjustedDuration` values, producing an incorrect total duration for the preview timeline.

1.8 WHEN the thumbnail generation effect calls `void generate()` and both `generateSplitScreenThumbnail` and `generateThumbnail` throw errors THEN the errors are silently swallowed because the promise is not caught, and `thumbnailPreviewFailed` may not be set if the error occurs in an unexpected path.

**Group C — Service Layer Bugs (aiEditor.ts, llm.ts, media.ts)**

1.9 WHEN `harvestMediaWithSafetyNet` checks `signal?.aborted` before the initial provider calls and before the fallback calls, but a cancellation occurs between the free-tier `Promise.all(tasks)` resolution and the fallback condition check THEN cancelled operations continue executing paid fallback API calls (Firecrawl, Serper), burning API quota and network resources.

1.10 WHEN `generateAIScript` receives a signal parameter THEN it does not check `signal?.aborted` before making the OpenRouter API call via `fetchWithTimeout`, allowing an already-cancelled operation to initiate a network request.

1.11 WHEN `defaultCaptionSettings` in aiEditor.ts computes word count from `narrationClip?.text` and falls back to `segment.narration` THEN it does not validate that `segment.narration` itself exists, potentially producing an empty string that causes `split(/\s+/).filter(Boolean)` to return an empty array with `length === 0`, leading to incorrect `wordsPerWindow` selection.

1.12 WHEN `applyEditPlan` enforces the 10% total duration constraint by scaling adjusted segment durations proportionally THEN the scaling logic can shrink segments to sub-second durations (e.g., 0.3s) because there is no minimum duration floor, producing segments too short to render meaningfully.

1.13 WHEN `validateEditPlanResponse` validates `entry.shotOrder` THEN it casts the array elements to `string[]` after checking `entry.shotOrder.every((id: unknown) => typeof id === 'string' ...)` but the `every` callback parameter is typed as `unknown` while the outer check uses `entry.shotOrder` as `unknown[]` — the validation is correct but the cast `entry.shotOrder as string[]` happens without the intermediate type narrowing being propagated, creating a fragile type assertion.

1.14 WHEN `searchPicsum` and `searchUnsplash` generate fallback images THEN they assign `baseScore: 100` which, after scoring adjustments, can still rank these generic random images above genuinely relevant images from other sources that received negative penalties.

1.15 WHEN `getContext('2d')` returns null during render setup in videoRenderer.ts THEN the error thrown ("Canvas 2D context unavailable") can be obscured by secondary errors in the cleanup path of the `finally` block, making debugging difficult.

### Expected Behavior (Correct)

**Group A — State Management & Lifecycle Bugs (store.ts)**

2.1 WHEN the user cancels media sourcing THEN the system SHALL ensure `sourcingRef.current` is always reset to `false` in the `finally` block regardless of whether the abort path returns early, so subsequent media sourcing attempts can proceed normally.

2.2 WHEN `assembleVideo` starts THEN the system SHALL capture a deep snapshot of the active project at the start of the render and use that snapshot throughout the entire async operation, preventing concurrent state mutations from affecting the render.

2.3 WHEN batch jobs run sequentially in `batchGenerate` THEN the system SHALL ensure `resetUsedUrlsMap()` is called only after the previous job's media sourcing has fully completed, and SHALL guard against async timing issues by awaiting all pending operations before resetting.

**Group B — Preview Component Bugs (PreviewStep.tsx)**

2.4 WHEN the PreviewStep component unmounts or re-renders THEN the system SHALL revoke the thumbnail blob URL created during the current mount cycle, using a reference that is updated synchronously when the blob URL is created inside the `generate()` closure.

2.5 WHEN the user seeks backward to a previously narrated segment via `jumpToTime` THEN the system SHALL reset `lastNarratedSegment.current` to `-1` (or a value that ensures the target segment will be re-narrated), enabling narration replay for that segment.

2.6 WHEN the PreviewStep component unmounts THEN the system SHALL pause the `audioRef` Audio element and clear its `src` attribute in all unmount/cleanup paths, ensuring no audio continues playing after the component is removed from the DOM.

2.7 WHEN `totalDuration` is calculated THEN the system SHALL account for `editPlan.segments` adjusted durations when available, falling back to `project.script` durations only when no edit plan exists.

2.8 WHEN thumbnail generation fails for both `generateSplitScreenThumbnail` and `generateThumbnail` THEN the system SHALL catch the error from the `void generate()` call and set `thumbnailPreviewFailed = true`, ensuring the failure state is always surfaced to the UI.

**Group C — Service Layer Bugs (aiEditor.ts, llm.ts, media.ts)**

2.9 WHEN `harvestMediaWithSafetyNet` proceeds to the fallback condition after free-tier results are collected THEN the system SHALL check `signal?.aborted` immediately before initiating any paid fallback API calls, and SHALL return early with collected candidates if the signal has been aborted.

2.10 WHEN `generateAIScript` is called with a signal parameter THEN the system SHALL check `signal?.aborted` before making the OpenRouter API call and throw an `AbortError` if the signal is already aborted.

2.11 WHEN `defaultCaptionSettings` or `createDefaultEditPlan` computes narration text for caption settings THEN the system SHALL validate that the narration text is a non-empty string before computing word count, falling back to a safe default (e.g., `wordsPerWindow: 8`) when the text is empty or undefined.

2.12 WHEN `applyEditPlan` scales adjusted segment durations to enforce the 10% total duration constraint THEN the system SHALL enforce a minimum duration floor of 1 second per segment, preventing sub-second segments that cannot be rendered meaningfully.

2.13 WHEN `validateEditPlanResponse` validates `entry.shotOrder` THEN the system SHALL verify each element is actually a string using explicit per-element type checking before casting, ensuring the type assertion is sound and not fragile.

2.14 WHEN `searchPicsum` and `searchUnsplash` generate fallback images THEN the system SHALL assign a `baseScore` of 30 or lower (instead of 100), ensuring these generic random images never outrank genuinely relevant images from real search sources.

2.15 WHEN `getContext('2d')` returns null during render setup THEN the system SHALL throw a clear, descriptive error before entering the try/finally block, preventing the cleanup path from generating secondary errors that obscure the root cause.

### Unchanged Behavior (Regression Prevention)

**Group A — State Management & Lifecycle Bugs (store.ts)**

3.1 WHEN media sourcing completes successfully (no cancellation) THEN the system SHALL CONTINUE TO reset `sourcingRef.current = false` in the `finally` block and return the updated project as before.

3.2 WHEN `assembleVideo` completes a render successfully THEN the system SHALL CONTINUE TO update the project state with the rendered video blob URL, export settings, and status as before.

3.3 WHEN a single batch job runs (not sequential) THEN the system SHALL CONTINUE TO call `resetUsedUrlsMap()` at the start and produce media results as before.

**Group B — Preview Component Bugs (PreviewStep.tsx)**

3.4 WHEN the user plays through segments sequentially without seeking THEN the system SHALL CONTINUE TO narrate each segment exactly once as the playback progresses forward.

3.5 WHEN the PreviewStep component mounts and generates a thumbnail successfully THEN the system SHALL CONTINUE TO display the thumbnail preview image in the UI as before.

3.6 WHEN the user pauses playback THEN the system SHALL CONTINUE TO stop narration and pause audio as before.

3.7 WHEN no edit plan exists on the project THEN the system SHALL CONTINUE TO calculate `totalDuration` from `project.script` segment durations as before.

3.8 WHEN thumbnail generation succeeds on the first attempt THEN the system SHALL CONTINUE TO set `thumbnailPreviewUrl` and display the thumbnail without any error state.

**Group C — Service Layer Bugs (aiEditor.ts, llm.ts, media.ts)**

3.9 WHEN `harvestMediaWithSafetyNet` runs without cancellation and free-tier results are sparse THEN the system SHALL CONTINUE TO trigger paid fallback API calls (Firecrawl, Serper) to supplement results as before.

3.10 WHEN `generateAIScript` is called without a signal parameter or with a non-aborted signal THEN the system SHALL CONTINUE TO make the OpenRouter API call and return parsed script segments as before.

3.11 WHEN narration text is a valid non-empty string THEN the system SHALL CONTINUE TO compute `wordsPerWindow` based on word count thresholds (>100 → 10, ≤50 → 6, otherwise → 8) as before.

3.12 WHEN `applyEditPlan` scales durations and all adjusted segments remain above 1 second THEN the system SHALL CONTINUE TO apply the proportional scaling without modification as before.

3.13 WHEN `validateEditPlanResponse` receives a valid `shotOrder` array with all string elements matching segment asset IDs THEN the system SHALL CONTINUE TO accept and use that shot order as before.

3.14 WHEN DDG, Wikimedia, or other real search sources return relevant images THEN the system SHALL CONTINUE TO score and rank them based on keyword relevance, source authority, and resolution as before.

3.15 WHEN `getContext('2d')` returns a valid context during render setup THEN the system SHALL CONTINUE TO proceed with the full rendering pipeline as before.
