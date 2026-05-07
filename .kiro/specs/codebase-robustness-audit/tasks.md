# Implementation Plan: Codebase Robustness Audit

## Overview

Systematic hardening pass across the AutoTube codebase to eliminate hangs, crashes, silent failures, memory leaks, and stuck states. Implementation is organized into 7 phases: core utilities, service hardening, renderer hardening, store hardening, component hardening, logger/analytics safety, and testing.

## Tasks

- [x] 1. Phase 1: Core Utilities — fetchWithTimeout
  - [x] 1.1 Create `src/utils/fetchWithTimeout.ts` with per-attempt timeout, exponential backoff retry, and external AbortSignal support
    - Implement `FetchWithTimeoutOptions` interface (timeoutMs, maxRetries, baseDelayMs, maxDelayMs, signal)
    - Create per-attempt AbortController with setTimeout for timeout enforcement
    - Link per-attempt controller to external signal via abort event listener
    - Retry on 429 and 5xx with exponential backoff: `min(baseDelayMs * 2^(attempt-1), maxDelayMs)`
    - Do NOT retry on 4xx client errors (except 429) — throw immediately
    - On network error (TypeError), retry with backoff
    - Clean up timeout and listener after each attempt
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 16.1, 16.2, 16.5_

  - [x] 1.2 Write property test for fetchWithTimeout timeout and retry behavior
    - **Property 1: fetchWithTimeout enforces per-attempt timeout and correct retry behavior**
    - **Validates: Requirements 1.1, 1.2, 1.5, 1.6, 16.1, 16.2, 16.5**

  - [x] 1.3 Install `fast-check` as a dev dependency
    - Run `npm install --save-dev fast-check`
    - _Requirements: Testing infrastructure_

- [x] 2. Phase 2: Service Hardening — Add timeouts, AbortSignal, and error handling to all services
  - [x] 2.1 Harden `src/services/llm.ts`
    - Replace local `fetchWithRetry` with imported `fetchWithTimeout` from `src/utils/fetchWithTimeout.ts`
    - Set timeoutMs to 30000, maxRetries to 3
    - Add optional `signal?: AbortSignal` parameter to `generateAIScript`
    - Pass signal through to fetchWithTimeout
    - Ensure 4xx errors (except 429) throw immediately without retry
    - _Requirements: 1.1, 1.6, 2.4, 16.1, 16.5_

  - [x] 2.2 Harden `src/services/tts.ts`
    - Replace local `fetchWithRetry` with imported `fetchWithTimeout`
    - Set timeoutMs to 30000, maxRetries to 3
    - Add optional `signal?: AbortSignal` parameter to `generateOpenAITTS`
    - Pass signal through to fetchWithTimeout
    - On AbortError, return null (let cancellation propagate gracefully)
    - _Requirements: 1.2, 1.6, 2.3, 16.2_

  - [x] 2.3 Harden `src/services/llmVisualDirector.ts`
    - Replace local `fetchWithRetry` with imported `fetchWithTimeout`
    - Set timeoutMs to 20000, maxRetries to 2
    - Add optional `signal?: AbortSignal` parameter to `generateAIPlan`
    - On final failure, return fallback plan (already implemented, ensure it still works)
    - _Requirements: 1.4, 1.6, 2.2, 9.7, 16.3_

  - [x] 2.4 Write property test for Visual Director retry with backoff
    - **Property 12: Visual Director retry with backoff**
    - **Validates: Requirements 16.3, 9.7**

  - [x] 2.5 Harden `src/services/media.ts`
    - Add 15-second timeout to all provider fetch calls (searchDDGLocal, searchWikimedia, searchPexels, searchSerper, searchFirecrawl)
    - Add optional `signal?: AbortSignal` parameter to `sourceSegmentMedia`
    - Check signal.aborted before each provider call in `harvestMediaWithSafetyNet`
    - Ensure `sourceSegmentMedia` NEVER throws — wrap entire body in try/catch, return fallback assets on error
    - Ensure all provider search functions return empty array on non-200 responses (already mostly done, verify)
    - _Requirements: 1.3, 2.2, 3.2, 3.7, 16.4_

  - [x] 2.6 Write property test for sourceSegmentMedia never throws
    - **Property 3: sourceSegmentMedia never throws**
    - **Validates: Requirements 3.7**

  - [x] 2.7 Write property test for harvester returns empty array on non-200
    - **Property 13: Harvester returns empty array on non-200**
    - **Validates: Requirements 16.4**

  - [x] 2.8 Add `signal` parameter to `planSegmentVisuals` in `src/services/visualPlanner.ts`
    - Pass signal through to `generateAIPlan`
    - Check signal.aborted before making Wikipedia fetch calls in `resolveTopicContext`
    - _Requirements: 2.2_

