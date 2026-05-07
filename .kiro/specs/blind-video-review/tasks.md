# Implementation Plan: Blind Video Review

## Overview

Implement an automated blind quality review that runs after video assembly. The system extracts key frames from the rendered video, sends them with the script and thumbnail to the Reka Edge vision model via OpenRouter, parses the structured quality report, stores it on the project, and displays it as a report card in the preview screen. All new service code lives in `src/services/blindReview.ts`, with type extensions in `src/types.ts`, pipeline integration in `src/store.ts`, and UI in `src/components/PreviewStep.tsx`.

## Tasks

- [x] 1. Define data models and pure utility functions
  - [x] 1.1 Add `QualityReport` interface and `blindReview` field to `src/types.ts`
    - Add the `QualityReport` interface with `scores` (5 categories, each integer 1–10), `feedback` (5 category strings), `letterGrade`, `summary`, and `reviewedAt` fields
    - Add optional `blindReview?: QualityReport` field to the `VideoProject` interface
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 6.1_

  - [x] 1.2 Create `src/services/blindReview.ts` with pure utility functions
    - Implement `clampScore(value: unknown): number` — clamps to integer in [1, 10], defaults non-numeric to 5
    - Implement `deriveLetterGrade(scores: number[]): string` — computes arithmetic mean and maps to A/B/C/D/F per the score-to-grade table
    - Implement `scoreColor(score: number): 'red' | 'amber' | 'green'` — 1–3 red, 4–6 amber, 7–10 green
    - Implement `gradeColor(grade: string): 'red' | 'amber' | 'green'` — A/B green, C amber, D/F red
    - Implement `truncateString(str: string, maxLength: number): string` — truncates with "…" suffix if over limit
    - Implement `parseJSONResponse(raw: string): unknown` — strips markdown code fences and parses JSON
    - _Requirements: 3.1, 3.3, 3.5, 5.2, 5.3, 7.1, 7.4_

  - [x] 1.3 (PBT) Property 3: Score clamping
    - **Property 3: For any numeric value (including floats, negatives, values > 10), `clampScore(value)` returns an integer in [1, 10]**
    - Use `fc.oneof(fc.integer(), fc.float(), fc.constant(NaN), fc.constant(undefined), fc.constant(null))` as generator
    - **Validates: Requirements 3.1, 3.5**

  - [x] 1.4 (PBT) Property 4: Letter grade derivation
    - **Property 4: For any array of 5 integers each in [1, 10], `deriveLetterGrade(scores)` returns the correct grade based on arithmetic mean**
    - Use `fc.array(fc.integer({ min: 1, max: 10 }), { minLength: 5, maxLength: 5 })` as generator
    - **Validates: Requirements 3.3**

  - [x] 1.5 (PBT) Property 5: Score-to-color mapping
    - **Property 5: For any integer score in [1, 10], `scoreColor(score)` returns 'red' for 1–3, 'amber' for 4–6, 'green' for 7–10**
    - Use `fc.integer({ min: 1, max: 10 })` as generator
    - **Validates: Requirements 5.2**

  - [x] 1.6 (PBT) Property 6: Grade-to-color mapping
    - **Property 6: For any letter grade in {A, B, C, D, F}, `gradeColor(grade)` returns 'green' for A/B, 'amber' for C, 'red' for D/F**
    - Use `fc.constantFrom('A', 'B', 'C', 'D', 'F')` as generator
    - **Validates: Requirements 5.3**

  - [x] 1.7 (PBT) Property 10: Feedback and summary truncation
    - **Property 10: For any string of arbitrary length, `truncateString(str, 500)` returns a string of length ≤ 500; if input ≤ maxLength, output equals input**
    - Use `fc.string({ minLength: 0, maxLength: 2000 })` and `fc.integer({ min: 1, max: 1000 })` as generators
    - **Validates: Requirements 7.4**

  - [x] 1.8 (PBT) Property 9: Markdown fence stripping
    - **Property 9: For any valid JSON string wrapped in markdown code fences, `parseJSONResponse(wrapped)` returns the same parsed object as `JSON.parse(original)`**
    - Use `fc.json()` wrapped with fence variants (`` ```json ... ``` ``, `` ``` ... ``` ``, no fences)
    - **Validates: Requirements 7.1**

- [x] 2. Implement frame extraction
  - [x] 2.1 Implement `computeFrameTimestamps` and `extractKeyFrames` in `src/services/blindReview.ts`
    - Implement `computeFrameTimestamps(durationSec, targetFrames?)` — returns 10–15 evenly-spaced timestamps based on duration (<30s → 10, 30–120s → 12, >120s → 15)
    - Implement `extractKeyFrames(videoBlob, options?)` — creates `<video>` from blob URL, seeks to each timestamp, draws to `<canvas>`, calls `toDataURL('image/jpeg')` at max 1280×720, returns base64 array
    - Handle errors: if blob cannot be decoded or extraction fails, throw with descriptive message
    - Support `AbortSignal` for cancellation
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [x] 2.2 (PBT) Property 1: Frame extraction count and spacing
    - **Property 1: For any video duration > 0, `computeFrameTimestamps(duration)` returns between 10 and 15 timestamps with equal intervals**
    - Use `fc.float({ min: 0.1, max: 600, noNaN: true })` as generator
    - Verify count is in [10, 15] and intervals are equal within floating-point tolerance
    - **Validates: Requirements 1.1**

