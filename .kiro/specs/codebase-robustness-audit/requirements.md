# Requirements Document — Codebase Robustness Audit

## Introduction

A systematic robustness and reliability audit across the entire AutoTube codebase. The goal is to identify and harden every service, component, and module against hangs, crashes, unresponsive UI, memory leaks, silent failures, and stuck states. Several critical issues were already discovered during real rendering sessions (preload hangs, broken cancel, Safari memory crashes, stuck processing states after reload). Some fixes have been applied, but this spec covers the broader, systematic pass across all files.

## Glossary

- **Renderer**: The `videoRenderer.ts` service that composites frames on a canvas and encodes them into a video blob.
- **Harvester**: The `media.ts` service that sources images from multiple providers (DDG, Wikimedia, Unsplash, Pexels, etc.).
- **TTS_Service**: The `tts.ts` service that generates text-to-speech audio via OpenAI or browser SpeechSynthesis.
- **LLM_Service**: The `llm.ts` service that generates AI scripts via OpenRouter.
- **Visual_Director**: The `llmVisualDirector.ts` + `visualPlanner.ts` services that plan per-segment visuals.
- **Store**: The `store.ts` central state management hook (`useVideoProject`).
- **Pipeline**: The sequential flow: Topic → Script → Media → Narration → Assembly → Preview.
- **Abort_Signal**: A browser `AbortSignal` used to cancel in-flight async operations.
- **Blob_URL**: A URL created via `URL.createObjectURL()` that must be revoked to free memory.
- **Stuck_State**: A UI state where a step shows "processing" but no progress is being made and the user has no way to recover.
- **Watchdog**: A timer that detects stuck states and auto-recovers.
- **Graceful_Degradation**: The ability to continue operating with reduced functionality when a subsystem fails.

## Requirements

### Requirement 1: Network Call Timeouts

**User Story:** As a user, I want every network request to have a timeout, so that the app never hangs indefinitely waiting for a slow or unresponsive API.

#### Acceptance Criteria

1. WHEN the LLM_Service makes a request to OpenRouter, THE LLM_Service SHALL enforce a 30-second timeout per request attempt.
2. WHEN the TTS_Service makes a request to OpenAI, THE TTS_Service SHALL enforce a 30-second timeout per request attempt.
3. WHEN the Harvester makes a request to any image provider (DDG, Wikimedia, Unsplash, Pexels, Serper, Firecrawl), THE Harvester SHALL enforce a 15-second timeout per request.
4. WHEN the Visual_Director makes a request to OpenRouter, THE Visual_Director SHALL enforce a 20-second timeout per request attempt.
5. IF a network request exceeds its timeout, THEN THE requesting service SHALL abort the request and proceed with fallback behavior rather than hanging.
6. WHEN the `fetchWithRetry` helper retries a failed request, THE helper SHALL pass an AbortSignal with a per-attempt timeout to each `fetch` call.

### Requirement 2: Abort Signal Threading

**User Story:** As a user, I want to be able to cancel any long-running operation at any time, so that I am never stuck waiting for something I no longer want.

#### Acceptance Criteria

1. WHEN the user cancels a render, THE Store SHALL propagate the Abort_Signal to the Renderer, and the Renderer SHALL stop frame capture within 500ms.
2. WHEN the user cancels during media sourcing, THE Store SHALL propagate the Abort_Signal to the Harvester, and the Harvester SHALL stop issuing new network requests.
3. WHEN the user cancels during narration generation, THE Store SHALL propagate the Abort_Signal to the TTS_Service, and the TTS_Service SHALL stop generating new clips.
4. WHEN the user cancels during script generation, THE Store SHALL propagate the Abort_Signal to the LLM_Service, and the LLM_Service SHALL abort the in-flight OpenRouter request.
5. THE Store SHALL provide a cancel mechanism for every Pipeline step that involves async processing (script, media, narration, assembly).
6. WHEN an operation is cancelled, THE Store SHALL reset the step status to 'active' (not 'processing') and clear the progress message within 200ms.

### Requirement 3: Error Handling — Services

**User Story:** As a user, I want every async operation to catch errors and show me a clear message, so that I never see a blank screen or silent failure.

#### Acceptance Criteria