- [x] 3. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Phase 3: Renderer Hardening — Canvas cleanup, blob URL tracking, saturation cache clearing
  - [x] 4.1 Add cleanup function to `src/services/videoRenderer.ts`
    - Create `cleanupRenderResources` function that:
      - Sets canvas, offscreen, bgCacheCanvas, and recCanvas dimensions to 0×0 to release GPU memory
      - Revokes all tracked blob URLs created during image loading
      - Clears the `saturationCache` map
      - Clears the `capturedFrames` array (set length to 0)
    - Call `cleanupRenderResources` in the finally block of `renderVideoToBlob` (both success and cancel paths)
    - _Requirements: 5.4, 5.5, 6.4, 6.5, 6.6_

  - [x] 4.2 Track blob URLs created during image loading
    - Add a `blobUrls: string[]` array at the top of `renderVideoToBlob`
    - In `loadImage`, when creating blob URLs via `URL.createObjectURL(blob)`, push the URL to the tracked array
    - Pass the blobUrls array to `cleanupRenderResources` for revocation
    - _Requirements: 5.5_

  - [x] 4.3 Clear saturationCache after render completes
    - Call `saturationCache.clear()` in `cleanupRenderResources`
    - This prevents unbounded growth across multiple render sessions
    - _Requirements: 6.5_

  - [x] 4.4 Clear capturedFrames after encoding
    - After the MediaRecorder `done` promise resolves (or after ffmpeg returns), set `capturedFrames.length = 0`
    - This frees the data URL strings from memory
    - _Requirements: 6.6_

  - [x] 4.5 Write property test for image cache bounded to maximum size
    - **Property 5: Image cache bounded to maximum size**
    - **Validates: Requirements 5.6**

  - [x] 4.6 Write property test for captured frames bounded to maximum count
    - **Property 6: Captured frames bounded to maximum count**
    - **Validates: Requirements 6.1**

  - [x] 4.7 Write property test for canvas safety classification
    - **Property 9: Canvas safety classification**
    - **Validates: Requirements 12.1**

  - [x] 4.8 Write property test for canvas dimensions match quality preset
    - **Property 10: Canvas dimensions match quality preset**
    - **Validates: Requirements 12.4**

  - [x] 4.9 Write property test for image source ordering
    - **Property 17: Image source ordering**
    - **Validates: Requirements 19.1**

- [x] 5. Phase 4: Store Hardening — AbortSignal refs, auto-save/restore, processing state reset, blob URL cleanup
  - [x] 5.1 Add AbortController refs for script, media, and narration steps in `src/store.ts`
    - Add `scriptAbortRef`, `mediaAbortRef`, `narrationAbortRef` as `useRef<AbortController | null>(null)`
    - In `generateScript`: create new AbortController, store in scriptAbortRef, pass signal to `generateAIScript`
    - In `sourceMedia`: create new AbortController, store in mediaAbortRef, pass signal to `sourceSegmentMedia` and `planSegmentVisuals`
    - In `generateNarration`: create new AbortController, store in narrationAbortRef, pass signal to `generateOpenAITTS`
    - On AbortError in each step: reset step status to 'active', clear progress
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [x] 5.2 Add cancel mechanism for all pipeline steps
    - Create `cancelCurrentOperation` function that aborts whichever step is currently processing
    - Check `stepStatuses` to determine which step is active, abort the corresponding ref
    - Expose `cancelCurrentOperation` from the store hook
    - _Requirements: 2.5, 2.6_

  - [x] 5.3 Implement auto-save to localStorage
    - Save project, stepStatuses, currentStep, and topicConfig to `autotube_project` key whenever they change
    - Wrap localStorage.setItem in try/catch to handle quota errors
    - Use a debounced save (300ms) to avoid excessive writes
    - _Requirements: 8.1, 21.1_

  - [x] 5.4 Implement project restore on load with validation
    - In `loadProject`, read from localStorage and validate structure
    - Create `validateStoredProject` function that checks required fields exist
    - Reset any 'processing' step statuses to 'active' on load
    - If restored project has 'complete' status, navigate to preview step
    - Handle corrupted/invalid JSON gracefully — fall back to fresh state
    - Merge loaded config with defaults to handle missing fields from older versions
    - _Requirements: 7.3, 7.4, 8.2, 8.3, 8.4, 8.5, 21.2, 21.3_

  - [x] 5.5 Write property test for processing steps reset on page reload
    - **Property 7: Processing steps reset on page reload**
    - **Validates: Requirements 7.4, 8.4**

  - [x] 5.6 Write property test for corrupted localStorage handled gracefully
    - **Property 8: Corrupted localStorage handled gracefully**
    - **Validates: Requirements 8.5, 17.4**

  - [x] 5.7 Write property test for config merge with defaults
    - **Property 19: Config merge with defaults**
    - **Validates: Requirements 21.2, 21.3**

  - [x] 5.8 Revoke blob URLs on project reset
    - In `resetProject`, revoke thumbnail blob URL if it starts with 'blob:'
    - Revoke all narration audioUrl blob URLs
    - Stop any in-progress speech synthesis via `stopSpeaking()`
    - Call `resetUsedUrlsMap()` from media service
    - Reset all step statuses to initial values, clear progress/message
    - _Requirements: 5.7, 18.1, 18.2, 18.3, 18.4_

