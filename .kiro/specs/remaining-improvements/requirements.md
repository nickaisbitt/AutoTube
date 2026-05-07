# Requirements Document

## Introduction

This specification covers the final 7 items (#35, #36, #39, #41, #42, #44, #45) from the 45-item AutoTube improvement list. These improvements span three categories: UI enhancements (regenerate script button, replace media button, topic suggestion verification), codebase architecture (splitting server-render.mjs into modules, deduplicating browser/server renderer logic), and data management (multiple concurrent project support, project format versioning). Together they complete the full improvement backlog for the AutoTube AI video generator.

## Glossary

- **Pipeline**: The sequential video generation workflow: Topic → Script → Media → Narration → AI Edit → Assembly → Preview.
- **ScriptStep**: The React component (`src/components/ScriptStep.tsx`) that displays the generated script and allows narration text editing.
- **MediaStep**: The React component (`src/components/MediaStep.tsx`) that displays sourced visual assets for each script segment.
- **TopicStep**: The React component (`src/components/TopicStep.tsx`) that handles topic input, AI-generated suggestions, style selection, and pipeline initiation.
- **Store**: The main state management hook (`src/store.ts`) that exposes `generateScript`, `replaceMediaAsset`, `sourceMedia`, and other pipeline actions.
- **Server_Renderer**: The Node.js server-side video renderer (`server-render.mjs`) that uses node-canvas, edge-tts, and ffmpeg to produce MP4 files.
- **Browser_Renderer**: The browser-side video renderer (`src/services/videoRenderer.ts`) that uses HTML Canvas and MediaRecorder as a fallback.
- **Caption_Utils**: The shared utility module (`src/services/captionUtils.ts`) containing pure helper functions for caption rendering, saturation scoring, and adaptive filtering.
- **VideoProject**: The TypeScript type (`src/types.ts`) representing a complete video project including script, media, narration, edit plan, and metadata.
- **TopicConfig**: The TypeScript type representing user-selected topic, style, duration, tone, and audience settings.
- **Project_File**: The JSON file written to `/tmp/autotube-project.json` that the Server_Renderer reads to obtain the VideoProject data for rendering.

## Requirements

### Requirement 1: Regenerate Script Button

**User Story:** As a video creator, I want to regenerate the script from the ScriptStep without navigating back to the topic step, so that I can quickly iterate on script quality without losing my place in the pipeline.

#### Acceptance Criteria

1. WHEN the ScriptStep status is "complete", THE ScriptStep SHALL display a "Regenerate Script" button in the header area alongside the existing script review UI.
2. WHEN the user clicks the "Regenerate Script" button, THE ScriptStep SHALL invoke the Store `generateScript` function with the current TopicConfig.
3. WHILE the script is regenerating, THE ScriptStep SHALL display the existing processing state (progress bar, phase indicators) and disable the "Regenerate Script" button.
4. WHEN script regeneration completes, THE ScriptStep SHALL display the new script segments and reset downstream pipeline steps (media, narration, ai_edit, assembly, preview) to idle.
5. IF script regeneration fails, THEN THE ScriptStep SHALL display the error message from the Store and re-enable the "Regenerate Script" button.
6. THE ScriptStep SHALL render the "Regenerate Script" button with an accessible label and keyboard-focusable interaction.

### Requirement 2: Replace Button for Individual Media Assets

**User Story:** As a video creator, I want a visible "Replace" button on each media asset card in the MediaStep, so that I can swap out individual visuals without re-running the entire media sourcing step.

#### Acceptance Criteria

1. WHEN the MediaStep status is "complete", THE MediaStep SHALL display a "Replace" button on each media asset card that is visible without requiring hover.
2. WHEN the user clicks the "Replace" button on a media asset card, THE MediaStep SHALL invoke the Store `replaceMediaAsset` function with the asset's ID.
3. WHILE a media asset is being replaced, THE MediaStep SHALL display a loading spinner on that specific asset card and disable the "Replace" button for that card.
4. WHEN media asset replacement completes, THE MediaStep SHALL display the new asset image, alt text, and metadata in place of the previous asset.
5. IF media asset replacement fails, THEN THE MediaStep SHALL display an inline error message on the affected asset card.
6. THE MediaStep SHALL allow replacing multiple assets sequentially without interfering with other asset cards.

### Requirement 3: Verify AI Topic Suggestion Loading States

**User Story:** As a video creator, I want the AI topic suggestion feature in TopicStep to clearly communicate loading, error, and missing-API-key states, so that I understand what is happening and what action to take.

#### Acceptance Criteria

1. WHILE the TopicStep is fetching AI-generated topic suggestions, THE TopicStep SHALL display a loading spinner with the text "Generating fresh topic ideas...".
2. WHEN the TopicStep has no API key configured, THE TopicStep SHALL display a message instructing the user to add an OpenRouter API key in Settings, with a key icon.
3. WHEN the AI topic suggestion request fails, THE TopicStep SHALL display the error message and a "Retry" button.
4. WHEN the user clicks the "Refresh" button, THE TopicStep SHALL re-invoke `generateTopicIdeas` and display the loading spinner during the request.
5. WHEN AI topic suggestions load successfully, THE TopicStep SHALL display up to 8 topic suggestion buttons in a 2-column grid with category icons.
6. WHEN the user clicks a suggested topic, THE TopicStep SHALL populate the topic input field with the selected topic label.

### Requirement 4: Split Server_Renderer into Modules

**User Story:** As a developer, I want the Server_Renderer split into focused modules, so that the codebase is easier to navigate, test, and maintain.

#### Acceptance Criteria

1. THE Server_Renderer SHALL be split into the following modules: frame drawing helpers, narration generation, audio concatenation, thumbnail generation, and main render orchestration.
2. THE main render orchestration module SHALL import and coordinate the other modules to produce the same MP4 output as the current monolithic Server_Renderer.
3. WHEN the split modules are used together, THE Server_Renderer SHALL produce output identical in behavior to the pre-split version for the same VideoProject input.
4. THE frame drawing helpers module SHALL export functions for procedural backgrounds, Ken Burns image overlay, letterbox bars, vignette, technical labels, captions, title cards, and end screens.
5. THE narration generation module SHALL export functions for generating narration audio with edge-tts and generating silence segments with ffmpeg.
6. THE audio concatenation module SHALL export functions for combining narration audio files and mixing with background music using ffmpeg.
7. THE thumbnail generation module SHALL export functions for generating video thumbnail images.
8. EACH split module SHALL be importable independently without requiring the full Server_Renderer.

### Requirement 5: Deduplicate Browser and Server Renderer Logic

**User Story:** As a developer, I want shared drawing logic extracted into a common module, so that visual rendering changes only need to be made once and both renderers stay in sync.

#### Acceptance Criteria

1. THE common rendering module SHALL contain the shared drawing logic currently duplicated between Browser_Renderer and Server_Renderer, including: procedural background generation, Ken Burns zoom and pan calculations, letterbox bar drawing, vignette overlay, and caption window computation.
2. THE Browser_Renderer SHALL import shared drawing logic from the common rendering module instead of maintaining its own copy.
3. THE Server_Renderer modules SHALL import shared drawing logic from the common rendering module instead of maintaining their own copies.
4. WHEN the common rendering module is updated, THE Browser_Renderer and Server_Renderer SHALL both reflect the change without separate edits.
5. THE common rendering module SHALL be environment-agnostic, accepting a generic 2D rendering context interface rather than depending on browser-specific `CanvasRenderingContext2D` or node-canvas-specific types.
6. THE Caption_Utils module SHALL remain as the home for pure computational helpers (saturation scoring, adaptive filter computation, caption window calculation) that are already shared.
7. FOR ALL valid VideoProject inputs, rendering through the Browser_Renderer and Server_Renderer with the shared module SHALL produce visually equivalent output to the pre-refactor versions (round-trip visual equivalence).

### Requirement 6: Multiple Concurrent Project Support

**User Story:** As a video creator, I want to run multiple video projects concurrently without file conflicts, so that I can batch-produce videos or iterate on different topics in parallel.

#### Acceptance Criteria

1. THE Server_Renderer SHALL use a unique project ID in the temp file path instead of the fixed `/tmp/autotube-project.json` path.
2. WHEN the Store saves a project for server-side rendering, THE Store SHALL write to `/tmp/autotube-project-{projectId}.json` where `{projectId}` is the VideoProject `id` field.
3. WHEN the Server_Renderer reads a project file, THE Server_Renderer SHALL accept the project file path as a parameter or derive it from the project ID.
4. WHEN a server-side render completes, THE Server_Renderer SHALL clean up the project-specific temp file.
5. IF two projects are rendered concurrently, THEN THE Server_Renderer SHALL read and write to separate temp files without data corruption.
6. THE `/api/save-project` and `/api/export-project` endpoints SHALL support project-ID-scoped file paths.

### Requirement 7: Project Format Versioning

**User Story:** As a developer, I want a version field on the VideoProject type, so that stored projects can be detected as outdated and migrated when the format changes.

#### Acceptance Criteria

1. THE VideoProject type SHALL include a `version` field of type `number`.
2. WHEN a new VideoProject is created, THE Store SHALL set the `version` field to the current schema version (initially `1`).
3. WHEN the Store loads a stored project that has no `version` field, THE Store SHALL treat the project as version `0` and apply any necessary migrations.
4. WHEN the Store loads a stored project with a `version` lower than the current schema version, THE Store SHALL apply sequential migrations to bring the project up to the current version.
5. IF a stored project has a `version` higher than the current schema version, THEN THE Store SHALL log a warning and attempt to load the project without migration.
6. THE migration system SHALL be extensible, allowing new migration functions to be added for each version increment without modifying existing migrations.