1. WHEN the LLM_Service fails to generate a script, THE Store SHALL set the script step to 'error' status and display the error message to the user.
2. WHEN the Harvester fails to source media for a segment, THE Harvester SHALL log the error and continue to the next segment rather than aborting the entire sourcing pass.
3. WHEN the TTS_Service fails to generate audio for a segment, THE TTS_Service SHALL mark that clip as 'unavailable' and continue to the next segment.
4. WHEN the Renderer fails during frame capture, THE Renderer SHALL log the error, set the assembly step to 'error', and display a user-visible error message with a "Try Again" button.
5. IF the `generateFullVideo` one-click pipeline fails at any step, THEN THE Store SHALL stop the pipeline, set the failed step to 'error', and display which step failed.
6. WHEN any service encounters an unhandled exception, THE ErrorBoundary SHALL catch it and display a recovery UI with a "Reload App" button.
7. THE Harvester SHALL never throw an unhandled exception from `sourceSegmentMedia` — all errors SHALL be caught and result in a fallback asset.

### Requirement 4: Error Handling — Components

**User Story:** As a user, I want every UI component to handle errors gracefully, so that a failure in one part of the screen does not crash the entire app.

#### Acceptance Criteria

1. WHEN the PreviewStep fails to load a thumbnail or generate a thumbnail preview, THE PreviewStep SHALL display a "Thumbnail preview unavailable" placeholder instead of crashing.
2. WHEN the MediaStep fails to replace a media asset, THE MediaStep SHALL display an inline error message on that asset card and reset the replacing state.
3. WHEN the NarrationStep fails to play a clip (audio playback error), THE NarrationStep SHALL reset the playing state and show the clip as playable again.
4. WHEN the BatchProcessor encounters an error on one job, THE BatchProcessor SHALL mark that job as 'error' and continue processing remaining jobs.
5. WHEN the SettingsModal fails to verify an API key, THE SettingsModal SHALL display the key as 'invalid' without crashing the modal.
6. WHEN the StoryboardView receives a project with missing visual plans, THE StoryboardView SHALL render frames with "No visual assigned" placeholders.

### Requirement 5: Memory Management — Blob URLs

**User Story:** As a user, I want the app to clean up memory properly, so that long sessions do not cause the browser to slow down or crash.

#### Acceptance Criteria

1. WHEN the Store replaces narration clips (re-generating narration), THE Store SHALL revoke all previous narration Blob_URLs before setting new ones.
2. WHEN the Store replaces a video thumbnail (re-rendering), THE Store SHALL revoke the previous thumbnail Blob_URL before setting the new one.
3. WHEN the PreviewStep unmounts or regenerates a thumbnail preview, THE PreviewStep SHALL revoke the previous thumbnail preview Blob_URL.
4. WHEN the Renderer finishes or is cancelled, THE Renderer SHALL not retain references to captured frame data URLs beyond what is needed for encoding.
5. WHEN the `loadImage` function in the Renderer creates a Blob_URL from a fetched image, THE Renderer SHALL track that URL and revoke it after the render completes or is cancelled.
6. THE Renderer image cache SHALL be bounded to a maximum of 60 entries, evicting oldest entries when the limit is exceeded.
7. WHEN the user resets the project (clicks "New Video"), THE Store SHALL revoke all outstanding Blob_URLs (thumbnail, narration audio URLs).

### Requirement 6: Memory Management — Canvas and Large Arrays

**User Story:** As a user on Safari or a memory-constrained device, I want the app to limit memory usage during rendering, so that the browser does not crash.

#### Acceptance Criteria

1. THE Renderer SHALL cap the total number of captured frames to 2000 to prevent out-of-memory conditions.
2. THE Renderer SHALL enforce a 5-minute overall render deadline, stopping frame capture if exceeded.
3. THE Renderer SHALL yield to the browser event loop (via `setTimeout(0)`) at least every 60 frames to prevent UI freezes.
4. WHEN the Renderer creates temporary canvases (offscreen, bgCache, recCanvas), THE Renderer SHALL set their width and height to 0 after use to release GPU memory.
5. THE Renderer SHALL clear the `saturationCache` map after each render session to prevent unbounded growth across multiple renders.
6. THE Renderer SHALL clear the `capturedFrames` array after encoding is complete to free the data URL strings.
7. WHEN the `drawProceduralBackground` function runs during rendering, THE function SHALL use 30 particles instead of 120 to reduce per-frame computation.

### Requirement 7: State Recovery — Stuck State Detection

**User Story:** As a user, I want the app to automatically detect and recover from stuck states, so that I never have to force-close the browser tab.

#### Acceptance Criteria

1. WHILE the assembly step is in 'processing' status, THE Store watchdog SHALL monitor progress changes every 10 seconds.
2. IF the assembly step has been in 'processing' status with no progress change for 90 seconds, THEN THE Store watchdog SHALL auto-cancel the render, set the step to 'error', and display "Render timed out — no progress detected."
3. WHEN the user reloads the page, THE Store SHALL load the saved project from localStorage and restore the UI to the last completed step (not a 'processing' step).
4. IF the loaded project state has any step in 'processing' status, THEN THE Store SHALL reset that step to 'active' or 'error' to prevent a stuck UI on reload.
5. WHEN the user clicks "Try Again" after a render failure, THE Store SHALL reset progress to 0, clear the error message, and re-attempt the render.

