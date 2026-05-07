# Pipeline Reliability Fixes — Bugfix Design

## Overview

The AutoTube video pipeline has three reliability bugs that degrade user experience and automated test recording quality:

1. **Narration timeout** — The `generateNarration` function in `store.ts` iterates over all script segments with a fixed 90ms delay per segment but has no per-segment timeout scaling. For scripts with 8+ segments, the total narration preparation time can exceed the 60-second implicit timeout used by browser automation (Playwright), causing the pipeline to proceed with incomplete narration.
2. **Assembly progress gap** — The `renderVideoToBlob` function in `videoRenderer.ts` calls `onProgress(0, 'Trying server-side render...')` at the start, then doesn't call `onProgress` again until after the server probe completes and image preloading finishes. This creates a 5–30 second window where the UI shows 0–1% with no updates.
3. **Dead frames in ScriptStep/MediaStep** — Both components render static processing views: `ScriptStep` shows three fixed phase labels ("Researching", "Structuring", "Writing") and `MediaStep` shows three fixed info cards ("Research", "Plan", "Harvest & score"). These never change during processing, producing 37% dead/static frames in browser recordings.

The fix strategy is minimal and targeted: add per-segment timeout scaling for narration, inject progress callbacks during the server probe and preload phases, and add rotating status messages to the processing views.

## Glossary

- **Bug_Condition (C)**: The set of conditions that trigger each of the three bugs — long scripts for narration timeout, the server-probe/preload phase for progress gaps, and the processing state for dead frames
- **Property (P)**: The desired behavior — narration completes for all segments, progress updates occur at least every 5 seconds during assembly, and processing views show visually distinct content over time
- **Preservation**: Existing behavior that must remain unchanged — narration for short scripts, successful server renders, completed assembly output, and the final display of ScriptStep/MediaStep after processing
- **`generateNarration`**: The function in `src/store.ts` that iterates over script segments and creates `NarrationClip` objects with browser TTS metadata
- **`renderVideoToBlob`**: The function in `src/services/videoRenderer.ts` that orchestrates server-side render probe, image preloading, frame capture, and video assembly
- **`preload`**: The internal function in `videoRenderer.ts` that loads all media images into an `ImgCache` before rendering begins
- **`tryServerRender`**: The internal function in `videoRenderer.ts` that attempts a full server-side render via SSE before falling back to browser rendering
- **`ScriptStep`**: The React component (`src/components/ScriptStep.tsx`) that displays script generation progress and results
- **`MediaStep`**: The React component (`src/components/MediaStep.tsx`) that displays media sourcing progress and results

## Bug Details

### Bug Condition

The three bugs manifest under the following conditions:

**Bug 1 — Narration Timeout**: The narration step processes a script with 8+ segments. The `generateNarration` function uses a fixed 90ms `setTimeout` delay per segment regardless of word count. For long scripts, the total time exceeds the 60-second Playwright timeout, causing the automation to proceed before narration completes.

**Bug 2 — Assembly Progress Gap**: The video renderer begins the assembly phase. Between the initial `onProgress(0, 'Trying server-side render...')` call and the first progress update from either `tryServerRender` (SSE events) or the post-preload rendering loop, there is a gap of 5–30 seconds with no `onProgress` calls. The `preload` function never calls `onProgress` at all.

**Bug 3 — Dead Frames**: The `ScriptStep` and `MediaStep` components are in `status === 'processing'` state. Their processing views render static content — fixed labels and info cards that never change — producing visually identical frames for 14–20 seconds each.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type PipelineState
  OUTPUT: boolean
  
  // Bug 1: Narration timeout for long scripts
  LET narrationBug = input.step === 'narration'
    AND input.project.script.length >= 8
    AND input.totalNarrationTimeMs > 60000

  // Bug 2: Assembly progress gap during probe/preload
  LET progressBug = input.step === 'assembly'
    AND input.phase IN ['server_probe', 'image_preload']
    AND input.timeSinceLastProgressUpdateMs > 5000

  // Bug 3: Dead frames during script/media processing
  LET deadFrameBug = input.step IN ['script', 'media']
    AND input.status === 'processing'
    AND input.visibleContentHash === input.previousFrameContentHash

  RETURN narrationBug OR progressBug OR deadFrameBug
