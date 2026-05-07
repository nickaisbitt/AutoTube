# Requirements Document

## Introduction

A full architectural refactor of the AutoTube video generator application. The codebase has grown organically through many spec-driven patches, resulting in monolithic files, dead code, inconsistent patterns, and poor separation of concerns. This refactor restructures the application into small, focused modules with clear boundaries, consistent patterns, and proper separation of concerns — without changing external behavior.

## Glossary

- **Store**: The central React state management hook (`useVideoProject`) that currently holds all application state, pipeline orchestration, and side effects
- **Pipeline_Orchestrator**: A new module responsible for coordinating the multi-step video generation pipeline (topic → script → media → narration → AI edit → assembly → preview)
- **Dev_Server**: The Vite development server middleware currently embedded in `vite.config.ts` that provides API proxy routes, image proxying, video rendering, and project persistence
- **API_Server**: A new standalone Express/Node server module extracted from the Vite config to handle all backend API routes
- **Video_Renderer**: The service responsible for canvas-based video rendering, frame assembly, and encoding (`videoRenderer.ts`, currently ~2300 lines)
- **LLM_Service**: The service responsible for all LLM interactions including script generation, review, title generation, and topic ideas (`llm.ts`, currently ~770 lines)
- **Media_Service**: The service responsible for sourcing, scoring, and managing media assets for video segments
- **TTS_Service**: The unified text-to-speech interface that delegates to multiple engines (Grok, Melo, browser SpeechSynthesis)
- **State_Slice**: A focused subset of application state with its own actions and selectors, following a slice-based architecture pattern
- **Module_Boundary**: A clearly defined interface (exported types and functions) that separates one module's internals from its consumers

## Requirements

### Requirement 1: Extract API Server from Vite Config

**User Story:** As a developer, I want the API server routes separated from the Vite build configuration, so that the dev server config is simple and the API layer can be tested and deployed independently.

#### Acceptance Criteria

1. THE API_Server SHALL expose all current API routes (`/api/proxy-image`, `/api/render-video`, `/api/server-render`, `/api/render-output`, `/api/save-project`, `/api/export-project`, `/api/search-videos`, `/api/download-clip`, `/api/search`) as standalone route handlers in a dedicated server module
2. THE Vite config (`vite.config.ts`) SHALL contain only build configuration, plugin registration, and a proxy pass-through to the API_Server
3. WHEN the dev server starts, THE API_Server SHALL be available at the same URL paths as the current middleware implementation
4. THE API_Server SHALL be structured with one route handler per file, grouped in a `server/routes/` directory
5. IF an API route handler encounters an error, THEN THE API_Server SHALL return a structured JSON error response with an appropriate HTTP status code

### Requirement 2: Decompose the Store God Object

**User Story:** As a developer, I want the monolithic `store.ts` split into focused state slices, so that each concern is isolated, testable, and comprehensible.

#### Acceptance Criteria

1. THE Store SHALL be decomposed into separate State_Slices for: project state, pipeline orchestration, app configuration, narration state, and UI state
2. EACH State_Slice SHALL export its own typed state interface, action functions, and selector functions
3. THE Pipeline_Orchestrator SHALL be extracted into a dedicated module that coordinates step transitions without directly mutating state
4. THE Store SHALL expose a single composed hook (`useVideoProject`) that combines all State_Slices to maintain backward compatibility with existing components
5. WHEN a State_Slice action is invoked, THE Store SHALL update only the state relevant to that slice without triggering re-renders in unrelated slices
6. THE Store SHALL contain no direct service calls — all side effects SHALL be delegated to the Pipeline_Orchestrator or individual services

### Requirement 3: Decompose the Video Renderer

**User Story:** As a developer, I want the video renderer split into focused modules, so that rendering logic, canvas drawing, encoding, and preloading are independently maintainable.

#### Acceptance Criteria

1. THE Video_Renderer SHALL be decomposed into separate modules for: canvas drawing operations, media preloading, encoding (MediaRecorder/ffmpeg), Ken Burns animation, text/caption rendering, and render orchestration
2. EACH rendering sub-module SHALL export a focused public API with no more than 5 exported functions
3. THE render orchestration module SHALL coordinate the sub-modules without containing drawing or encoding logic itself
4. WHEN a rendering sub-module is modified, THE change SHALL not require modifications to unrelated rendering sub-modules
5. THE Video_Renderer modules SHALL be organized under a `src/services/renderer/` directory with an `index.ts` barrel export

### Requirement 4: Decompose the LLM Service

**User Story:** As a developer, I want LLM interactions split by concern, so that script generation, review, title generation, and topic ideas are independently testable and modifiable.

#### Acceptance Criteria

1. THE LLM_Service SHALL be decomposed into separate modules for: script generation, script review, title/SEO generation, topic idea generation, and shared LLM utilities (API call wrapper, retry logic, response parsing)
2. EACH LLM sub-module SHALL accept its dependencies (API key, model name, endpoint) as parameters rather than reading from global state
3. THE shared LLM utilities module SHALL provide a single `callLLM` function that handles retries, timeout, and JSON response parsing
4. WHEN a new LLM-powered feature is added, THE developer SHALL be able to create a new module without modifying existing LLM modules
5. THE LLM modules SHALL be organized under a `src/services/llm/` directory with an `index.ts` barrel export

