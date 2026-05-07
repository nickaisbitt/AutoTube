# Implementation Plan: Blind Review Quality Fixes

## Overview

This plan implements eight quality improvements to the AutoTube video generation pipeline, addressing watermark detection, visual deduplication, narration-visual relevance, thumbnail generation, dynamic pacing, shot diversity, first-five-seconds impact, and narration-to-cut synchronization. Each task extends existing TypeScript modules (`media.ts`, `visualPlanner.ts`, `thumbnail.ts`, `editingRhythm.ts`, `storyboard.ts`) rather than introducing new services.

## Tasks

- [x] 1. Implement watermark detection and rejection
  - [x] 1.1 Add watermark domain penalty and indicator string penalty to `scoreCandidate` in `src/services/media.ts`
    - Add `WATERMARK_DOMAINS` array: shutterstock.com, gettyimages.com, istockphoto.com, 123rf.com, dreamstime.com, depositphotos.com, alamy.com, ftcdn.net
    - Add `WATERMARK_INDICATORS` array: "stock", "watermark", "preview", "comp", "sample", "licensed"
    - In `scoreCandidate`, check candidate URL/sourceUrl hostname against `WATERMARK_DOMAINS` and apply -500 penalty
    - In `scoreCandidate`, check candidate alt text and URL for `WATERMARK_INDICATORS` and apply -300 penalty
    - _Requirements: 1.1, 1.2_

  - [x] 1.2 Write property tests for watermark detection (Properties 1, 2)
    - **Property 1: Watermark domain penalty** — For any candidate with a watermarked-stock domain, score is at least 500 lower than identical candidate with non-blocked domain
    - **Property 2: Watermark indicator string penalty** — For any candidate with indicator strings in alt/URL, score is at least 300 lower than identical candidate without those strings
    - **Validates: Requirements 1.1, 1.2**
    - Create `src/services/__tests__/watermarkDetection.property.test.ts`

  - [x] 1.3 Implement watermark vision check integration and fallback chain
    - When OpenRouter API key is available, use existing `batchVisionCheck` on top 3 candidates to detect visible watermarks and reject candidates where vision model identifies a watermark
    - Implement fallback chain: if all candidates rejected, broaden query → try Wikimedia Commons/Unsplash → procedural background
    - _Requirements: 1.3, 1.4_

- [x] 2. Implement visual deduplication engine
  - [x] 2.1 Create `DeduplicationRegistry` interface and functions in `src/services/media.ts`
    - Define `DeduplicationRegistry` with `usedUrls: Set<string>` and `usedSignatures: Map<string, string>` (key: `${domain}::${normalizedAlt}`)
    - Implement `createDeduplicationRegistry()`, `registerAsset(registry, asset)`, and `getDeduplicationPenalty(registry, candidate)` returning 0, -200, or -400
    - Replace existing `usedUrlsMap` with the new registry, reset at start of each `harvestMediaForProject` call
    - Integrate `getDeduplicationPenalty` into the scoring pipeline so candidates matching exact URLs get -400 and near-duplicates (same domain+alt) get -200
    - When deduplication causes all candidates to score below threshold, generate alternative query from secondary shot concept before procedural fallback
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 2.2 Write property tests for deduplication (Properties 3, 4)
    - **Property 3: Deduplication registry tracks all assigned assets** — For any sequence of `registerAsset` calls, `usedUrls` contains those URLs and `getDeduplicationPenalty` returns -400 for them
    - **Property 4: Near-duplicate penalty** — For any candidate whose domain+alt matches registry but URL doesn't, penalty is -200
    - **Validates: Requirements 2.1, 2.2, 2.3**
    - Create `src/services/__tests__/deduplication.property.test.ts`