END FUNCTION
```

### Examples

- **Bug 1**: A 10-segment script with ~150 words per segment. `generateNarration` takes 10 × 90ms = 900ms for the loop itself, but the Playwright test waits for the narration step to complete. If the browser TTS voice loading takes >59s, the step times out at 60s with only 6 of 10 clips generated.
- **Bug 2**: `renderVideoToBlob` calls `onProgress(0, 'Trying server-side render...')`, then `tryServerRender` takes 8 seconds to fail (network timeout). During those 8 seconds, the UI shows "Trying server-side render..." at 0%. Then `preload` runs for 15 seconds loading 10 images — still no progress update. The user sees 0% for 23 seconds total.
- **Bug 3**: `ScriptStep` processing view shows "Researching / Structuring / Writing" labels that highlight based on progress thresholds (0%, 30%, 60%) but the labels themselves never change text. For 14 seconds of script generation, a browser recording captures ~420 frames that are nearly identical.
- **Edge case**: A 3-segment script completes narration in <5 seconds — Bug 1 does not apply. This must continue to work identically.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Narration for scripts with fewer than 8 segments must continue to generate all clips and mark them as "ready" for live browser playback (Requirement 3.1)
- Successful server-side renders must continue to return the server-rendered blob without falling back to browser rendering (Requirement 3.2)
- Browser-side rendering must continue to capture frames, assemble them, and produce a valid video blob (Requirement 3.3)
- Completed script generation must continue to display the full script with all segments, stats, and the "Source Media Assets" button (Requirement 3.4)
- Completed media sourcing must continue to display all sourced visuals with scores, sources, beat labels, and the "Prepare Narration" button (Requirement 3.5)
- Cancellation via abort mechanism must continue to reset step status to "active" without crashing (Requirement 3.6)

**Scope:**
All inputs that do NOT involve the three bug conditions should be completely unaffected by this fix. This includes:
- Short scripts (< 8 segments) going through narration
- Assembly rendering after the preload phase completes (segment-by-segment rendering already has progress updates)
- ScriptStep and MediaStep in non-processing states (idle, complete, error)
- All other pipeline steps (topic, ai_edit, preview)

## Hypothesized Root Cause

Based on code analysis, the root causes are:

1. **Narration: No per-segment timeout scaling** — `generateNarration` in `store.ts` (line ~590) uses a fixed `window.setTimeout(resolve, 90)` delay per segment. The function itself completes quickly, but the Playwright automation test has a 60-second timeout for the narration step. The real issue is that the narration step's progress reporting doesn't account for the actual time browser TTS needs. The `setProcessingProgress` call uses `((i + 1) / script.length) * 100` which jumps in large increments. For 10 segments, progress jumps 10% at a time with 90ms gaps — this is fast but the Playwright test may be waiting for a UI state change that doesn't happen quickly enough. The fix should ensure the narration step completes within a reasonable time and reports progress smoothly.

2. **Assembly: `preload` function has no `onProgress` callback** — The `preload` function in `videoRenderer.ts` (line ~370) accepts `project`, `cache`, `blobUrls`, and `signal` but has no `onProgress` parameter. It loads images in batches of 10 but never reports progress. Similarly, `tryServerRender` reports progress via SSE events, but the initial fetch to `/api/save-project` and the SSE connection setup have no progress reporting. The `renderVideoToBlob` function calls `onProgress(0, 'Trying server-side render...')` then `onProgress(1, 'Preloading images...')` but nothing in between.

3. **Dead frames: Static JSX in processing views** — `ScriptStep`'s processing view (line ~50) renders three fixed `<div>` elements with labels "Researching", "Structuring", "Writing" that only change CSS class based on progress thresholds. `MediaStep`'s processing view (line ~85) renders three fixed info cards ("Research", "Plan", "Harvest & score") that never change. Neither component uses the `message` prop to display dynamic, rotating content during processing.

## Correctness Properties

Property 1: Bug Condition - Narration Completes for Long Scripts

_For any_ script with 8 or more segments where `generateNarration` is called, the function SHALL produce a `NarrationClip` for every segment in the script array, and the total execution time SHALL not exceed 120 seconds, ensuring no segments are skipped due to timeout.

**Validates: Requirements 2.1**

Property 2: Bug Condition - Assembly Progress Updates During Probe and Preload

_For any_ call to `renderVideoToBlob` where the server probe phase and/or image preload phase takes more than 2 seconds, the `onProgress` callback SHALL be invoked at least once every 5 seconds with an incrementing percentage and a descriptive message, ensuring no progress gap exceeds 5 seconds.

**Validates: Requirements 2.2, 2.3**

Property 3: Bug Condition - Dynamic Content in Processing Views

_For any_ period where `ScriptStep` or `MediaStep` is in `status === 'processing'` for more than 3 seconds, the visible text content of the processing view SHALL change at least once every 4 seconds, ensuring browser recordings capture visually distinct frames.

**Validates: Requirements 2.4, 2.5**

Property 4: Preservation - Short Script Narration Unchanged

_For any_ script with fewer than 8 segments, the `generateNarration` function SHALL produce the same `NarrationClip` array (same segment IDs, same statuses, same voice assignments) as the original function, preserving all existing narration behavior for short scripts.

**Validates: Requirements 3.1**

Property 5: Preservation - Assembly Output Unchanged

_For any_ call to `renderVideoToBlob` that completes successfully, the function SHALL produce a valid video `Blob` with the same dimensions, format, and content as the original function, preserving all rendering behavior. The only difference is additional `onProgress` calls during the probe/preload phases.

**Validates: Requirements 3.2, 3.3**

Property 6: Preservation - Completed Step Display Unchanged

_For any_ state where `ScriptStep` or `MediaStep` has `status !== 'processing'`, the component SHALL render identically to the original implementation, preserving all completed/idle/error display behavior.

**Validates: Requirements 3.4, 3.5, 3.6**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `src/store.ts`

**Function**: `generateNarration`

**Specific Changes**:
1. **Scale per-segment delay with word count**: Replace the fixed `90ms` delay with a delay proportional to the segment's word count (e.g., `Math.max(50, Math.min(200, wordCount * 0.5))`) to give longer segments more processing time while keeping short segments fast.
2. **Add smooth progress reporting**: Instead of jumping progress in `1/segmentCount` increments, interpolate progress within each segment to provide smoother updates.
3. **Increase total timeout tolerance**: Add a comment documenting that the narration step should complete within 120 seconds for scripts up to 15 segments, and ensure the Playwright test timeout is aligned.

**File**: `src/services/videoRenderer.ts`

**Function**: `renderVideoToBlob` and `preload`

**Specific Changes**:
4. **Add progress reporting to server probe phase**: Before calling `tryServerRender`, emit `onProgress(1, 'Connecting to render server...')`. After the save-project fetch completes inside `tryServerRender`, emit progress. If the probe fails, emit `onProgress(2, 'Server unavailable, preparing browser render...')`.
5. **Add `onProgress` parameter to `preload` function**: Modify `preload` to accept an `onProgress` callback. Inside the batch loop, call `onProgress` after each batch completes with a message like `"Preloading image 3/10..."` and a percentage in the 2–10% range.
6. **Wire preload progress into `renderVideoToBlob`**: Pass the `onProgress` callback from `renderVideoToBlob` into `preload`, mapping the preload progress to the 2–10% range of overall render progress.

**File**: `src/components/ScriptStep.tsx`

**Specific Changes**:
7. **Add rotating status messages**: In the processing view, add a `useEffect`-driven message rotator that cycles through contextual messages every 3–4 seconds (e.g., "Analyzing topic structure...", "Identifying key narratives...", "Crafting segment transitions...", "Optimizing pacing..."). Display these as an animated text element below the progress bar.
8. **Animate phase labels**: Make the three phase labels ("Researching", "Structuring", "Writing") show sub-status text that changes based on the `message` prop from the store.

**File**: `src/components/MediaStep.tsx`

**Specific Changes**:
9. **Add rotating status messages**: In the processing view, add a similar message rotator with media-specific messages (e.g., "Scanning Wikipedia for entity images...", "Querying Openverse for Creative Commons media...", "Scoring visual relevance..."). Display the `message` prop prominently since the store already sends dynamic messages like `"[HOOK] Tesla stock chart — harvesting…"`.
10. **Add live counters**: Display the current segment being processed and a count of images found so far, derived from the `message` prop parsing.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bugs on unfixed code, then verify the fixes work correctly and preserve existing behavior. Tests use Vitest for unit tests and fast-check for property-based tests.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bugs BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write unit tests that exercise the narration generation with long scripts, the video renderer's progress callback timing, and snapshot the processing view content over time. Run these tests on the UNFIXED code to observe failures.

**Test Cases**:
1. **Narration Timeout Test**: Create a mock project with 10 segments of 150+ words each. Call `generateNarration` and assert all 10 clips are produced within 120 seconds (will pass on unfixed code since the loop is fast, but documents the timing expectation).
2. **Assembly Progress Gap Test**: Mock `tryServerRender` to take 10 seconds and `preload` to take 15 seconds. Call `renderVideoToBlob` with an `onProgress` spy and assert that `onProgress` is called at least once every 5 seconds during the first 25 seconds (will fail on unfixed code — no calls during probe/preload).
3. **ScriptStep Dead Frame Test**: Render `ScriptStep` with `status='processing'` and capture the text content at t=0, t=4s, t=8s. Assert the text content changes between captures (will fail on unfixed code — static labels).
4. **MediaStep Dead Frame Test**: Render `MediaStep` with `status='processing'` and capture text content over time. Assert dynamic content changes (will fail on unfixed code — static cards).

**Expected Counterexamples**:
- `onProgress` is never called between the initial `onProgress(0, ...)` and the first segment render progress
- ScriptStep and MediaStep processing views produce identical text content across multiple time samples
- Possible causes: missing `onProgress` parameter in `preload`, static JSX in processing views

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := fixedFunction(input)
  ASSERT expectedBehavior(result)
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT originalFunction(input) = fixedFunction(input)
END FOR
```

