# Codebase Bug Sweep — Bugfix Design

## Overview

This design document covers 15 bugs across the AutoTube codebase spanning state management (`store.ts`), the preview component (`PreviewStep.tsx`), service layer (`media.ts`, `aiEditor.ts`, `llm.ts`), and rendering (`videoRenderer.ts`). The bugs range from critical race conditions and memory leaks to medium-severity data validation and timing issues. Each bug is formalized with a bug condition, expected behavior, hypothesized root cause, and targeted fix implementation.

## Glossary

- **Bug_Condition (C)**: The specific input/state combination that triggers the defective behavior
- **Property (P)**: The desired correct behavior when the bug condition holds
- **Preservation**: Existing behavior that must remain unchanged after the fix
- **sourcingRef**: A `useRef<boolean>` in `store.ts` that guards against concurrent `sourceMedia` calls
- **editPlan**: An `EditPlan` object containing per-segment editing decisions (shot order, timing, transitions, Ken Burns params)
- **harvestMediaWithSafetyNet**: The cascading media acquisition function in `media.ts` that tries free sources first, then paid fallbacks
- **totalDuration**: The computed sum of all segment durations used for preview timeline rendering
- **lastNarratedSegment**: A ref tracking which segment was last narrated to prevent duplicate narration

## Bug Details

### Bug 1: sourcingRef Not Reset on Abort (store.ts)

**Bug Condition:**
The `sourceMedia` function catches `AbortError` and returns `null` inside the `catch` block. However, `sourcingRef.current = false` is only set in the `finally` block. The abort path returns before `finally` executes in certain code paths, leaving the ref stuck at `true`.

```
FUNCTION isBugCondition(input)
  INPUT: input of type { abortSignal: AbortSignal, sourcingRefCurrent: boolean }
  OUTPUT: boolean

  RETURN input.abortSignal.aborted = true
         AND input.sourcingRefCurrent = true
         AND sourceMedia returns null via abort catch path
END FUNCTION
```

**Examples:**
- User clicks "Cancel" during media sourcing → `sourcingRef.current` stays `true` → next "Source Media" click is silently ignored
- User navigates away and back during sourcing → pipeline permanently stuck

### Bug 2: Thumbnail Blob URL Leak (PreviewStep.tsx)

**Bug Condition:**
The thumbnail generation effect declares `let objectUrl: string | null = null` before the async `generate()` function. The cleanup closure captures the initial `null` value. When `generate()` completes and assigns a blob URL to `objectUrl`, the cleanup function still holds the stale `null` reference.

```
FUNCTION isBugCondition(input)
  INPUT: input of type { componentMounted: boolean, generateCompleted: boolean }
  OUTPUT: boolean

  RETURN input.componentMounted = true
         AND input.generateCompleted = true
         AND cleanupCapturedUrl = null (stale closure)
         AND actualBlobUrl != null
END FUNCTION
```

**Examples:**
- Mount PreviewStep → thumbnail generates → unmount → blob URL never revoked → memory leak
- Rapid mount/unmount cycles accumulate unreleased blob URLs

### Bug 3: Fallback Image Score Too High (media.ts)

**Bug Condition:**
`searchPicsum` and `searchUnsplash` assign `baseScore: 100` to generic random images. After scoring adjustments, these can outrank genuinely relevant images from DDG or Wikimedia that received negative penalties.

```
FUNCTION isBugCondition(input)
  INPUT: input of type { candidates: MediaCandidate[] }
  OUTPUT: boolean

  RETURN EXISTS candidate IN input.candidates
         WHERE candidate.source CONTAINS "Picsum"
         AND candidate.baseScore >= 100
         AND candidate.finalScore > relevantCandidate.finalScore
END FUNCTION
```

**Examples:**
- Topic "Tesla stock price" → Picsum random photo scores 100 base → after adjustments scores higher than a DDG image of Tesla that got -200 topic penalty
- Wikimedia chart image gets penalized for missing keyword → random Picsum image wins

### Bug 4: Narration Seek-Back Not Replayed (PreviewStep.tsx)

