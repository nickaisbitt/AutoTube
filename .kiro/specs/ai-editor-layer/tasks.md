# Implementation Plan: AI Editor Layer

## Overview

Implement the AI Editor Layer as a new pipeline step between narration and assembly. The implementation follows an incremental approach: first define the data types, then build the pure transformation logic (testable without LLM), then add the LLM integration, then wire into the store and UI, and finally update the renderer to consume the new Edit Plan parameters.

## Tasks

- [x] 1. Define new types and update PipelineStep
  - [x] 1.1 Add EditPlan types to `src/types.ts`
    - Add `TransitionType`, `KenBurnsParams`, `MediaReplacementSuggestion`, `CaptionSettings`, `SegmentEditEntry`, and `EditPlan` interfaces as specified in the design document
    - Add `AIEditOptions` interface
    - Update `PipelineStep` union to include `'ai_edit'` between `'narration'` and `'assembly'`
    - Add optional `editPlan?: EditPlan` field to `VideoProject`
    - _Requirements: 1.2, 8.1, 8.2_

- [x] 2. Implement core pure functions in `src/services/aiEditor.ts`
  - [x] 2.1 Create `src/services/aiEditor.ts` with `createDefaultEditPlan`
    - Implement `createDefaultEditPlan(project: VideoProject): EditPlan` that generates a no-op plan preserving original project state
    - For each segment: preserve original shot order, set `adjustedDuration: null`, set `transition: null` for first segment and `{ type: 'crossfade', durationMs: 500 }` for others, generate default Ken Burns params per asset, set default caption settings based on narration word count, and empty replacement suggestions
    - Set `isDefault: true` on the returned plan
    - _Requirements: 8.4, 9.5_

  - [x] 2.2 Implement `applyEditPlan` pure function
    - Implement `applyEditPlan(project: VideoProject, plan: EditPlan): VideoProject` that returns a new VideoProject with all edits applied
    - Apply shot reordering: reorder each segment's media assets according to `shotOrder` in the plan
    - Apply timing adjustments: update segment durations from `adjustedDuration` (skip if null)
    - Enforce total duration within 10% of original: if exceeded, scale all adjusted durations proportionally
    - Store the `editPlan` on the returned project
    - Must NOT mutate input `project` or `plan` objects (use spread/structuredClone)
    - _Requirements: 2.1, 2.2, 2.3, 3.2, 3.3, 9.1, 9.2, 9.3, 9.4, 9.5_

  - [x] 2.3 Implement `validateEditPlanResponse`
    - Implement `validateEditPlanResponse(raw: unknown, project: VideoProject): EditPlan | null`
    - Validate that `raw` is an object with a `segments` array
    - For each segment entry: validate `segmentId` exists in project, validate `shotOrder` contains exactly the same asset IDs as the segment's media, clamp Ken Burns zoom values to [1.0, 1.25], validate transition types against the allowed set (`crossfade`, `cut`, `dissolve`, `wipe`), validate caption settings ranges
    - Merge valid fields with defaults for missing fields (partial JSON support)
    - Return null if the input is completely invalid (not an object, no segments array)
    - _Requirements: 8.3, 8.4, 10.3, 10.4, 10.5_

  - [x] 2.4 Implement `summarizeEditPlan`
    - Implement `summarizeEditPlan(plan: EditPlan, project: VideoProject): string`
    - Count and report: segments with reordered shots, segments with adjusted timing, media replacement suggestions, transition changes
    - Return a human-readable summary string (e.g., "Reordered 3 segments, adjusted 5 timings, suggested 2 media replacements")
    - _Requirements: 11.1_

  - [x] 2.5 Write property tests for `applyEditPlan` (Properties 1-5)
    - **Property 1: Asset Set Preservation** — For any valid VideoProject and EditPlan, `applyEditPlan` produces a project with exactly the same set of MediaAsset IDs, no assets added/removed/duplicated, segmentId unchanged
    - **Validates: Requirements 2.2, 2.3, 9.3**
    - **Property 2: Immutability of Inputs** — For any valid VideoProject and EditPlan, calling `applyEditPlan` does NOT mutate the input objects (deep comparison before/after)
    - **Validates: Requirements 9.2**
    - **Property 3: No-Op Plan Identity** — For any valid VideoProject, applying `createDefaultEditPlan(project)` produces equivalent script durations, media order, and narration clips
    - **Validates: Requirements 9.5**
    - **Property 4: EditPlan JSON Round-Trip** — For any valid EditPlan, `JSON.parse(JSON.stringify(plan))` produces a deeply equal object
    - **Validates: Requirements 8.5**
    - **Property 5: Total Duration Bounded Within 10%** — For any valid VideoProject and EditPlan, the output total duration is within 10% of the input total duration
    - **Validates: Requirements 3.3, 9.4**

  - [x] 2.6 Write property tests for timing and caption logic (Properties 6-7, 11-12)
    - **Property 6: Timing Adjustment Matches Narration Plus Padding** — For segments where narration duration differs from segment duration by >1s, `adjustedDuration` equals narration duration + padding
    - **Validates: Requirements 3.2**
    - **Property 7: No-Narration Duration Preservation** — For segments with no NarrationClip, `adjustedDuration` is null
    - **Validates: Requirements 3.5**
    - **Property 11: Caption Window Size Matches Word Count Range** — >100 words → wordsPerWindow in [8,12]; ≤50 words → wordsPerWindow in [4,8]
    - **Validates: Requirements 7.2, 7.3**
    - **Property 12: Fast-Paced Flagging** — Segments with >4 words/second have `isFastPaced: true`
    - **Validates: Requirements 7.5**

  - [x] 2.7 Write property tests for Ken Burns and transitions (Properties 8-10)
    - **Property 8: Ken Burns Zoom Range Constraint** — All zoomStart/zoomEnd values in [1.0, 1.25]
    - **Validates: Requirements 6.4**
    - **Property 9: Consecutive Shots Have Distinct Ken Burns Motion** — No two consecutive assets in a segment share identical panDirectionX AND panDirectionY
    - **Validates: Requirements 6.2, 6.3**
    - **Property 10: Transition Variety Constraint** — No more than 3 consecutive segment boundaries use the same transition type
    - **Validates: Requirements 4.4**

  - [x] 2.8 Write unit tests for `createDefaultEditPlan`, `validateEditPlanResponse`, and `summarizeEditPlan`
    - Test `createDefaultEditPlan` produces `isDefault: true` with no modifications
    - Test `validateEditPlanResponse` rejects completely invalid JSON (returns null)
    - Test `validateEditPlanResponse` merges partial JSON with defaults
    - Test `validateEditPlanResponse` clamps out-of-range Ken Burns values
    - Test `validateEditPlanResponse` replaces invalid transition types with 'crossfade'
    - Test `summarizeEditPlan` produces human-readable change counts
    - _Requirements: 8.3, 8.4, 10.4, 10.5, 11.1_