- [x] 3. Implement segment-narration visual relevance enforcement
  - [x] 3.1 Add keyword match relevance scoring to `scoreCandidate` in `src/services/media.ts`
    - Count keyword matches (words > 2 chars) between candidate alt text and segment narration text
    - If matches < 2, ensure relevance score component is non-positive (zero or negative)
    - Add contextual mismatch penalty of -250 when alt text contains terms from an unrelated domain
    - _Requirements: 3.1, 3.3_

  - [x] 3.2 Enhance query generation in `src/services/visualPlanner.ts` for narration-derived queries
    - Ensure `generateQueries` includes at least one query derived directly from narration noun phrases (already partially implemented via `extractNounPhrases`)
    - Ensure segment title appears as a mandatory component in at least one search query (verify `titleEntityCombo` logic covers this)
    - _Requirements: 3.2, 3.4_

  - [x] 3.3 Write property tests for relevance scoring (Properties 5, 6, 7)
    - **Property 5: Keyword match relevance threshold** — For any candidate/narration pair with < 2 shared keywords, relevance score is non-positive
    - **Property 6: Narration noun phrases appear in search queries** — For any segment with narration containing multi-word noun phrases, at least one query contains a narration-derived noun phrase
    - **Property 7: Segment title appears in search queries** — For any segment with non-empty title, at least one query contains the title or its significant words
    - **Validates: Requirements 3.1, 3.2, 3.4**
    - Create `src/services/__tests__/relevanceScoring.property.test.ts`

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Fix thumbnail generation
  - [x] 5.1 Implement `isBlackThumbnail` and `validateThumbnailSize` in `src/services/thumbnail.ts`
    - `isBlackThumbnail(imageData, threshold?)`: returns true if >90% of pixels have R, G, B each within 10 of 0
    - `validateThumbnailSize(blob, minBytes?)`: returns true if blob size >= minBytes (default 10KB)
    - `validateThumbnailText(text)`: ensure existing function returns 2-5 words (already implemented, verify correctness)
    - _Requirements: 4.5, 4.6, 4.3_

  - [x] 5.2 Add post-render validation and fallback to `generateThumbnail`
    - After rendering, check if result is black using `isBlackThumbnail`
    - If black, regenerate with gradient-plus-text fallback (gradient background + bold 52-56px white text overlay from hook line or topic title)
    - Validate minimum 10KB file size; if below, regenerate with higher quality
    - Ensure `selectThumbnailBackground` selects highest-scored non-fallback asset (already implemented, verify)
    - Ensure thumbnail always renders a non-black image with text overlay of 2-5 words and a dominant visual subject
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [x] 5.3 Write property tests for thumbnail (Properties 8, 9, 10)
    - **Property 8: Thumbnail background asset selection** — For any non-empty asset array with non-fallback assets, `selectThumbnailBackground` returns the highest-scored non-fallback asset
    - **Property 9: Thumbnail text word count enforcement** — For any input string, `validateThumbnailText` returns 2-5 words
    - **Property 10: Black thumbnail detection** — For any ImageData with >90% near-black pixels, `isBlackThumbnail` returns true; otherwise false
    - **Validates: Requirements 4.2, 4.3, 4.5**
    - Create `src/services/__tests__/thumbnail.property.test.ts`

- [x] 6. Implement dynamic cut pacing
  - [x] 6.1 Update `planSegmentShots` in `src/services/renderer/editingRhythm.ts` for 4-second max hold and opening pacing
    - Reduce `maxHoldTimeSec` from 5 to 4 seconds in `DEFAULT_EDITING_RHYTHM_CONFIG`
    - Add `openingMaxHoldTimeSec: 3` to config for segments in the first 10 seconds of the video
    - Add `splitThresholdSec: 6` (reduce from 8) so segments > 6s get at least 2 shots
    - Apply Ken Burns motion (2-5% zoom/pan per second) to all static image shots by setting `motionType: 'ken_burns'` with rate parameters
    - _Requirements: 5.1, 5.2, 5.6, 7.3_

  - [x] 6.2 Implement sentence boundary detection and cut alignment
    - Add `detectSentenceBoundaries(narration, segmentDuration): SentenceBoundary[]` — regex-based sentence splitting with estimated timestamps based on word rate
    - Add `detectEmphasisPoints(narration, segmentDuration): number[]` — detect data citations, proper nouns, key phrases and return their estimated timestamps
    - Add `alignCutsToSentences(shots, boundaries, emphasisPoints, segmentDuration): ShotPlan[]` — snap shot boundaries to nearest sentence boundary while avoiding cuts within 0.5s of emphasis points
    - Integrate into `planSegmentShots` so cuts align with meaning shifts rather than fixed intervals
    - _Requirements: 5.3, 8.1, 8.2, 8.3_

  - [x] 6.3 Implement pattern interrupt planning and contrasting transitions
    - Add `planPatternInterrupts(totalDuration, segments): TextCardEntry[]` — ensure no gap > 20s between pattern interrupts (text card, zoom change, or transition)
    - Add `shouldInsertContrastingTransition(beatA, beatB): boolean` — returns true when consecutive segments share the same narrative beat
    - Integrate pattern interrupts into the rendering pipeline
    - _Requirements: 5.4, 5.5_

  - [x] 6.4 Write property tests for pacing controller (Properties 11-16, 21-24)
    - **Property 11: Maximum 4-second hold time** — Every shot has duration ≤ 4 seconds
    - **Property 12: Shot splitting for segments > 6 seconds** — At least 2 shots returned
    - **Property 13: Cuts align with sentence boundaries** — Cut points within 0.5s of sentence boundaries
    - **Property 14: Pattern interrupt maximum spacing** — No gap > 20s between interrupts
    - **Property 15: Contrasting transition for same-beat segments** — Returns true for same-beat pairs
    - **Property 16: Ken Burns motion on all static images** — All image shots have Ken Burns with 2-5% rate
    - **Property 21: Faster pacing in opening 10 seconds** — Shots ≤ 3s in first 10 seconds
    - **Property 22: Cut avoidance near emphasis points** — No cut within 0.5s of emphasis point
    - **Property 23: Distinct shots per sentence** — N sentences with N concepts → N distinct shots
    - **Property 24: Text card synchronization tolerance** — Card display within 0.5s of narration timestamp
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 7.3, 8.1, 8.2, 8.3, 8.4**
    - Create `src/services/__tests__/pacingController.property.test.ts`