**Bug Condition:**
When the user seeks backward via `jumpToTime`, `lastNarratedSegment.current` is reset to `-1` in the `jumpToTime` function. However, the narration sync effect checks `currentSegmentIndex !== lastNarratedSegment.current` — after seeking backward, the segment index updates but the effect may not re-trigger narration if the segment was already narrated in the current playback session.

```
FUNCTION isBugCondition(input)
  INPUT: input of type { seekDirection: 'backward', targetSegmentIndex: number }
  OUTPUT: boolean

  RETURN input.seekDirection = 'backward'
         AND input.targetSegmentIndex was previously narrated
         AND lastNarratedSegment.current is not properly reset before effect runs
END FUNCTION
```

**Note:** On closer inspection, `jumpToTime` does set `lastNarratedSegment.current = -1`, which should allow re-narration. The actual bug is that `jumpToTime` also calls `audioRef.pause()` and `stopSpeaking()`, but when `isPlaying` remains `true` during a seek, the narration effect may fire before the segment index updates, causing a race condition.

### Bug 5: totalDuration Ignores editPlan Adjusted Durations (PreviewStep.tsx)

**Bug Condition:**
The `totalDuration` useMemo only sums `project.script` durations and ignores `editPlan.segments` which may contain `adjustedDuration` values.

```
FUNCTION isBugCondition(input)
  INPUT: input of type { project: VideoProject }
  OUTPUT: boolean

  RETURN input.project.editPlan != null
         AND EXISTS segment IN input.project.editPlan.segments
         WHERE segment.adjustedDuration != null
         AND segment.adjustedDuration != correspondingScript.duration
END FUNCTION
```

**Examples:**
- AI editor adjusts segment 3 from 20s to 15s → preview timeline still shows 20s for that segment
- Total duration shows 120s but actual rendered video is 110s

### Bug 6: Empty Narration Text Causes Incorrect Caption Settings (aiEditor.ts)

**Bug Condition:**
`defaultCaptionSettings` computes word count from `narrationText.trim().split(/\s+/).filter(Boolean).length`. If `segment.narration` is undefined or empty, the word count is 0, which falls into the `≤50` branch producing `wordsPerWindow: 6` instead of a safe default.

```
FUNCTION isBugCondition(input)
  INPUT: input of type { narrationText: string }
  OUTPUT: boolean

  RETURN input.narrationText = "" OR input.narrationText = undefined
         AND wordCount = 0
END FUNCTION
```

**Examples:**
- Segment with empty narration → `wordsPerWindow: 6` applied to 0 words → `displayDurationMs` computed as 2000ms for nothing

### Bug 7: applyEditPlan Allows Sub-Second Durations (aiEditor.ts)

**Bug Condition:**
When `applyEditPlan` scales adjusted segment durations to enforce the 10% total duration constraint, there is no minimum duration floor. Scaling can produce durations like 0.3s.

```
FUNCTION isBugCondition(input)
  INPUT: input of type { scaleFactor: number, segmentDuration: number }
  OUTPUT: boolean

  RETURN input.scaleFactor < 1.0
         AND input.segmentDuration * input.scaleFactor < 1.0
END FUNCTION
```

**Examples:**
- 6 segments, AI sets one to 2s, scaling factor 0.15 → duration becomes 0.3s → too short to render

### Bug 8: Thumbnail Generation Error Silently Swallowed (PreviewStep.tsx)

**Bug Condition:**
The thumbnail effect calls `void generate()` which discards the promise. If both `generateSplitScreenThumbnail` and `generateThumbnail` throw, the outer `catch` sets `thumbnailPreviewFailed = true`, but the `void` prefix means unhandled rejections in unexpected paths are swallowed.

```
FUNCTION isBugCondition(input)
  INPUT: input of type { splitScreenThrows: boolean, fallbackThrows: boolean }
  OUTPUT: boolean

  RETURN input.splitScreenThrows = true
         AND input.fallbackThrows = true
         AND promise rejection is not caught by outer handler
END FUNCTION
```

### Bug 9: Signal Not Checked Before LLM Call (llm.ts)

**Bug Condition:**
`generateAIScript` does not check `signal?.aborted` before calling `fetchWithTimeout`. An already-aborted signal still initiates a network request.