- [x] 3. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement LLM prompt construction and response parsing
  - [x] 4.1 Implement `buildEditPrompt`
    - Implement `buildEditPrompt(project: VideoProject): { system: string; user: string }`
    - System prompt: instruct the LLM to act as a professional video editor, describe the EditPlan JSON schema, list all editing dimensions (shot reordering, timing, transitions, Ken Burns, captions, media replacement)
    - User prompt: include full script structure (segment IDs, types, titles, narration text, durations), media asset metadata (IDs, URLs, segmentId, shotType, isFallback, concept, score), narration clip durations and word counts, visual plan summaries
    - Request JSON response format via `response_format: { type: 'json_object' }`
    - Include style-specific transition preferences (warfront/documentary prefer "cut" for event/data beats)
    - Include constraints: Ken Burns zoom [1.0, 1.25], no >3 consecutive same transitions, total duration within 10%
    - _Requirements: 4.5, 10.1, 10.2_

  - [x] 4.2 Implement `runAIEditPass` orchestration function
    - Implement `runAIEditPass(project: VideoProject, apiKey: string, options?: AIEditOptions): Promise<{ editedProject: VideoProject; editPlan: EditPlan }>`
    - Call `buildEditPrompt` to construct the prompt
    - Call OpenRouter via `fetchWithTimeout` with 30s timeout and 2 retries (matching existing patterns in `llm.ts` and `llmVisualDirector.ts`)
    - Parse LLM response JSON, pass through `validateEditPlanResponse`
    - If validation returns null, fall back to `createDefaultEditPlan`
    - If validation returns a valid plan, call `applyEditPlan` to produce the edited project
    - Report progress via `options.onProgress` at key phases: "Analyzing pacing..." (10%), "Optimizing transitions..." (30%), "Generating Ken Burns parameters..." (50%), "Evaluating media quality..." (70%), "Applying edit plan..." (90%)
    - Support cancellation via `options.signal`
    - _Requirements: 1.3, 1.4, 1.5, 1.6, 10.2, 10.3, 10.4, 10.6_

  - [x] 4.3 Write property tests for prompt and replacement suggestions (Properties 13-16)
    - **Property 13: Prompt Completeness** — For any valid VideoProject with ≥1 segment, ≥1 media asset, ≥1 narration clip, `buildEditPrompt` produces a prompt containing at least one segment title, one asset ID, and one narration duration
    - **Validates: Requirements 10.1**
    - **Property 14: Partial JSON Merge Produces Valid Plan** — For any partial EditPlan JSON, `validateEditPlanResponse` returns null or a fully valid EditPlan with defaults for missing fields
    - **Validates: Requirements 10.5**
    - **Property 15: Fallback Assets Flagged as Replacement Candidates** — For any VideoProject with `isFallback: true` assets, a valid EditPlan includes those asset IDs in replacement suggestions
    - **Validates: Requirements 5.4**
    - **Property 16: Replacement Suggestions Have Sufficient Queries** — Every `MediaReplacementSuggestion` has ≥2 `alternativeQueries`
    - **Validates: Requirements 5.3**

  - [x] 4.4 Write unit tests for `buildEditPrompt` and `runAIEditPass` error paths
    - Test `buildEditPrompt` includes all project data in the prompt string
    - Test `runAIEditPass` returns default plan when LLM returns garbage JSON
    - Test `runAIEditPass` returns default plan when LLM times out (mock fetchWithTimeout to throw)
    - Test `runAIEditPass` handles partial JSON by merging with defaults
    - Test `runAIEditPass` respects AbortSignal cancellation
    - _Requirements: 10.1, 10.3, 10.4, 10.5, 10.6_