### Requirement 8: State Recovery — Page Reload Resilience

**User Story:** As a user, I want to be able to reload the page without losing my work, so that a browser crash or accidental refresh does not waste my time.

#### Acceptance Criteria

1. THE Store SHALL auto-save the project, step statuses, current step, and topic config to localStorage whenever any of these values change.
2. WHEN the app loads, THE Store SHALL attempt to restore the saved project from localStorage.
3. IF the restored project has a 'complete' status, THEN THE Store SHALL navigate to the preview step.
4. IF the restored project has steps in 'processing' status, THEN THE Store SHALL reset those steps to 'active' and display a message indicating the previous operation was interrupted.
5. THE Store SHALL handle corrupted or invalid localStorage data gracefully by falling back to a fresh state without crashing.

### Requirement 9: Graceful Degradation — Pipeline Steps

**User Story:** As a user, I want failures in one pipeline step to not block the entire workflow, so that I can still get partial results.

#### Acceptance Criteria

1. WHEN the LLM_Service fails to generate an AI script, THE Store SHALL fall back to template-based script generation and continue the pipeline.
2. WHEN the Harvester fails to find any images for a segment, THE Harvester SHALL use the Wikipedia topic thumbnail as a fallback, or a procedural gradient if no thumbnail exists.
3. WHEN the TTS_Service fails to generate OpenAI audio for a segment, THE Store SHALL fall back to browser SpeechSynthesis for that segment.
4. IF browser SpeechSynthesis is also unavailable, THEN THE Store SHALL mark the narration clip as 'unavailable' and allow the user to proceed to assembly without audio.
5. WHEN the Renderer cannot reach the server-side ffmpeg endpoint, THE Renderer SHALL fall back to the browser MediaRecorder API.
6. WHEN the Renderer encounters a CORS-tainted image, THE Renderer SHALL use a procedural gradient fallback (`mkFallback`) instead of crashing.
7. WHEN the Visual_Director AI plan request fails, THE Visual_Director SHALL return a fallback plan using local beat detection and template-based shot planning.

### Requirement 10: User Feedback — Progress Indicators

**User Story:** As a user, I want to see clear progress for every long-running operation, so that I know the app is working and can estimate how long it will take.

#### Acceptance Criteria

1. WHILE the script is being generated, THE ScriptStep SHALL display a progress bar, percentage, and descriptive status message.
2. WHILE media is being sourced, THE MediaStep SHALL display the current segment being processed, the beat type, and the visual concept being harvested.
3. WHILE narration is being generated, THE NarrationStep SHALL display which segment is being processed and the overall percentage.
4. WHILE the video is being rendered, THE AssemblyStep SHALL display the current segment, overall percentage, an ETA estimate, and a multi-track progress breakdown.
5. WHEN any step transitions from 'processing' to 'error', THE corresponding component SHALL display the error message and a retry/recovery action.
6. THE AssemblyStep SHALL display a "Cancel Render" button that is always responsive during rendering.

### Requirement 11: User Feedback — Error Visibility

**User Story:** As a user, I want every error to be visible in the UI, so that I never wonder why something stopped working.

#### Acceptance Criteria

1. WHEN a service logs an error via the logger, THE DebugOverlay SHALL display the error with a red indicator and the error count badge SHALL update.
2. WHEN the media sourcing step fails entirely, THE MediaStep SHALL display an error state with a "Retry Media Search" button.
3. WHEN the render fails, THE AssemblyStep SHALL display "Render Failed" with the error message and a "Try Again" button.
4. WHEN an API key verification fails in the SettingsModal, THE SettingsModal SHALL display a red indicator next to the failed key.
5. IF the Harvester uses a fallback image for a segment, THEN THE MediaStep SHALL visually distinguish fallback assets from matched assets (amber badge vs green badge).

### Requirement 12: Browser Compatibility — Safari Canvas Safety

**User Story:** As a Safari user, I want the app to work without crashing, so that I can use AutoTube on any modern browser.

#### Acceptance Criteria

