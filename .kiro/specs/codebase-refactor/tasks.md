# Implementation Plan: Codebase Refactor

## Overview

Incrementally restructure the AutoTube codebase from monolithic files into a modular, domain-driven architecture. Each phase leaves the app in a working state. Tasks are ordered: shared utilities → module extractions (no public API changes) → store decomposition → API server extraction → dead code removal → component refactoring → final verification.

## Tasks

- [x] 1. Create shared utilities (errors.ts, withRetry.ts)
  - [x] 1.1 Create `src/utils/errors.ts` with ServiceError interface and helpers
    - Define `ServiceError` interface with `code`, `message`, `originalError`, `retryable`, `attempts` fields
    - Implement `isServiceError()` type guard and `createServiceError()` factory function
    - _Requirements: 6.2, 10.3, 10.4_

  - [x] 1.2 Create `src/utils/withRetry.ts` with generic retry utility
    - Define `RetryOptions` interface with `maxRetries`, `backoff`, `baseDelayMs`, `signal`, `onRetry`
    - Implement `withRetry<T>()` supporting linear and exponential backoff
    - Handle `AbortSignal` cancellation during retry waits
    - _Requirements: 10.1, 10.2, 10.5_

  - [x] 1.3 Write unit tests for errors.ts and withRetry.ts
    - Test `isServiceError` type guard with valid and invalid inputs
    - Test `withRetry` retry counts, backoff timing, abort signal handling
    - Test exponential vs linear backoff behavior
    - _Requirements: 10.1, 10.3_

  - [x] 1.4 Write property test for ServiceError consistency
    - **Property 3: Service error type consistency**
    - **Validates: Requirements 6.2, 10.4**

- [x] 2. Checkpoint - Verify shared utilities
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Extract LLM service into domain directory
  - [x] 3.1 Create `src/services/llm/` directory structure with barrel export
    - Create `src/services/llm/index.ts` re-exporting public API
    - Create `src/services/llm/callLLM.ts` with shared LLM call wrapper (retry, timeout, JSON parsing)
    - Use `withRetry` from `src/utils/withRetry.ts` for retry logic
    - _Requirements: 4.3, 4.5, 6.1_

  - [x] 3.2 Extract script generation into `src/services/llm/scriptGenerator.ts`
    - Move `generateAIScript` and related prompt-building logic from `src/services/llm.ts`
    - Accept dependencies (API key, model, endpoint) as parameters via `LLMConfig`
    - Use `callLLM` for all API interactions
    - _Requirements: 4.1, 4.2_

  - [x] 3.3 Extract script review into `src/services/llm/scriptReviewer.ts`
    - Move `reviewAndImproveScript` and related logic from `src/services/llm.ts`
    - Accept `LLMConfig` as parameter
    - _Requirements: 4.1, 4.2_

  - [x] 3.4 Extract title generation into `src/services/llm/titleGenerator.ts`
    - Move `generateVideoTitle` and SEO-related LLM logic from `src/services/llm.ts`
    - Accept `LLMConfig` as parameter
    - _Requirements: 4.1, 4.2_

  - [x] 3.5 Extract topic context helpers into `src/services/llm/topicContext.ts`
    - Move `fetchWikiContext`, `fetchTopicContext` and related helpers
    - _Requirements: 4.1_

  - [x] 3.6 Extract parsing utilities into `src/services/llm/parsing.ts`
    - Move `parseSegmentsFromContent`, `validateSegment`, `sanitiseTopic` and related helpers
    - _Requirements: 4.1_

  - [x] 3.7 Update all imports of LLM functions across the codebase
    - Update `src/store.ts` imports to use `src/services/llm/` barrel
    - Update any other files importing from `src/services/llm.ts`
    - Remove the old `src/services/llm.ts` file
    - Verify TypeScript compilation passes
    - _Requirements: 4.4, 4.5, 7.1_

  - [x] 3.8 Write unit tests for LLM parsing utilities
    - Test `parseSegmentsFromContent` with valid/malformed JSON
    - Test `validateSegment` edge cases
    - Test `sanitiseTopic` with special characters
    - _Requirements: 4.1_