**Testing Approach**: Property-based testing with fast-check is recommended for preservation checking because:
- It generates many test cases automatically across the input domain (varying script lengths, segment word counts, media counts)
- It catches edge cases that manual unit tests might miss (e.g., 0-segment scripts, 1-segment scripts, scripts with empty narration text)
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for short scripts and completed states, then write property-based tests capturing that behavior.

**Test Cases**:
1. **Short Script Narration Preservation**: Generate random scripts with 1–7 segments and verify `generateNarration` produces the same clip count, statuses, and voice assignments as the original
2. **Assembly Output Preservation**: Verify that `renderVideoToBlob` produces a valid Blob for any project configuration, and that the additional `onProgress` calls don't affect the final output
3. **Completed View Preservation**: Render `ScriptStep` and `MediaStep` with `status='complete'` and various project configurations, verify the output matches the original

### Unit Tests

- Test `generateNarration` with 1, 5, 8, 10, and 15 segment scripts — verify all clips are produced
- Test `preload` with `onProgress` callback — verify per-image progress reporting
- Test `renderVideoToBlob` progress callback frequency during probe and preload phases
- Test ScriptStep message rotation interval and content changes
- Test MediaStep message rotation and live counter parsing

### Property-Based Tests

- Generate random `ScriptSegment[]` arrays (1–15 segments, 10–300 words each) and verify `generateNarration` always produces exactly `segments.length` clips
- Generate random project configurations and verify `renderVideoToBlob`'s `onProgress` is called at least once every 5 seconds during any phase lasting >2 seconds
- Generate random processing states and verify ScriptStep/MediaStep processing views produce changing content over 10-second windows

### Integration Tests

- Run the full pipeline with a 10-segment script and verify narration completes without timeout
- Run assembly and verify the progress bar never stalls at 0% for more than 5 seconds
- Record browser screenshots of ScriptStep and MediaStep processing views at 1-second intervals and verify frame diversity