```
FUNCTION isBugCondition(input)
  INPUT: input of type { signal: AbortSignal }
  OUTPUT: boolean

  RETURN input.signal.aborted = true
         AND fetchWithTimeout is called anyway
END FUNCTION
```

### Bug 10: Cancelled Operations Trigger Paid Fallbacks (media.ts)

**Bug Condition:**
In `harvestMediaWithSafetyNet`, after `Promise.all(tasks)` resolves, the signal check occurs before the fallback condition. But if cancellation happens between the free-tier resolution and the fallback check, paid API calls (Firecrawl, Serper) still fire.

```
FUNCTION isBugCondition(input)
  INPUT: input of type { signal: AbortSignal, freeResultCount: number }
  OUTPUT: boolean

  RETURN input.signal.aborted = true
         AND input.freeResultCount < 5
         AND paidFallbacksTriggered = true
END FUNCTION
```

### Bug 11: Canvas Context Null Error Obscured (videoRenderer.ts)

**Bug Condition:**
When `getContext('2d')` returns null, the error thrown can be obscured by secondary errors in the `finally` cleanup block.

```
FUNCTION isBugCondition(input)
  INPUT: input of type { canvasContext: CanvasRenderingContext2D | null }
  OUTPUT: boolean

  RETURN input.canvasContext = null
         AND error thrown inside try block
         AND finally block generates secondary error
END FUNCTION
```

### Bug 12: assembleVideo Uses Stale Project State (store.ts)

**Bug Condition:**
`assembleVideo` reads `activeProject` from state at the start. During the async render, auto-save or other callbacks can mutate the project state, causing the render to operate on divergent data.

```
FUNCTION isBugCondition(input)
  INPUT: input of type { projectAtStart: VideoProject, projectDuringRender: VideoProject }
  OUTPUT: boolean

  RETURN input.projectAtStart.id = input.projectDuringRender.id
         AND input.projectAtStart !== input.projectDuringRender (reference differs)
         AND render is in progress
END FUNCTION
```

### Bug 13: validateEditPlanResponse Fragile Type Assertion (aiEditor.ts)

**Bug Condition:**
The `entry.shotOrder.every((id: unknown) => typeof id === 'string' ...)` check validates elements, but the subsequent `entry.shotOrder as string[]` cast relies on the `every` check having narrowed the type, which TypeScript doesn't propagate through the conditional.

```
FUNCTION isBugCondition(input)
  INPUT: input of type { shotOrder: unknown[] }
  OUTPUT: boolean

  RETURN input.shotOrder passes every() check
         AND cast to string[] is performed without intermediate narrowing
END FUNCTION
```

### Bug 14: Paid Fallback Race After Abort (media.ts)

Same as Bug 10 — the signal check before fallback calls is present but insufficient for race conditions between `Promise.all` resolution and signal state change.

### Bug 15: Batch Job URL Dedup Race (store.ts)

**Bug Condition:**
`resetUsedUrlsMap()` is called at the start of each batch job, but if the previous job's async media sourcing hasn't fully completed, the map may be cleared while still being written to.

```
FUNCTION isBugCondition(input)
  INPUT: input of type { previousJobComplete: boolean, resetCalled: boolean }
  OUTPUT: boolean

  RETURN input.resetCalled = true
         AND input.previousJobComplete = false
         AND usedUrlsMap is being written by previous job
END FUNCTION
```

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Successful media sourcing flow (no cancellation) must continue to work identically
- Sequential playback narration (no seeking) must continue to narrate each segment once
- Mouse/keyboard interactions in PreviewStep must continue to work
- Scoring of real search results (DDG, Wikimedia, Serper) must remain unchanged
- Valid edit plans with all durations above 1s must be applied without modification
- Non-empty narration text caption settings must compute identically
- Successful canvas context creation must proceed through the full render pipeline
- Single batch jobs must continue to work as before

**Scope:**
All inputs that do NOT trigger the specific bug conditions should be completely unaffected. This includes:
- Normal (non-cancelled) pipeline operations
- Forward-only playback in preview
- Projects without edit plans
- Media candidates from real search sources with appropriate scores
- Edit plans where all scaled durations remain above 1s