- [x] 4. Extract TTS service into unified interface
  - [x] 4.1 Create `src/services/tts/interface.ts` with TTSEngine and TTSConfig types
    - Define `TTSEngine` interface with `name`, `voices`, `generate`, `isAvailable`
    - Define `TTSConfig` interface with engine preference and credentials
    - _Requirements: 8.1, 8.2, 8.3_

  - [x] 4.2 Create `src/services/tts/grokEngine.ts` implementing TTSEngine
    - Extract Grok TTS logic from `src/services/grokTts.ts`
    - Implement the `TTSEngine` interface
    - Use `withRetry` for network calls
    - _Requirements: 8.2, 8.5_

  - [x] 4.3 Create `src/services/tts/meloEngine.ts` implementing TTSEngine
    - Extract Melo/Cloudflare TTS logic from `src/services/meloTts.ts`
    - Implement the `TTSEngine` interface
    - Use `withRetry` for network calls
    - _Requirements: 8.2, 8.5_

  - [x] 4.4 Create `src/services/tts/browserEngine.ts` implementing TTSEngine
    - Extract browser SpeechSynthesis logic from `src/utils/speech.ts`
    - Implement the `TTSEngine` interface
    - _Requirements: 8.2, 8.5_

  - [x] 4.5 Create `src/services/tts/registry.ts` with engine registry and fallback logic
    - Implement ordered engine list with fallback on failure
    - Log fallback events via `logger`
    - _Requirements: 8.3, 8.4_

  - [x] 4.6 Create `src/services/tts/index.ts` barrel with `generateNarration` function
    - Implement `generateNarration` that delegates to registry
    - Re-export public types and constants (VOICES, TTS_ENGINES)
    - _Requirements: 8.1_

  - [x] 4.7 Update all TTS imports across the codebase
    - Update `src/store.ts` and any components importing from old TTS files
    - Remove old `src/services/tts.ts`, `src/services/grokTts.ts`, `src/services/meloTts.ts`
    - Verify TypeScript compilation passes
    - _Requirements: 8.5, 7.1_

  - [x] 4.8 Write property test for TTS engine delegation
    - **Property 6: TTS engine delegation**
    - **Validates: Requirements 8.2**

  - [x] 4.9 Write property test for TTS engine fallback
    - **Property 7: TTS engine fallback on failure**
    - **Validates: Requirements 8.4**

- [x] 5. Checkpoint - Verify LLM and TTS extractions
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Decompose the Video Renderer
  - [x] 6.1 Create `src/services/renderer/` directory with barrel export
    - Create `src/services/renderer/index.ts` re-exporting `renderVideoToBlob` and `QUALITY_PRESETS`
    - _Requirements: 3.5_

  - [x] 6.2 Extract canvas text utilities into `src/services/renderer/canvas/text.ts`
    - Move `wrapText`, `roundRect`, `hexToRgba`, `drawTechnicalLabel` and related helpers
    - _Requirements: 3.1, 3.2_

  - [x] 6.3 Extract transition logic into `src/services/renderer/canvas/transitions.ts`
    - Move `renderTransition`, `computeCrossfadeAlpha` and related functions
    - _Requirements: 3.1, 3.2_

  - [x] 6.4 Extract scene drawing into `src/services/renderer/canvas/scenes.ts`
    - Move scene layout functions (stat-card, quote-card, etc.)
    - _Requirements: 3.1, 3.2_

  - [x] 6.5 Extract overlay drawing into `src/services/renderer/canvas/overlays.ts`
    - Move `drawKineticTextOverlay`, `drawDiagramOverlay` and related functions
    - _Requirements: 3.1, 3.2_

  - [x] 6.6 Extract main draw function into `src/services/renderer/canvas/draw.ts`
    - Move main `draw()` function and `drawProceduralBackground`
    - Import from other canvas sub-modules
    - _Requirements: 3.1, 3.2_

  - [x] 6.7 Extract preloading into `src/services/renderer/preload.ts`
    - Move `preload()`, `loadImage()`, `buildImageSources()` and related functions
    - _Requirements: 3.1_

  - [x] 6.8 Extract encoding into `src/services/renderer/encoding.ts`
    - Move MediaRecorder setup, `getSupportedMimeType`, `tryServerRender` and related functions
    - _Requirements: 3.1_

  - [x] 6.9 Extract animation into `src/services/renderer/animation.ts`
    - Move `computeVisualStyle`, Ken Burns parameter computation and related functions
    - _Requirements: 3.1_

  - [x] 6.10 Create `src/services/renderer/orchestrator.ts` to coordinate sub-modules
    - Move `renderVideoToBlob` main function here
    - Import from canvas/, preload, encoding, animation sub-modules
    - Orchestrator coordinates but contains no drawing or encoding logic itself
    - _Requirements: 3.3, 3.4_

  - [x] 6.11 Update all imports of renderer functions across the codebase
    - Update `src/store.ts` imports to use `src/services/renderer/` barrel
    - Update `src/services/renderingShared.ts` if it references renderer internals
    - Remove old `src/services/videoRenderer.ts`
    - Verify TypeScript compilation passes
    - _Requirements: 3.5, 7.1_