- [x] 7. Implement visual variety through shot type diversity
  - [x] 7.1 Add shot type diversity enforcement to `src/services/storyboard.ts`
    - After building storyboard, check if any shot type exceeds 40% of frames; if so, flag segments for regeneration
    - When `scoreShotDiversity` returns score < 50, identify 3 lowest-diversity segments for visual plan regeneration
    - Enforce minimum 3 distinct shot types across any 5 consecutive segments
    - _Requirements: 6.1, 6.2, 6.3_

  - [x] 7.2 Add beat-specific query keywords to `src/services/visualPlanner.ts`
    - When beat is "data": inject chart/graph/data/visualization/statistics/numbers keywords into queries
    - When beat is "quote": inject portrait/speaker/person/face/interview/press keywords into queries
    - Ensure `generateQueries` already handles these beats (verify and enhance existing switch cases)
    - _Requirements: 6.4, 6.5_

  - [x] 7.3 Write property tests for shot diversity (Properties 17, 18, 19)
    - **Property 17: Shot type diversity cap** — No single shot type > 40% of frames when total ≥ 10
    - **Property 18: Minimum shot type variety per window** — At least 3 distinct types in any 5 consecutive segments
    - **Property 19: Beat-specific query keywords** — "data" beat queries contain chart/graph keywords; "quote" beat queries contain portrait/speaker keywords
    - **Validates: Requirements 6.1, 6.3, 6.4, 6.5**
    - Create `src/services/__tests__/shotDiversity.property.test.ts`

- [x] 8. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Implement first-five-seconds impact
  - [x] 9.1 Add `detectWeakHook` function and first-segment orchestration logic
    - Implement `detectWeakHook(narration): WeakHookResult` — analyze first 2 sentences for personal-stakes keywords or statistics; return `{ isWeak: true, reason }` if neither found
    - Define `PERSONAL_STAKES_KEYWORDS` and `STATISTIC_PATTERN` as specified in design
    - Ensure first segment always gets "hook" beat classification in visual planning
    - Ensure first segment's media asset is the highest-scored non-fallback asset across the entire project
    - If first segment gets a fallback, retry sourcing up to 2 additional times with broadened queries
    - _Requirements: 7.1, 7.2, 7.4, 7.5_

  - [x] 9.2 Write property test for weak hook detection (Property 20)
    - **Property 20: Weak hook detection** — For any narration where first 2 sentences lack personal-stakes keywords and statistics, `detectWeakHook` returns `{ isWeak: true }`
    - **Validates: Requirements 7.2**
    - Create `src/services/__tests__/hookDetection.property.test.ts`

- [x] 10. Implement narration-to-cut synchronization
  - [x] 10.1 Add `synchronizeTextCards` function to `src/services/renderer/editingRhythm.ts`
    - Implement `synchronizeTextCards(cards, narrationTimestamps, tolerance): TextCardEntry[]` — adjust card display start times to be within 0.5s of corresponding narration timestamps
    - Ensure animated text cards (statistics, quotes) display synchronized with narration
    - _Requirements: 8.4_

  - [x] 10.2 Wire narration-to-cut sync into segment shot planning
    - When narration audio is available, place visual cuts at sentence boundaries detected in narration text
    - When a segment contains multiple sentences with multiple shot concepts, assign distinct visual shots to each sentence
    - Integrate `alignCutsToSentences` (from task 6.2) into the rendering orchestrator
    - _Requirements: 8.1, 8.3_

- [x] 11. Integration wiring and final validation
  - [x] 11.1 Wire all new scoring penalties into the media harvesting pipeline
    - Ensure `harvestMediaForProject` creates a `DeduplicationRegistry` at the start and passes it through the scoring pipeline
    - Ensure watermark penalties, deduplication penalties, and relevance scoring all apply during candidate evaluation
    - Ensure first-segment impact logic runs after all segments are scored
    - _Requirements: 1.1, 1.2, 2.1, 2.2, 2.3, 2.4, 3.1, 7.1_

  - [x] 11.2 Wire pacing and diversity enforcement into the rendering pipeline
    - Ensure `planSegmentShots` uses the updated 4s max hold, 3s opening hold, and Ken Burns motion
    - Ensure sentence boundary alignment and emphasis point avoidance are applied
    - Ensure pattern interrupts are inserted and contrasting transitions are applied for same-beat segments
    - Ensure shot diversity enforcement triggers regeneration when needed
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 6.1, 6.2, 6.3, 8.1, 8.2_

  - [x] 11.3 Wire thumbnail validation into the thumbnail generation flow
    - Ensure `generateThumbnail` and `generateSplitScreenThumbnail` both run black-detection and minimum-size validation
    - Ensure fallback gradient+text is used when validation fails
    - _Requirements: 4.1, 4.5, 4.6_

- [x] 12. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The project uses `vitest` with `fast-check` v4.7.0 for property-based testing
- All changes extend existing modules rather than introducing new services