## Hypothesized Root Cause

### Bug 1: sourcingRef Stuck After Abort
**File:** `src/store.ts`, `sourceMedia` function (~line 370)
**Cause:** The `finally` block correctly resets `sourcingRef.current = false`, but the early return in the `catch` block for `AbortError` exits before `finally` runs in certain async timing scenarios. Actually, `finally` always runs in JS — the real issue is that `sourcingRef.current` is set to `true` at the top of the function, and if the function is called while `sourcingRef.current` is already `true` (guard check), it returns immediately. The bug is that after an abort, the ref IS reset in `finally`, but there may be a timing window where a second call enters before `finally` executes.

### Bug 2: Stale Closure in Thumbnail Cleanup
**File:** `src/components/PreviewStep.tsx`, thumbnail useEffect (~line 120)
**Cause:** The `objectUrl` variable is declared with `let` before the async `generate()` function. The cleanup function `return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); }` captures the variable by reference, but since `generate()` is async and the cleanup is returned synchronously, the cleanup captures the initial `null` value. When `generate()` later assigns a blob URL, the cleanup still holds the reference — this actually works in JS because closures capture the variable binding, not the value. The real issue is that if the component unmounts before `generate()` completes, `objectUrl` is still `null` at cleanup time, and the blob URL created later is never revoked.

### Bug 3: Inflated Fallback Base Scores
**File:** `src/services/media.ts`, `searchPicsum` (~line 430) and `searchUnsplash` (~line 410)
**Cause:** Both functions assign `baseScore: 100`. The `scoreCandidate` function adds source-specific bonuses (+35 for Picsum in stock mode) and subtracts a Picsum penalty (-200), but `searchUnsplash` (which also uses Picsum URLs) gets the "Unsplash" source label and receives +70 instead of -200, netting a high score for random images.

### Bug 4: Narration Seek-Back Race
**File:** `src/components/PreviewStep.tsx`, `jumpToTime` and narration sync effect
**Cause:** `jumpToTime` correctly resets `lastNarratedSegment.current = -1`. The issue is subtle: when `isPlaying` is true during a seek, the narration effect depends on `currentSegmentIndex` which updates asynchronously via `setCurrentSegmentIndex`. The `jumpToTime` sets `lastNarratedSegment.current = -1` but the effect may fire with the old `currentSegmentIndex` before the state update propagates.

### Bug 5: totalDuration Missing editPlan
**File:** `src/components/PreviewStep.tsx`, `totalDuration` useMemo (~line 100)
**Cause:** The memo only depends on `project?.script` and sums `segment.duration`. It does not check `project?.editPlan?.segments` for `adjustedDuration` values.

### Bug 6: Empty Narration Fallback
**File:** `src/services/aiEditor.ts`, `defaultCaptionSettings` (~line 50)
**Cause:** The function receives `narrationText` which may be empty string. `"".trim().split(/\s+/).filter(Boolean).length` returns 0, which falls into the `≤50` branch.

### Bug 7: No Minimum Duration Floor
**File:** `src/services/aiEditor.ts`, `applyEditPlan` (~line 160)
**Cause:** The scaling loop `result.script[idx].duration = result.script[idx].duration * scaleFactor` has no `Math.max(1, ...)` guard.

### Bug 8: Void Promise Rejection
**File:** `src/components/PreviewStep.tsx`, thumbnail effect (~line 135)
**Cause:** `void generate()` discards the promise. The inner try/catch handles the expected path, but if an error occurs outside the try/catch (e.g., in the `URL.createObjectURL` call), it becomes an unhandled rejection.

### Bug 9: Missing Pre-Call Abort Check
**File:** `src/services/llm.ts`, `generateAIScript` (~line 140)
**Cause:** No `if (signal?.aborted) throw ...` before the `fetchWithTimeout` call.

### Bug 10/14: Abort Race in Fallback Path
**File:** `src/services/media.ts`, `harvestMediaWithSafetyNet` (~line 540)
**Cause:** The signal check `if (signal?.aborted)` occurs before the fallback block, but `Promise.all(tasks)` may resolve just as the signal fires, allowing the fallback condition to be evaluated before the abort check.