### Requirement 5: Remove Dead Code

**User Story:** As a developer, I want all dead code removed, so that the codebase only contains code that is actively used and maintained.

#### Acceptance Criteria

1. THE codebase SHALL not contain any exported functions or types that have zero import references (excluding test files and barrel exports)
2. THE `src/services/tts.ts` file SHALL be removed or consolidated if its only export (`VOICES` array) is unused by production code
3. WHEN dead code is identified, THE removal SHALL be verified by confirming that the test suite and TypeScript compilation pass without errors
4. THE codebase SHALL not contain commented-out code blocks longer than 3 lines
5. IF a service file contains functions that are only referenced by other functions within the same file and are unreachable from any export, THEN those functions SHALL be removed

### Requirement 6: Establish Consistent Service Patterns

**User Story:** As a developer, I want all services to follow the same structural pattern, so that the codebase is predictable and easy to navigate.

#### Acceptance Criteria

1. THE codebase SHALL use pure functions with explicit parameter injection for all service modules (no class-based services, no module-level mutable state)
2. EACH service module SHALL handle errors by returning typed result objects or throwing typed errors — not by mixing return-value errors with thrown exceptions
3. THE codebase SHALL use a single consistent pattern for async operations: async functions returning `Promise<T>` with explicit error types
4. EACH service module SHALL define its public API in a single file and keep internal helpers in separate private files within the same directory
5. THE codebase SHALL use a consistent logging pattern: all services SHALL use the existing `logger` utility for structured logging rather than `console.log` or `console.error`

### Requirement 7: Establish Clear Module Boundaries

**User Story:** As a developer, I want clear module boundaries with explicit interfaces, so that modules cannot reach into each other's internals and dependencies flow in one direction.

#### Acceptance Criteria

1. THE codebase SHALL organize services into domain directories (`src/services/renderer/`, `src/services/llm/`, `src/services/media/`, `src/services/tts/`, `src/services/pipeline/`) each with a barrel `index.ts` that defines the public API
2. EACH domain directory SHALL only import from other domains through their barrel exports — not from internal files
3. THE dependency graph between domain directories SHALL be acyclic (no circular imports between domains)
4. WHEN a module needs a type from another domain, THE type SHALL be imported from the shared `src/types.ts` file or the domain's barrel export
5. THE `src/types.ts` file SHALL remain the single source of truth for shared data types used across multiple domains

### Requirement 8: Consolidate TTS into a Unified Interface

**User Story:** As a developer, I want a single TTS interface that delegates to multiple engines, so that adding or removing TTS engines does not affect the rest of the application.

#### Acceptance Criteria

1. THE TTS_Service SHALL expose a single `generateNarration` function that accepts a text string, voice configuration, and engine preference, and returns an audio URL
2. THE TTS_Service SHALL delegate to engine-specific implementations (Grok, Melo, browser SpeechSynthesis) based on configuration without exposing engine internals to callers
3. WHEN a new TTS engine is added, THE developer SHALL only need to implement a single engine interface and register it — no changes to existing code
4. IF the preferred TTS engine fails, THEN THE TTS_Service SHALL fall back to the next available engine and log the fallback event
5. THE TTS engine implementations SHALL be organized under `src/services/tts/` with one file per engine

### Requirement 9: Refactor Large Components

**User Story:** As a developer, I want large UI components decomposed into smaller focused components, so that each component has a single responsibility and is independently testable.

#### Acceptance Criteria

1. EACH component file SHALL contain no more than 400 lines of code (including imports and types)
2. THE `PreviewStep` component (~977 lines) SHALL be decomposed into sub-components for: video player controls, timeline display, quality settings, and export actions
3. THE `AssetTester` component (~986 lines) SHALL be decomposed into sub-components for: asset list, asset detail view, test runner, and results display
4. WHEN a component exceeds 400 lines, THE component SHALL be split into a directory with an `index.tsx` barrel export and focused sub-components
5. EACH component SHALL receive data and callbacks via props — not by directly calling services or accessing global state (except through the composed store hook)

### Requirement 10: Standardize Error Handling and Retry Logic

**User Story:** As a developer, I want consistent error handling and retry patterns, so that failure modes are predictable and retry logic is not duplicated across services.

#### Acceptance Criteria

1. THE codebase SHALL provide a shared `withRetry` utility that accepts a function, retry count, backoff strategy, and abort signal, and handles retry logic for all services
2. EACH service that performs network requests SHALL use the shared `withRetry` utility rather than implementing custom retry loops
3. THE codebase SHALL define a standard `ServiceError` type that includes: error code, human-readable message, original error, and whether the error is retryable
4. WHEN a service operation fails after all retries, THE service SHALL return or throw a `ServiceError` with full context about the failure chain
5. THE codebase SHALL remove all ad-hoc watchdog timers and replace them with the standard timeout mechanism provided by `fetchWithTimeout` or the `withRetry` utility