1. THE Renderer SHALL check `isCanvasSafeSource()` before drawing any external image to the canvas to prevent canvas tainting.
2. WHEN an image is not canvas-safe, THE Renderer SHALL log a warning and skip drawing that image, using the procedural background instead.
3. THE Renderer SHALL use an offscreen canvas for compositing and copy to the capture canvas via `drawImage()` to avoid taint propagation.
4. THE Renderer SHALL limit canvas dimensions based on the quality preset (draft: 854×480, standard: 1280×720, high: 1920×1080) to prevent Safari GPU memory exhaustion.
5. WHEN the Renderer creates temporary canvases for saturation scoring, THE Renderer SHALL use the image's natural dimensions (not the output canvas dimensions) and dispose of the canvas after scoring.
6. THE `thumbnail.ts` service SHALL use CORS-safe image loading (via weserv.nl proxy) with a fallback chain when generating thumbnails.

### Requirement 13: Onboarding and First-Run Experience

**User Story:** As a new user, I want to be able to start using the app immediately without being blocked by configuration, so that I can evaluate AutoTube quickly.

#### Acceptance Criteria

1. THE OnboardingModal SHALL label all API key fields as "optional" and provide a "Skip" button on the first step.
2. WHEN the user clicks "Skip" on the first onboarding step, THE OnboardingModal SHALL save the config (with empty keys) and close, allowing the user to proceed.
3. THE OnboardingModal SHALL display a "Get Started" button on the final step that saves config and closes the modal.
4. WHEN the app loads and the user has previously completed onboarding, THE app SHALL skip the onboarding modal and attempt to load a saved project.

### Requirement 14: Batch Processing Robustness

**User Story:** As a user generating multiple videos, I want batch processing to be resilient to individual failures, so that one bad topic does not stop the entire batch.

#### Acceptance Criteria

1. WHEN a batch job fails, THE BatchProcessor SHALL mark that job as 'error' with the error message and continue to the next job.
2. THE BatchProcessor SHALL display per-job status (pending, running, complete, error) and an overall progress bar.
3. WHEN all batch jobs are complete, THE BatchProcessor SHALL display a summary showing how many succeeded and how many failed.
4. THE BatchProcessor SHALL allow downloading completed videos individually even if other jobs failed.
5. IF the user navigates away from the topic step during batch processing, THEN THE batch processing SHALL continue in the background.

### Requirement 15: Logger and Analytics Robustness

**User Story:** As a developer, I want the logging and analytics systems to never crash the app, so that observability code does not become a liability.

#### Acceptance Criteria

1. IF localStorage is full or unavailable, THEN THE analytics service SHALL catch the error and continue without crashing.
2. THE logger SHALL cap the in-memory log buffer to 100 entries to prevent unbounded memory growth.
3. IF the logger subscriber callback throws an error, THEN THE logger SHALL catch it and continue logging to the console.
4. THE analytics service SHALL cap stored analytics entries to 50 to prevent localStorage from filling up.

### Requirement 16: Service-Level Retry and Backoff

**User Story:** As a user on an unreliable network, I want the app to retry failed requests automatically, so that transient network issues do not cause permanent failures.

#### Acceptance Criteria

1. WHEN the LLM_Service receives a 429 (rate limit) or 5xx response, THE LLM_Service SHALL retry up to 3 times with exponential backoff (1s, 2s, 4s).
2. WHEN the TTS_Service receives a 429 or 5xx response, THE TTS_Service SHALL retry up to 3 times with exponential backoff.
3. WHEN the Visual_Director receives a 429 or 5xx response, THE Visual_Director SHALL retry up to 2 times with exponential backoff.
4. WHEN the Harvester receives a non-200 response from any image provider, THE Harvester SHALL silently return an empty array and let the cascading fallback system try the next provider.
5. THE `fetchWithRetry` helpers SHALL NOT retry on 4xx client errors (except 429) since those indicate a permanent problem (bad API key, invalid request).

### Requirement 17: Data Validation and Defensive Parsing

**User Story:** As a user, I want the app to handle malformed API responses gracefully, so that a bad response from one API does not crash the entire pipeline.

#### Acceptance Criteria

1. WHEN the LLM_Service receives a response from OpenRouter, THE LLM_Service SHALL validate each segment object against the expected schema and substitute defaults for missing or invalid fields.
2. WHEN the Visual_Director receives a response from OpenRouter, THE Visual_Director SHALL validate the plan object and return a fallback plan if validation fails.
3. WHEN the Harvester receives a response from Wikimedia, THE Harvester SHALL validate each page object and skip entries with missing image URLs.
4. WHEN the Store loads a project from localStorage, THE Store SHALL validate the project structure and fall back to a fresh state if the data is corrupted.
5. THE `parseSegmentsFromContent` function SHALL handle responses wrapped in markdown code fences, `{ "segments": [...] }` wrappers, and bare arrays.

### Requirement 18: Resource Cleanup on Reset