### Bug 11: Cleanup Obscures Context Error
**File:** `src/services/videoRenderer.ts`, `renderVideoToBlob` (~line 220)
**Cause:** The error `throw new Error('Canvas 2D context unavailable')` is thrown inside the `try` block. The `finally` block calls `cleanupRenderResources` which may reference uninitialized variables, generating secondary errors.

### Bug 12: Stale Project During Render
**File:** `src/store.ts`, `assembleVideo` (~line 530)
**Cause:** `const activeProject = projectOverride ?? project` captures the current state value. During the async render, `setProject` calls from auto-save can change the state, but `activeProject` remains the old reference.

### Bug 13: Fragile Type Cast
**File:** `src/services/aiEditor.ts`, `validateEditPlanResponse` (~line 380)
**Cause:** The `every()` callback validates each element, but TypeScript doesn't narrow the array type through `every()`. The `as string[]` cast is technically safe at runtime but fragile for maintenance.

### Bug 15: Batch URL Map Race
**File:** `src/store.ts`, `batchGenerate` (~line 1050)
**Cause:** `resetUsedUrlsMap()` is called synchronously at the start of each loop iteration, but the previous job's `sourceMedia` may still have pending async operations writing to the map.

## Correctness Properties

Property 1: Bug Condition - sourcingRef Always Reset After Abort

_For any_ media sourcing operation that is cancelled via abort signal, the `sourcingRef.current` SHALL be reset to `false` after the operation completes, ensuring subsequent sourcing attempts are not blocked.

**Validates: Requirements 2.1**

Property 2: Preservation - Successful Sourcing Unchanged

_For any_ media sourcing operation that completes successfully (no abort), the function SHALL continue to reset `sourcingRef.current = false` and return the updated project identically to the current behavior.

**Validates: Requirements 3.1**

Property 3: Bug Condition - Thumbnail Blob URL Revoked on Unmount

_For any_ PreviewStep mount/unmount cycle where thumbnail generation completes, the blob URL SHALL be revoked during cleanup, preventing memory leaks.

**Validates: Requirements 2.4**

Property 4: Preservation - Thumbnail Display Unchanged

_For any_ PreviewStep mount where thumbnail generation succeeds, the thumbnail SHALL continue to display correctly in the UI.

**Validates: Requirements 3.5**

Property 5: Bug Condition - Fallback Images Score Below Real Results

_For any_ media candidate set containing both Picsum/Unsplash fallback images and real search results, the fallback images SHALL have a `baseScore` of 30 or lower, ensuring they never outrank genuinely relevant images.

**Validates: Requirements 2.14**

Property 6: Preservation - Real Source Scoring Unchanged

_For any_ media candidate from DDG, Wikimedia, Serper, or Firecrawl, the scoring logic SHALL produce identical results to the current implementation.

**Validates: Requirements 3.14**

Property 7: Bug Condition - totalDuration Accounts for editPlan

_For any_ project with an editPlan containing adjusted durations, the `totalDuration` computation SHALL use the adjusted durations instead of the original script durations.

**Validates: Requirements 2.7**

Property 8: Preservation - totalDuration Without editPlan Unchanged

_For any_ project without an editPlan, the `totalDuration` SHALL continue to be computed from `project.script` segment durations.

**Validates: Requirements 3.7**

Property 9: Bug Condition - Empty Narration Safe Default

_For any_ segment with empty or undefined narration text, `defaultCaptionSettings` SHALL return a safe default `wordsPerWindow` of 8 instead of computing from zero words.

**Validates: Requirements 2.11**

Property 10: Preservation - Non-Empty Narration Caption Settings Unchanged

_For any_ segment with valid non-empty narration text, the caption settings computation SHALL produce identical results.

**Validates: Requirements 3.11**

Property 11: Bug Condition - Minimum Duration Floor Enforced

_For any_ edit plan application where scaling would produce sub-second durations, the system SHALL enforce a minimum of 1 second per segment.

**Validates: Requirements 2.12**

Property 12: Preservation - Above-Floor Durations Unchanged