- [x] 7. Checkpoint - Verify renderer decomposition
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Decompose the Store
  - [x] 8.1 Create `src/store/slices/projectSlice.ts`
    - Extract project state (VideoProject, TopicConfig) and mutations (setProject, updateSegment, etc.)
    - Export typed `ProjectSliceState` and `ProjectSliceActions` interfaces
    - Implement as a custom hook `useProjectSlice()`
    - _Requirements: 2.1, 2.2, 2.5_

  - [x] 8.2 Create `src/store/slices/pipelineSlice.ts`
    - Extract step statuses, currentStep, step transitions
    - Export typed `PipelineSliceState` and `PipelineSliceActions` interfaces
    - _Requirements: 2.1, 2.2_

  - [x] 8.3 Create `src/store/slices/configSlice.ts`
    - Extract AppConfig state, encryption, unlock/lock logic
    - Export typed `ConfigSliceState` and `ConfigSliceActions` interfaces
    - _Requirements: 2.1, 2.2_

  - [x] 8.4 Create `src/store/slices/narrationSlice.ts`
    - Extract TTS state, voice selection, audio URLs
    - Export typed `NarrationSliceState` and `NarrationSliceActions` interfaces
    - _Requirements: 2.1, 2.2_

  - [x] 8.5 Create `src/store/slices/uiSlice.ts`
    - Extract logs, processing progress/message, modal state
    - Export typed `UISliceState` and `UISliceActions` interfaces
    - _Requirements: 2.1, 2.2_

  - [x] 8.6 Create `src/store/pipeline/orchestrator.ts`
    - Extract step execution logic (generateScript, sourceMedia, etc.) as pure async functions
    - Accept state + callbacks as parameters, return results
    - Delegate all service calls here — no direct service calls in slices
    - _Requirements: 2.3, 2.6_

  - [x] 8.7 Create `src/store/index.ts` composed hook
    - Combine all slices into single `useVideoProject()` hook
    - Maintain exact same return shape as current `src/store.ts` for backward compatibility
    - Wire pipeline orchestrator to slice actions
    - _Requirements: 2.4_

  - [x] 8.8 Update all imports of `useVideoProject` across the codebase
    - Update `src/App.tsx` and all components importing from `src/store.ts`
    - Remove old `src/store.ts`
    - Verify TypeScript compilation passes
    - _Requirements: 2.4, 7.1_

  - [x] 8.9 Write property test for state slice isolation
    - **Property 2: State slice isolation**
    - **Validates: Requirements 2.5**