- [x] 5. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Wire AI Edit step into the store and pipeline
  - [x] 6.1 Update `src/store.ts` with `runAIEdit` callback and pipeline integration
    - Add `'ai_edit'` to the `PIPELINE_STEPS` array between `'narration'` and `'assembly'`
    - Add `ai_edit: 'idle'` to the initial `stepStatuses` state
    - Update `validateStoredProject` to handle the new `ai_edit` step in stored state
    - Implement `runAIEdit` callback: set `ai_edit` to `processing`, call `runAIEditPass`, on success store edited project and advance to assembly, on error log and preserve original project
    - Implement `skipAIEdit` callback: set `ai_edit` to `complete` and advance to assembly without modification
    - Update `generateNarration` completion to set `ai_edit` to `active` (instead of directly activating assembly)
    - Export `runAIEdit` and `skipAIEdit` from `useVideoProject`
    - Add `aiEditAbortRef` for cancellation support
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 11.4, 11.5_

  - [x] 6.2 Write unit tests for store AI edit integration
    - Test that narration completion activates `ai_edit` step
    - Test that `runAIEdit` success advances to assembly with edited project
    - Test that `runAIEdit` failure preserves original project and allows skip
    - Test that `skipAIEdit` advances to assembly without modification
    - _Requirements: 1.1, 1.4, 1.5, 11.4, 11.5_

- [x] 7. Create AIEditStep UI component
  - [x] 7.1 Create `src/components/AIEditStep.tsx`
    - Follow the same component pattern as `NarrationStep.tsx` and `AssemblyStep.tsx`
    - Accept props: `project`, `status`, `progress`, `message`, `onRunAIEdit`, `onSkipAIEdit`, `onNext`
    - Display progress indicator with phase messages while processing (Requirement 1.6)
    - When complete, display the edit summary from `summarizeEditPlan` (Requirement 11.1)
    - Display per-segment rationale from the EditPlan (Requirement 11.2)
    - Visually distinguish AI-edited segments from unmodified segments (Requirement 11.3)
    - Include a "Skip AI Edit" button that calls `onSkipAIEdit` (Requirement 11.4)
    - Include a "Next" button to advance to assembly after completion
    - _Requirements: 1.6, 11.1, 11.2, 11.3, 11.4, 11.5_

  - [x] 7.2 Wire `AIEditStep` into `src/App.tsx`
    - Import `AIEditStep` component
    - Add `'ai_edit'` case to the `renderStep` switch statement
    - Wire `runAIEdit` and `skipAIEdit` callbacks from the store
    - Update `handleGenerateNarration` completion flow to navigate to `ai_edit` step
    - Add `handleAssembleVideo` as the `onNext` handler for AIEditStep
    - _Requirements: 1.1, 1.2_

  - [x] 7.3 Update `PipelineSidebar` to include the AI Edit step
    - Add the `ai_edit` step to the sidebar step list between narration and assembly
    - Use an appropriate icon (e.g., `Sparkles` or `Wand2` from lucide-react)
    - Display step label as "AI Edit"
    - _Requirements: 1.1, 1.2_

- [x] 8. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Update renderer to consume EditPlan parameters
  - [x] 9.1 Update `src/services/videoRenderer.ts` to use Ken Burns params and transitions from EditPlan
    - In `renderVideoToBlob`, check if `project.editPlan` exists
    - When rendering each segment, look up the segment's `SegmentEditEntry` from the edit plan
    - Apply Ken Burns params from the edit plan (zoomStart, zoomEnd, panDirectionX, panDirectionY) instead of the hardcoded values in the `draw` function
    - Apply transition type and duration from the edit plan instead of the default crossfade
    - Implement `dissolve` and `wipe` transition rendering in addition to the existing crossfade
    - Fall back to existing hardcoded behavior when no edit plan is present (backward compatible)
    - _Requirements: 4.1, 4.2, 4.3, 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x] 9.2 Write unit tests for renderer EditPlan consumption
    - Test that renderer uses Ken Burns params from edit plan when present
    - Test that renderer falls back to default Ken Burns when no edit plan exists
    - Test that renderer applies correct transition type from edit plan
    - Test that `dissolve` and `wipe` transitions render without errors
    - _Requirements: 4.1, 6.1_

- [x] 10. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate the 16 universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The implementation language is TypeScript, matching the existing codebase
- The project uses vitest for unit tests and fast-check (v4.7.0) for property-based tests
- Property test files should follow the naming convention `aiEditor.property.test.ts` in `src/services/__tests__/`
- Unit test files should follow the naming convention `aiEditor.test.ts` in `src/services/__tests__/`
