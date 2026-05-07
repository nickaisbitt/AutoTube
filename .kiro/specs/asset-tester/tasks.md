# Implementation Plan: Asset Tester

## Overview

Build a standalone Asset Tester component (`src/components/AssetTester.tsx`) that runs the full media acquisition pipeline in isolation for any search query, displaying comprehensive results with scoring, filtering, sorting, and export capabilities. The component is accessed via a button in the Settings modal and manages all state locally — no store integration needed.

## Tasks

- [x] 1. Create the AssetTester component with pipeline executor
  - [x] 1.1 Create `src/components/AssetTester.tsx` with the full-screen modal shell, search input with autofocus, "Test Harvest" button, and "Cancel" button
    - Define `AssetTesterProps` interface (`isOpen`, `onClose`, `appConfig`)
    - Implement `RunStatus`, `StageTimingEntry`, `RejectedCandidate`, `TestRunResult`, `SortKey`, `ViewMode`, `FilterState` types as internal interfaces
    - Wire up local state via `useState` for: `runStatus`, `result`, `query`, `sortKey`, `viewMode`, `filterState`, `abortController`, `currentStage`, `copyStatus`
    - Render the modal overlay with `data-testid="asset-tester-modal"`, search input with `autoFocus`, and action buttons
    - Disable "Test Harvest" when query is empty or run is in progress; show "Cancel" when running
    - Trigger pipeline on Enter key press or button click
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

  - [x] 1.2 Implement the pipeline executor as an internal async function
    - Create a new `AbortController` per run, pass `signal` to all stages
    - Stage 1: Call `queryAllProviders(query, appConfig, signal)` and time with `performance.now()`
    - Stage 2: Call `filterCandidates(rawCandidates)` — retain both `accepted` and `rejected` arrays
    - Stage 3: Score accepted candidates using `scoreCandidate()` with a minimal `TopicContext` built from the query string
    - Stage 4: If OpenRouter key present, call `batchVisionCheck()` on top 3 scored candidates; merge vision results (pass/fail, issues, quality signals, quality score) onto candidates; move failed candidates to rejected list with `reason: 'vision-check'`
    - Stage 5: Call `batchResolve()` on top 3 candidates; merge `resolvedUrl`, `resolvedWidth`, `resolvedHeight`
    - Stage 6: If OpenRouter key present, call `batchScoreQuality()` on top 3 candidates; merge `qualityFactors` and `qualityCompositeScore`
    - Stage 7: If OpenRouter key present, call `focalCrop()` for candidates where `needsCropping()` returns true; merge `cropMetadata`
    - Wrap each stage in `performance.now()` timing; record `StageTimingEntry[]` and `totalTimeMs`
    - Mark skipped stages (missing API key or zero candidates) with `durationMs: null`
    - On abort, catch `AbortError`, reset to idle, clear partial results
    - On completion, build `TestRunResult` and set state
    - Show a progress indicator with the current stage name while running
    - Show a notice banner when stages are skipped due to missing API key
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11, 6.1, 6.2, 6.3, 6.4_

  - [x] 1.3 Implement the results display area
    - Summary header: total accepted count, total rejected count, rejected-by-category breakdown
    - Accepted candidates section with grid view (thumbnail cards: image preview, source badge, final score, dimensions) and list view (table rows with all metadata fields)
    - For each candidate: show thumbnail, source, URL, dimensions, base score, final score
    - Show score breakdown: keyword relevance, source authority, resolution bonus, trust tier, penalties
    - Show vision check results: pass/fail badge, issues, quality signals, quality score (1–10)
    - Show quality factors: sharpness, lighting, composition, vibrancy, relevance, composite score (0–200)
    - Show resolver status: original URL vs resolved URL with upgrade indicator
    - Show focal crop preview: 16:9 crop rectangle overlaid on thumbnail (CSS overlay)
    - Visually distinguish top candidate as "Primary Shot" and second as "Secondary Shot"
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_

  - [x] 1.4 Implement the rejected candidates section
    - Separate "Rejected" section below accepted candidates
    - For domain-filter rejections: show matched pattern and category (propaganda, watermarked-stock, low-quality, adult-content)
    - For vision-check rejections: show detected blocking issues list
    - Each rejected candidate shows: thumbnail, source, URL, base score, rejection reason
    - Display rejected count grouped by category (domain filter vs vision check)
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 1.5 Implement sorting, filtering, and view mode controls
    - Sort controls: final score (default, descending), base score (descending), resolution (width×height, descending), source (alphabetical)
    - Filter controls: source name dropdown (DuckDuckGo, Wikimedia, Flickr, GovPress, Picsum), media type toggle (image, video)
    - Grid/list view toggle
    - Apply filters before sorting; update summary count on filter change
    - Preserve sort, filter, and view mode across re-runs
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 7.4_

  - [x] 1.6 Implement pipeline timing display and JSON export
    - Timing panel: per-stage elapsed ms, "Skipped" for null entries, total elapsed time
    - "Export JSON" button: disabled when no results, enabled when results exist
    - On click: copy full `TestRunResult` as formatted JSON to clipboard via `navigator.clipboard.writeText()`
    - Show "Copied to clipboard" confirmation that auto-dismisses after 2 seconds
    - Fallback: if clipboard API throws, render a read-only `<textarea>` with the JSON
    - Re-run behavior: clear previous results on new run, keep query editable after completion
    - _Requirements: 6.1, 6.2, 6.3, 8.1, 8.2, 8.3, 8.4, 8.5, 7.1, 7.2, 7.3_