- [x] 3. Implement prompt construction and API call
  - [x] 3.1 Implement `buildBlindReviewPrompt` in `src/services/blindReview.ts`
    - Build system prompt instructing the model to review as a real viewer with no context about intended topic/style/audience
    - Build user message array with image_url content parts for each frame, text content for script, and optional thumbnail image
    - Request JSON response with scores (1–10) for 5 categories, feedback per category, and overall summary
    - Prompt must NOT contain the project's topic, style, or audience strings
    - _Requirements: 2.2, 2.3_

  - [x] 3.2 Implement `callBlindReviewAPI` in `src/services/blindReview.ts`
    - POST to `https://openrouter.ai/api/v1/chat/completions` with model `rekaai/reka-edge`
    - Include `Authorization`, `HTTP-Referer` (`https://autotube.video`), and `X-Title` (`AutoTube Blind Reviewer`) headers
    - Use `fetchWithTimeout` with 60s timeout and 2 retries
    - Support `AbortSignal` for cancellation
    - Return raw response content string on success, `null` on failure (log errors, don't throw)
    - _Requirements: 2.1, 2.4, 2.5, 2.6_

  - [x] 3.3 (PBT) Property 2: Blind prompt excludes project context
    - **Property 2: For any project with arbitrary topic, style, and audience strings, the prompt text from `buildBlindReviewPrompt` does not contain those strings**
    - Use `fc.string({ minLength: 3, maxLength: 50 })` for topic/style/audience, filtering out strings that are substrings of the fixed prompt template
    - Verify the system prompt and all text content parts do not contain the topic, style, or audience
    - **Validates: Requirements 2.2**

- [x] 4. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement report parsing and orchestration
  - [x] 5.1 Implement `parseQualityReport` in `src/services/blindReview.ts`
    - Parse raw JSON (using `parseJSONResponse` for fence stripping)
    - Extract and clamp all 5 category scores using `clampScore`
    - Fill missing scores with default value of 5
    - Fill missing feedback strings with "No feedback provided."
    - Truncate feedback strings to 500 chars and summary to 1000 chars using `truncateString`
    - Derive letter grade from scores using `deriveLetterGrade`
    - Set `reviewedAt` to current ISO timestamp
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 7.1, 7.2, 7.4_

  - [x] 5.2 (PBT) Property 8: Missing field defaults
    - **Property 8: For any raw response object with an arbitrary subset of score and feedback fields omitted, `parseQualityReport(raw)` produces a complete QualityReport where every missing score is 5 and every missing feedback is "No feedback provided."**
    - Use `fc.record` with optional fields to generate partial raw objects
    - Verify all output fields are present and defaults are applied correctly
    - **Validates: Requirements 7.2**

  - [x] 5.3 (PBT) Property 7: QualityReport JSON round-trip
    - **Property 7: For any valid QualityReport object, `JSON.parse(JSON.stringify(report))` produces a deeply equal object**
    - Generate random valid QualityReport objects with scores in [1, 10], feedback strings ≤ 500 chars, summary ≤ 1000 chars, grade in {A, B, C, D, F}
    - **Validates: Requirements 6.2, 6.3, 7.3**

  - [x] 5.4 Implement `runBlindReview` orchestration function in `src/services/blindReview.ts`
    - Check for API key; return `null` immediately if missing
    - Extract key frames from `project.thumbnail` (the rendered video blob URL)
    - Build script text from `project.script` segments
    - Call `callBlindReviewAPI` with frames, script text, thumbnail, and API key
    - Parse response with `parseQualityReport`
    - Report progress via `onProgress` callback at key phases (extracting frames, reviewing video, parsing results)
    - Catch all errors and return `null` (non-throwing); re-throw `AbortError` for cancellation
    - _Requirements: 1.3, 2.5, 4.3, 4.4_

- [x] 6. Integrate into pipeline and persist data
  - [x] 6.1 Modify `assembleVideo` in `src/store.ts` to trigger blind review
    - After `renderVideoToBlob` succeeds, call `runBlindReview(updatedProject, appConfig.openRouterKey, { signal, onProgress })`
    - Map review progress (0–100) to overall assembly progress (96–99)
    - Store the returned `QualityReport` on `updatedProject.blindReview`
    - If review fails or returns `null`, log and continue to preview without a report
    - If user cancels (AbortError), re-throw to let existing cancellation handling work
    - Add `import { runBlindReview } from './services/blindReview'` to store.ts
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 6.2 Ensure `blindReview` field persists in localStorage save/load
    - Verify that the existing `validateStoredProject` function in `store.ts` passes through the `blindReview` field when loading from localStorage
    - The field is optional on `VideoProject`, so no migration is needed — older projects without it will simply have `undefined`
    - _Requirements: 6.1, 6.2, 6.3_

- [x] 7. Implement UI component
  - [x] 7.1 Add `BlindReviewCard` component to `src/components/PreviewStep.tsx`
    - Create a `BlindReviewCard` component that accepts `report: QualityReport | null`
    - When report is `null`, display "No blind review available for this project." message
    - When report is present, display:
      - Overall letter grade prominently with color coding (green for A/B, amber for C, red for D/F) using `gradeColor`
      - 5 category scores as labeled progress bars with color scale (red 1–3, amber 4–6, green 7–10) using `scoreColor`
      - Written feedback text per category
      - Overall summary text
    - Make the card collapsible with a toggle button
    - Place the card between the video player and the description section in PreviewStep
    - Import `scoreColor`, `gradeColor` from `../services/blindReview`
    - Import `QualityReport` from `../types`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [x] 7.2 Write unit tests for BlindReviewCard
    - Test that all 5 score categories render when report is present
    - Test that "no review" message renders when report is null
    - Test that collapse/expand toggle works
    - Test correct color classes for different score ranges
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 8. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests (PBT) validate universal correctness properties from the design document using `fast-check`
- Unit tests validate specific examples and edge cases using `vitest`
- The blind review is non-blocking — all errors are caught and the pipeline always continues to preview
- TypeScript is the implementation language, matching the existing codebase