- [x] 6. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Phase 5: Component Hardening — Error states, cleanup on unmount, onboarding skip
  - [x] 7.1 Harden `src/components/PreviewStep.tsx`
    - Revoke thumbnail preview blob URL on unmount (already has cleanup in useEffect, verify it works)
    - Stop audio playback on unmount (audioRef.pause(), audioRef.src = '')
    - Stop speech synthesis on unmount via `stopSpeaking()`
    - Cancel animation frame on unmount (already done, verify)
    - Wrap thumbnail generation in try/catch with fallback placeholder (already done, verify)
    - _Requirements: 4.1, 5.3, 18.5, 22.3_

  - [x] 7.2 Harden `src/components/MediaStep.tsx`
    - Wrap `onReplace` call in try/catch
    - On error, display inline error message on the asset card
    - Reset replacing state on error
    - _Requirements: 4.2_

  - [x] 7.3 Harden `src/components/NarrationStep.tsx`
    - Wrap audio playback in try/catch
    - On playback error, reset playing state and show clip as playable
    - Stop speech synthesis when navigating away (useEffect cleanup)
    - _Requirements: 4.3, 22.3_

  - [x] 7.4 Harden `src/components/SettingsModal.tsx`
    - Wrap `verifyAll` function body in try/catch
    - On verification failure, set status to 'invalid' without crashing the modal
    - Already partially implemented — ensure all fetch calls have catch handlers
    - _Requirements: 4.5, 11.4_

  - [x] 7.5 Verify OnboardingModal skip behavior
    - Confirm "Skip" button on first step saves config with empty keys and closes modal
    - Confirm "Get Started" on final step saves and closes
    - Already implemented — verify no regressions
    - _Requirements: 13.1, 13.2, 13.3_

  - [x] 7.6 Verify PreviewStep stops speech on storyboard mode switch
    - Already implemented (`useEffect` that calls `stopSpeaking()` on mode change)
    - Verify audio is also paused
    - _Requirements: 22.4_

- [x] 8. Phase 6: Logger/Analytics Safety — Bounded buffers, localStorage error handling
  - [x] 8.1 Harden `src/services/logger.ts`
    - Wrap subscriber callback invocation in try/catch
    - If subscriber throws, catch the error, log to console, and continue
    - Verify in-memory buffer is capped to 100 entries (already done in store subscription)
    - _Requirements: 15.2, 15.3_

  - [x] 8.2 Harden `src/services/analytics.ts`
    - Verify localStorage writes are wrapped in try/catch (already done)
    - Verify stored entries are capped to 50 (already done)
    - Ensure `getAnalytics` handles corrupted JSON gracefully (already returns [] on catch)
    - _Requirements: 15.1, 15.4_

  - [x] 8.3 Harden `src/services/youtube.ts`
    - Wrap `navigator.clipboard?.writeText` in try/catch
    - On clipboard failure, log warning and continue without crashing
    - Already uses optional chaining — add explicit catch on the promise
    - _Requirements: 20.5_

  - [x] 8.4 Write property test for bounded storage collections
    - **Property 11: Bounded storage collections**
    - **Validates: Requirements 15.1, 15.2, 15.3, 15.4**

- [x] 9. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Phase 7: Testing — Property-based tests for remaining correctness properties
  - [x] 10.1 Write property test for segment-level failure isolation
    - **Property 2: Segment-level failure isolation**
    - **Validates: Requirements 3.2, 3.3**

  - [x] 10.2 Write property test for batch job failure isolation
    - **Property 4: Batch job failure isolation**
    - **Validates: Requirements 4.4, 14.1**

  - [x] 10.3 Write property test for segment validation produces valid defaults
    - **Property 14: Segment validation produces valid defaults**
    - **Validates: Requirements 17.1**

  - [x] 10.4 Write property test for visual plan validation produces valid fallback
    - **Property 15: Visual plan validation produces valid fallback**
    - **Validates: Requirements 17.2**

  - [x] 10.5 Write property test for parseSegmentsFromContent handles multiple formats
    - **Property 16: parseSegmentsFromContent handles multiple formats**
    - **Validates: Requirements 17.5**

  - [x] 10.6 Write property test for YouTube metadata truncation
    - **Property 18: YouTube metadata truncation**
    - **Validates: Requirements 20.4**

  - [x] 10.7 Write unit tests for abort signal propagation through the store
    - Test that cancelling during script generation aborts the fetch
    - Test that cancelling during media sourcing stops new requests
    - Test that cancelling during narration stops new TTS calls
    - Test that step status resets to 'active' after cancel
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [x] 10.8 Write unit tests for blob URL revocation on reset
    - Test that resetProject revokes thumbnail blob URL
    - Test that resetProject revokes narration audio blob URLs
    - Test that re-generating narration revokes old blob URLs
    - _Requirements: 5.1, 5.2, 5.7, 18.1_

- [x] 11. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The project uses TypeScript, React, Vitest, and fast-check for property-based testing
- All property tests should use `fc.assert(property, { numRuns: 100 })` minimum
- Test files go in `src/services/__tests__/` directory