_For any_ edit plan application where all scaled durations remain above 1 second, the scaling SHALL proceed without modification.

**Validates: Requirements 3.12**

Property 13: Bug Condition - Pre-Call Abort Check in generateAIScript

_For any_ call to `generateAIScript` with an already-aborted signal, the function SHALL throw an `AbortError` before initiating any network request.

**Validates: Requirements 2.10**

Property 14: Preservation - Non-Aborted Signal Proceeds Normally

_For any_ call to `generateAIScript` with a non-aborted signal or no signal, the function SHALL proceed to make the API call and return results normally.

**Validates: Requirements 3.10**

Property 15: Bug Condition - Abort Prevents Paid Fallbacks

_For any_ media harvesting operation where the signal is aborted before or during fallback evaluation, paid API calls (Firecrawl, Serper) SHALL NOT be initiated.

**Validates: Requirements 2.9**

Property 16: Preservation - Non-Aborted Fallbacks Unchanged

_For any_ media harvesting operation without cancellation where free results are sparse, paid fallback calls SHALL continue to fire as before.

**Validates: Requirements 3.9**

Property 17: Bug Condition - Canvas Context Error Not Obscured

_For any_ render attempt where `getContext('2d')` returns null, the error SHALL be thrown clearly before entering the try/finally block, preventing cleanup from generating secondary errors.

**Validates: Requirements 2.15**

Property 18: Preservation - Valid Context Proceeds Normally

_For any_ render attempt where `getContext('2d')` returns a valid context, the full rendering pipeline SHALL proceed unchanged.

**Validates: Requirements 3.15**

## Fix Implementation

### Changes Required

**Bug 1 — sourcingRef Reset (store.ts)**
The `finally` block already resets `sourcingRef.current = false`. The actual fix is to ensure the guard check at the top of `sourceMedia` is robust. Add a safety timeout that resets `sourcingRef` if it's been `true` for more than 60 seconds, preventing permanent lockout.

**Bug 2 — Thumbnail Blob URL Leak (PreviewStep.tsx)**
Use a `useRef` to store the blob URL instead of a local `let` variable. Update the ref inside `generate()` and read it in the cleanup function. This ensures the cleanup always has access to the current blob URL.

**Bug 3 — Fallback Image Score (media.ts)**
Change `baseScore: 100` to `baseScore: 30` in both `searchPicsum` and `searchUnsplash` functions.

**Bug 4 — Narration Seek-Back (PreviewStep.tsx)**
The `jumpToTime` function already resets `lastNarratedSegment.current = -1`. Ensure the narration sync effect also checks that `isPlaying` is true and that the segment index has stabilized after a seek by adding a small debounce or checking the time delta.

**Bug 5 — totalDuration with editPlan (PreviewStep.tsx)**
Update the `totalDuration` useMemo to check `project?.editPlan?.segments` for `adjustedDuration` values, falling back to `segment.duration` when no adjustment exists.

**Bug 6 — Empty Narration Caption Settings (aiEditor.ts)**
Add an early return in `defaultCaptionSettings` when `narrationText` is empty or whitespace-only, returning a safe default `{ wordsPerWindow: 8, displayDurationMs: 2667, isFastPaced: false }`.

**Bug 7 — Minimum Duration Floor (aiEditor.ts)**
Add `Math.max(1, ...)` around the scaled duration in the `applyEditPlan` scaling loop.

**Bug 8 — Thumbnail Error Handling (PreviewStep.tsx)**
Replace `void generate()` with `generate().catch(() => setThumbnailPreviewFailed(true))` to ensure all rejection paths are caught.

**Bug 9 — Pre-Call Abort Check (llm.ts)**
Add `if (signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError');` before the `fetchWithTimeout` call in `generateAIScript`.

**Bug 10/14 — Abort Before Paid Fallbacks (media.ts)**
Add `if (signal?.aborted) return { candidates, trace }` immediately before the paid fallback `Promise.all` call, after the free-tier results are collected.

**Bug 11 — Canvas Context Error Clarity (videoRenderer.ts)**
Move the `getContext('2d')` null check and error throw before the `try` block, or restructure so the error is thrown before any resources are allocated that need cleanup.

