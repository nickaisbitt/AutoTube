# Tasks — Codebase Bug Sweep

## Group A: State Management & Lifecycle Bugs (store.ts)

- [x] 1. Fix sourcingRef not reset on abort
  - [x] 1.1 Add safety timeout in `sourceMedia` that resets `sourcingRef.current` if stuck for >60s
  - [x] 1.2 Add explicit `sourcingRef.current = false` in the abort catch path before returning null
  - [x] 1.3 Write unit test: abort sourceMedia → verify sourcingRef.current is false

- [x] 2. Fix assembleVideo stale project state
  - [x] 2.1 Add `structuredClone(activeProject)` at the start of `assembleVideo` to create an immutable render snapshot
  - [x] 2.2 Use the cloned snapshot throughout the render instead of `activeProject`
  - [x] 2.3 Write unit test: verify render snapshot is independent of subsequent state mutations

- [x] 3. Fix batch job URL dedup race condition
  - [x] 3.1 Ensure `resetUsedUrlsMap()` is called only after the previous job's full pipeline has completed (verify sequential await is sufficient)
  - [x] 3.2 Add error handling to ensure `resetUsedUrlsMap()` is called even if a job fails mid-pipeline
  - [x] 3.3 Write unit test: verify URL map is clean at the start of each batch job

## Group B: Preview Component Bugs (PreviewStep.tsx)

- [x] 4. Fix thumbnail blob URL memory leak
  - [x] 4.1 Replace local `let objectUrl` with a `useRef<string | null>(null)` to store the blob URL
  - [x] 4.2 Update `generate()` to write to the ref: `objectUrlRef.current = URL.createObjectURL(blob)`
  - [x] 4.3 Update cleanup to read from the ref: `if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)`
  - [x] 4.4 Write unit test: mount/unmount PreviewStep → verify blob URL is revoked

- [x] 5. Fix narration seek-back not replayed
  - [x] 5.1 Verify `jumpToTime` correctly resets `lastNarratedSegment.current = -1`
  - [x] 5.2 Add a guard in the narration sync effect to re-check segment index after seek operations
  - [x] 5.3 Write unit test: play to segment 3, seek back to segment 1, verify narration triggers

- [x] 6. Fix audio not stopped on unmount
  - [x] 6.1 Verify the existing `useEffect` cleanup for `audioRef` pauses and clears src on unmount
  - [x] 6.2 Add `audioRef.pause(); audioRef.src = '';` to any additional unmount/cleanup paths if missing
  - [x] 6.3 Write unit test: unmount PreviewStep during playback → verify audio is paused

- [x] 7. Fix totalDuration ignoring editPlan adjusted durations
  - [x] 7.1 Update `totalDuration` useMemo to check `project?.editPlan?.segments` for `adjustedDuration` values
  - [x] 7.2 Fall back to `segment.duration` when no editPlan or no adjustment exists for a segment
  - [x] 7.3 Add `project?.editPlan` to the useMemo dependency array
  - [x] 7.4 Write unit test: project with editPlan adjustments → verify totalDuration reflects adjusted values
  - [x] 7.5 Write unit test: project without editPlan → verify totalDuration unchanged

- [x] 8. Fix thumbnail generation error silently swallowed
  - [x] 8.1 Replace `void generate()` with `generate().catch(() => setThumbnailPreviewFailed(true))`
  - [x] 8.2 Write unit test: mock both thumbnail generators to throw → verify `thumbnailPreviewFailed` is set

## Group C: Service Layer Bugs (aiEditor.ts, llm.ts, media.ts)

- [x] 9. Fix cancelled operations triggering paid fallbacks (media.ts)
  - [x] 9.1 Add `if (signal?.aborted) return { candidates, trace }` immediately before the paid fallback `Promise.all` in `harvestMediaWithSafetyNet`
  - [x] 9.2 Write unit test: abort signal before fallback → verify Firecrawl/Serper not called

- [x] 10. Fix signal not checked before LLM call (llm.ts)
  - [x] 10.1 Add `if (signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError')` before `fetchWithTimeout` in `generateAIScript`
  - [x] 10.2 Write unit test: call `generateAIScript` with pre-aborted signal → verify AbortError thrown without network call

- [x] 11. Fix empty narration text caption settings (aiEditor.ts)
  - [x] 11.1 Add early return in `defaultCaptionSettings` when narrationText is empty/whitespace: return `{ wordsPerWindow: 8, displayDurationMs: 2667, isFastPaced: false }`
  - [x] 11.2 Write unit test: `defaultCaptionSettings("")` → verify safe defaults returned
  - [x] 11.3 Write unit test: `defaultCaptionSettings("valid text")` → verify unchanged behavior
  - [x] 11.4 Write property-based test: random strings → verify wordsPerWindow always in [1, 20]

- [x] 12. Fix applyEditPlan sub-second duration floor (aiEditor.ts)
  - [x] 12.1 Add `Math.max(1, ...)` around the scaled duration in the `applyEditPlan` scaling loop
  - [x] 12.2 Write unit test: scaling that would produce 0.3s → verify minimum 1s enforced
  - [x] 12.3 Write unit test: scaling that produces 5s → verify no modification
  - [x] 12.4 Write property-based test: random durations and scale factors → verify no duration below 1s

- [x] 13. Fix validateEditPlanResponse fragile type assertion (aiEditor.ts)
  - [x] 13.1 Replace `entry.shotOrder as string[]` with explicit per-element mapping after the `every()` check
  - [x] 13.2 Write unit test: valid shotOrder → verify accepted
  - [x] 13.3 Write unit test: shotOrder with non-string elements → verify rejected/fallback

- [x] 14. Fix fallback image baseScore too high (media.ts)
  - [x] 14.1 Change `baseScore: 100` to `baseScore: 30` in `searchPicsum`
  - [x] 14.2 Change `baseScore: 100` to `baseScore: 30` in `searchUnsplash`
  - [x] 14.3 Write unit test: verify Picsum candidates have baseScore 30
  - [x] 14.4 Write unit test: verify Picsum candidates score below real DDG/Wikimedia results
  - [x] 14.5 Write property-based test: random candidate sets → verify Picsum never outranks real results with positive topic overlap

- [x] 15. Fix canvas context null error obscured (videoRenderer.ts)
  - [x] 15.1 Move the `getContext('2d')` null check and error throw before the `try` block, or restructure to throw before resource allocation
  - [x] 15.2 Ensure the `finally` cleanup handles null canvas/context gracefully without secondary errors
  - [x] 15.3 Write unit test: mock `getContext` to return null → verify clear error message without secondary errors

## Verification

- [x] 16. Run full test suite
  - [x] 16.1 Run `npm run test:unit` and verify all existing tests pass
  - [x] 16.2 Run `npm run build` and verify no TypeScript compilation errors
  - [x] 16.3 Verify no regressions in existing functionality