- [x] 2. Add the Settings button integration
  - [x] 2.1 Add "Asset Tester" button to `src/components/SettingsModal.tsx`
    - Add a `useState` for `showAssetTester` boolean
    - Add button with `data-testid="open-asset-tester"` in the modal body, before the action buttons
    - Conditionally render `<AssetTester isOpen={showAssetTester} onClose={() => setShowAssetTester(false)} appConfig={config} />` passing the current config
    - Import `AssetTester` from `./AssetTester`
    - _Requirements: 1.1, 1.2_

- [x] 3. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 4. Write tests
  - [ ] 4.1 Write unit tests in `src/components/__tests__/AssetTester.test.tsx`
    - Test: "Asset Tester" button renders in SettingsModal
    - Test: Clicking the button opens the AssetTester modal
    - Test: Search input has autofocus on mount
    - Test: Enter key with non-empty query starts pipeline (mock service calls)
    - Test: Cancel button calls abort and returns to idle
    - Test: Progress indicator shows current stage name during run
    - Test: Grid/list toggle switches view mode
    - Test: Missing API key shows "Skipped" and notice banner for vision/quality/crop stages
    - Test: Export button disabled when no results, enabled when results exist
    - Test: Clipboard fallback renders textarea when clipboard API throws
    - Test: New run clears previous results
    - Test: Sort/filter/view mode preserved across re-runs
    - _Requirements: 1.1–1.6, 2.1–2.11, 3.1–3.8, 5.1–5.6, 6.1–6.4, 7.1–7.4, 8.1–8.5_

  - [ ]* 4.2 Write property test: Composite quality score equals weighted factor sum
    - **Property 1: Composite quality score invariant**
    - File: `src/services/__tests__/qualityScorer.pbt.test.ts` (append or create)
    - Generate random QualityFactors (5 integers 0–10), verify `computeCompositeScore()` equals `(sharpness×0.25 + lighting×0.20 + composition×0.15 + vibrancy×0.15 + relevance×0.25) × 20`
    - **Validates: Requirements 3.4**

  - [ ]* 4.3 Write property test: Candidate categorization completeness
    - **Property 2: Categorization completeness**
    - File: `src/components/__tests__/assetTester.pbt.test.ts`
    - Generate random arrays of MediaCandidates with random URLs (some matching blocklist patterns), verify `accepted.length + rejected.length === original.length`
    - **Validates: Requirements 3.8, 4.5**

  - [ ]* 4.4 Write property test: Rejected candidate metadata completeness
    - **Property 3: Rejected metadata completeness**
    - File: `src/components/__tests__/assetTester.pbt.test.ts`
    - For domain-filter rejections: verify non-empty `pattern` and `category` from valid set; for vision-check rejections: verify non-empty `issues` array
    - **Validates: Requirements 4.2, 4.3**

  - [ ]* 4.5 Write property test: Sorting correctness
    - **Property 4: Sorting correctness**
    - File: `src/components/__tests__/assetTester.pbt.test.ts`
    - Generate random candidate arrays with random scores/dimensions/sources, apply each sort key, verify ordering invariant holds for all adjacent pairs
    - **Validates: Requirements 5.1**

  - [ ]* 4.6 Write property test: Filtering correctness
    - **Property 5: Filtering correctness**
    - File: `src/components/__tests__/assetTester.pbt.test.ts`
    - Generate random candidate arrays, apply source/type filters, verify every element matches the filter and filtered length ≤ original length
    - **Validates: Requirements 5.2, 5.6**

  - [ ]* 4.7 Write property test: Pipeline timing validity
    - **Property 6: Pipeline timing validity**
    - File: `src/components/__tests__/assetTester.pbt.test.ts`
    - Generate random arrays of non-negative timing values, verify each ≥ 0 and total ≥ max individual value
    - **Validates: Requirements 6.1, 6.2**

  - [ ]* 4.8 Write property test: JSON export round-trip
    - **Property 7: JSON round-trip**
    - File: `src/components/__tests__/assetTester.pbt.test.ts`
    - Generate random `TestRunResult` objects, verify `JSON.parse(JSON.stringify(result))` preserves query, candidate counts, timing entries, and per-candidate `finalScore`/`baseScore`/`url`/`source`
    - **Validates: Requirements 8.3**

- [x] 5. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- The component is entirely self-contained — local state only, no store writes
- All service imports are direct (queryAllProviders, filterCandidates, scoreCandidate, batchVisionCheck, batchResolve, batchScoreQuality, focalCrop, needsCropping)
- The UI follows the existing industrial theme: `font-mono`, `border-2`, `bg-brand-500`, no rounded corners, no transitions
- Property tests use `fast-check` v4.7.0 with `{ numRuns: 100 }`