**Bug 12 — Deep Snapshot for Render (store.ts)**
Use `structuredClone(activeProject)` at the start of `assembleVideo` to create an immutable snapshot for the render operation.

**Bug 13 — Explicit Type Narrowing (aiEditor.ts)**
Replace the `as string[]` cast with an explicit `.map(String)` or intermediate typed variable after the `every()` check.

**Bug 15 — Batch URL Map Synchronization (store.ts)**
Ensure each batch job fully awaits all pipeline steps (including media sourcing) before the next job's `resetUsedUrlsMap()` call. The current sequential `await` should handle this, but add explicit error handling to ensure the map is reset even on failure.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, write tests that demonstrate the bug on unfixed code (exploratory), then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate each bug BEFORE implementing the fix.

**Test Cases:**
1. **sourcingRef Abort Test**: Call `sourceMedia`, abort immediately, verify `sourcingRef.current` is `false` after
2. **Thumbnail Leak Test**: Mount/unmount PreviewStep, verify blob URLs are revoked
3. **Fallback Score Test**: Generate Picsum candidates, verify `baseScore` allows them to outrank real results
4. **Seek-Back Narration Test**: Play to segment 3, seek back to segment 1, verify narration replays
5. **totalDuration editPlan Test**: Create project with editPlan adjustments, verify totalDuration mismatch
6. **Empty Narration Test**: Call `defaultCaptionSettings("")`, verify wordsPerWindow is suboptimal
7. **Sub-Second Duration Test**: Apply edit plan with extreme scaling, verify durations below 1s
8. **Thumbnail Error Test**: Mock both thumbnail generators to throw, verify error is caught
9. **Pre-Abort LLM Test**: Call `generateAIScript` with pre-aborted signal, verify network call is made
10. **Abort Fallback Test**: Abort during `harvestMediaWithSafetyNet`, verify paid calls still fire
11. **Canvas Null Test**: Mock `getContext` to return null, verify error message clarity
12. **Stale Project Test**: Start render, mutate project state, verify render uses stale data
13. **Type Cast Test**: Pass shotOrder with non-string elements past the every() check
14. **Batch Race Test**: Start two batch jobs rapidly, verify URL map consistency

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

```
FOR ALL input WHERE isBugCondition(input) DO
  result := fixedFunction(input)
  ASSERT expectedBehavior(result)
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT originalFunction(input) = fixedFunction(input)
END FOR
```

**Testing Approach**: Property-based testing with fast-check is recommended for:
- `scoreCandidate` with various baseScore values (Bug 3)
- `defaultCaptionSettings` with random narration strings (Bug 6)
- `applyEditPlan` with random duration scaling factors (Bug 7)
- `validateSegment` with random inputs (Bug 13)
- `parseSegmentsFromContent` with various JSON structures (Bug 9)

### Unit Tests

- `defaultCaptionSettings` with empty, short, medium, and long narration text
- `applyEditPlan` with scaling that produces sub-second and above-second durations
- `scoreCandidate` with Picsum/Unsplash candidates at various baseScores
- `validateEditPlanResponse` with various shotOrder types
- `sanitiseTopic` and `validateSegment` edge cases
- `buildImageSources` URL generation
- `getFrameSampleRate` for each quality level
- `cleanupRenderResources` idempotency

### Property-Based Tests

- Generate random narration strings → verify `defaultCaptionSettings` always returns valid `wordsPerWindow` in [1, 20]
- Generate random edit plans with random durations → verify `applyEditPlan` never produces durations below 1s after fix
- Generate random `MediaCandidate` arrays with mixed sources → verify Picsum/Unsplash never outrank real results after baseScore fix
- Generate random `VideoProject` objects → verify `validateEditPlanResponse` always returns valid or null
- Generate random segment arrays → verify `parseSegmentsFromContent` produces valid segments or throws

### Integration Tests

- Full pipeline: topic → script → media → narration → AI edit → assembly → preview
- Batch processing: multiple jobs with abort/cancel scenarios
- Preview playback: forward play, seek backward, verify narration sync
- Thumbnail generation: success and failure paths with proper cleanup