**User Story:** As a user starting a new video, I want the previous project's resources to be fully cleaned up, so that memory does not accumulate across sessions.

#### Acceptance Criteria

1. WHEN the user clicks "New Video", THE Store SHALL revoke all Blob_URLs from the previous project (thumbnail, narration audio URLs).
2. WHEN the user clicks "New Video", THE Store SHALL stop any in-progress speech synthesis.
3. WHEN the user clicks "New Video", THE Store SHALL reset the `usedUrlsMap` in the Harvester to prevent stale URL exclusions.
4. WHEN the user clicks "New Video", THE Store SHALL reset all step statuses to their initial values and clear progress/message state.
5. THE PreviewStep SHALL stop audio playback and cancel animation frames when unmounting.

### Requirement 19: Image Loading Resilience

**User Story:** As a user, I want images to load reliably even when some sources are slow or blocked, so that the video always has visuals.

#### Acceptance Criteria

1. WHEN loading an image for rendering, THE Renderer SHALL try multiple sources in order: local proxy, weserv.nl, direct URL, allorigins.win, corsproxy.io.
2. IF all image sources fail, THEN THE Renderer SHALL create a procedural gradient fallback image with the asset's alt text.
3. WHEN loading an image, THE Renderer SHALL enforce a 4-second timeout per source attempt.
4. THE Renderer preload phase SHALL enforce a 30-second overall timeout to prevent indefinite hangs on slow CORS proxies.
5. WHEN the thumbnail service loads an image, THE thumbnail service SHALL use the weserv.nl proxy with a fallback to direct loading.

### Requirement 20: Subtitle and Export Robustness

**User Story:** As a user exporting my video, I want downloads and subtitle generation to work reliably, so that I can share my content.

#### Acceptance Criteria

1. WHEN the user downloads a video, THE PreviewStep SHALL create a temporary anchor element, trigger the download, and remove the anchor from the DOM.
2. WHEN the user downloads subtitles, THE subtitles service SHALL create a Blob, generate a Blob_URL, trigger the download, and revoke the Blob_URL immediately after.
3. WHEN the user downloads a thumbnail, THE thumbnail service SHALL create a Blob, trigger the download, and revoke the Blob_URL immediately after.
4. WHEN the YouTube upload flow generates metadata, THE youtube service SHALL truncate the title to 100 characters and the description to 5000 characters to comply with YouTube limits.
5. IF clipboard writing fails during YouTube metadata copy, THEN THE youtube service SHALL log a warning and continue without crashing.

### Requirement 21: Settings Persistence Robustness

**User Story:** As a user, I want my settings to persist reliably across sessions, so that I do not have to re-enter API keys every time.

#### Acceptance Criteria

1. WHEN the user saves settings, THE Store SHALL write the config to localStorage and handle write failures gracefully.
2. WHEN the app loads, THE Store SHALL read the config from localStorage and merge it with default values to handle missing fields from older versions.
3. IF localStorage contains invalid JSON for the config, THEN THE Store SHALL fall back to default config values without crashing.
4. THE SettingsModal SHALL detect likely key mismatches (e.g., an OpenRouter key in the Serper field) and display a warning.

### Requirement 22: Speech Synthesis Robustness

**User Story:** As a user, I want text-to-speech to work reliably across browsers, so that I can preview narration on any device.

#### Acceptance Criteria

1. WHEN the app checks for speech support, THE speech utility SHALL detect whether `window.speechSynthesis` is available and return a boolean.
2. WHEN loading speech voices, THE speech utility SHALL wait up to 2 seconds for voices to populate (some browsers load them asynchronously).
3. WHEN the user navigates away from the NarrationStep or PreviewStep, THE component SHALL stop any in-progress speech synthesis.
4. WHEN the PreviewStep switches to storyboard mode, THE PreviewStep SHALL stop speech synthesis and audio playback.
5. IF speech synthesis fails during preview playback, THEN THE PreviewStep SHALL set `isNarrating` to false and continue playback without audio.

### Requirement 23: Concurrent Operation Safety

**User Story:** As a user, I want the app to prevent conflicting operations from running simultaneously, so that the state does not become corrupted.

#### Acceptance Criteria

1. THE Store SHALL use a `sourcingRef` guard to prevent multiple concurrent media sourcing operations.
2. THE Store SHALL use a `renderAbortRef` to ensure only one render operation runs at a time, aborting any previous render before starting a new one.
3. WHEN the batch processor is running, THE BatchProcessor SHALL disable the "Generate All" button to prevent duplicate batch starts.
4. THE MediaStep SHALL disable the replace button for an asset while a replacement is in progress for that asset.