- [x] 9. Checkpoint - Verify store decomposition
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Extract API Server
  - [x] 10.1 Create `server/` directory structure
    - Create `server/index.ts` with Express app setup and middleware registration
    - Create `server/middleware/cors.ts` for CORS headers
    - Create `server/middleware/errorHandler.ts` for global error handler returning structured JSON
    - _Requirements: 1.1, 1.4, 1.5_

  - [x] 10.2 Extract route handlers into `server/routes/`
    - Create `server/routes/proxyImage.ts` — GET /api/proxy-image
    - Create `server/routes/renderVideo.ts` — POST /api/render-video
    - Create `server/routes/serverRender.ts` — POST /api/server-render
    - Create `server/routes/renderOutput.ts` — GET /api/render-output/:format/*
    - Create `server/routes/saveProject.ts` — POST /api/save-project
    - Create `server/routes/exportProject.ts` — GET /api/export-project
    - Create `server/routes/searchVideos.ts` — GET /api/search-videos
    - Create `server/routes/downloadClip.ts` — GET /api/download-clip
    - Create `server/routes/search.ts` — GET /api/search
    - _Requirements: 1.1, 1.4_

  - [x] 10.3 Update `vite.config.ts` to mount the Express app via middleware
    - Remove inline route handler code from `vite.config.ts`
    - Import the Express app from `server/index.ts` and mount via `server.middlewares.use(app)`
    - Vite config should contain only build config, plugin registration, and the middleware mount
    - _Requirements: 1.2, 1.3_

  - [x] 10.4 Write property test for API error response structure
    - **Property 1: API error responses are structured JSON**
    - **Validates: Requirements 1.5**

- [x] 11. Checkpoint - Verify API server extraction
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Remove dead code and consolidate
  - [x] 12.1 Identify and remove dead exports
    - Scan for exported functions/types with zero import references (excluding tests and barrels)
    - Remove or consolidate `src/services/tts.ts` if its exports are now in `src/services/tts/`
    - Remove any orphaned files from old structure (grokTts.ts, meloTts.ts if not already removed)
    - _Requirements: 5.1, 5.2, 5.5_

  - [x] 12.2 Remove commented-out code blocks
    - Scan for commented-out code blocks longer than 3 lines
    - Remove them (they're in git history if needed)
    - _Requirements: 5.4_

  - [x] 12.3 Replace ad-hoc retry loops and watchdog timers
    - Find remaining ad-hoc retry patterns not yet using `withRetry`
    - Replace watchdog `setInterval` timers with `AbortSignal.timeout()` or `withRetry`
    - Replace `console.log`/`console.error` in service files with `logger` utility
    - _Requirements: 10.2, 10.5, 6.5_

  - [x] 12.4 Verify dead code removal
    - Run TypeScript compilation (`tsc --noEmit`)
    - Run test suite (`vitest run`)
    - Confirm no broken imports
    - _Requirements: 5.3_

- [x] 13. Refactor large components
  - [x] 13.1 Decompose `PreviewStep` component into sub-components
    - Create `src/components/PreviewStep/` directory with `index.tsx` barrel
    - Extract `VideoPlayer.tsx` — video playback controls
    - Extract `Timeline.tsx` — timeline display
    - Extract `QualitySettings.tsx` — quality/preset settings
    - Extract `ExportActions.tsx` — export buttons and modal triggers
    - Each sub-component receives data via props
    - _Requirements: 9.1, 9.2, 9.4, 9.5_

  - [x] 13.2 Decompose `AssetTester` component into sub-components
    - Create `src/components/AssetTester/` directory with `index.tsx` barrel
    - Extract `AssetList.tsx` — list of assets
    - Extract `AssetDetail.tsx` — single asset detail view
    - Extract `TestRunner.tsx` — test execution controls
    - Extract `ResultsDisplay.tsx` — test results display
    - Each sub-component receives data via props
    - _Requirements: 9.1, 9.3, 9.4, 9.5_

  - [x] 13.3 Update imports for refactored components
    - Update any files importing `PreviewStep` or `AssetTester` to use new barrel paths
    - Verify TypeScript compilation passes
    - _Requirements: 9.4_

- [x] 14. Checkpoint - Verify component refactoring
  - Ensure all tests pass, ask the user if questions arise.

- [x] 15. Final verification and module boundary enforcement
  - [x] 15.1 Verify module boundary compliance
    - Check that all cross-domain imports go through barrel `index.ts` exports
    - Verify no circular imports between domain directories
    - Verify dependency flow: UI → Store → Pipeline → Services → Utils
    - _Requirements: 7.2, 7.3, 7.4_

  - [x] 15.2 Write property test for barrel-only imports
    - **Property 4: Module boundary enforcement (barrel-only imports)**
    - **Validates: Requirements 7.2, 7.4**

  - [x] 15.3 Write property test for acyclic dependency graph
    - **Property 5: Acyclic domain dependency graph**
    - **Validates: Requirements 7.3**

  - [x] 15.4 Final smoke test
    - Verify TypeScript compilation passes (`tsc --noEmit`)
    - Verify all unit tests pass (`vitest run`)
    - Verify no file in `src/services/` uses `console.log` or `console.error`
    - Verify no component file exceeds 400 lines
    - Verify directory structure matches design target layout
    - _Requirements: 5.3, 6.5, 9.1_

- [x] 16. Final checkpoint - All tests pass, refactor complete
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster completion
- Each phase leaves the app in a working state — TypeScript compiles and tests pass after each checkpoint
- The store decomposition (phase 8) is the highest-risk change; the composed hook maintains backward compatibility
- Property tests validate universal correctness properties from the design document
- All service modules use TypeScript with explicit parameter injection (no class-based services)
