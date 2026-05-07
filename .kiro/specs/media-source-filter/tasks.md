# Implementation Plan

## Overview

Fix the media harvesting pipeline to reject candidates from blocked domains (state propaganda, watermarked stock previews, low-quality/meme sites, adult content) before they enter the scoring pool. Introduce domain filtering (`src/services/domainFilter.ts`), vision model quality inspection (`src/services/visionCheck.ts`), resolution-based scoring, and 4K search hints. All rejections are logged with URL, matched pattern, and reason category. Existing scoring logic and trusted-source behavior remain unchanged for non-blocked domains.

## Tasks

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Blocked Domain Candidates Enter Scoring Pool
  - **CRITICAL**: This test MUST FAIL on unfixed code — failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior — it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate blocked-domain candidates are not rejected
  - **Scoped PBT Approach**: Generate `MediaCandidate` objects whose `sourceUrl` or `url` hostname matches a blocklist pattern (propaganda: sputniknews, rt.com, presstv, cgtn, tass, xinhua, globalresearch; watermarked-stock: shutterstock, gettyimages, istockphoto, 123rf, dreamstime, depositphotos, alamy; low-quality: 9gag, imgur, memegenerator, knowyourmeme, ifunny, cheezburger, buzzfeed; adult-content: pornhub, xvideos, xhamster, redtube, youporn)
  - Use `fast-check` to generate candidates with blocked domains in both `sourceUrl` and `url` fields
  - Test that `filterCandidates([candidate])` rejects the candidate (accepted.length === 0, rejected.length === 1) with a non-empty `pattern` and a valid `category`
  - Also test that the logger is called with the rejected URL, matched pattern, and reason category (Requirement 2.4)
  - Test that both `sourceUrl` and `url` are checked — a clean `sourceUrl` with a blocked `url` must still be rejected (Requirement 2.6)
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (filterCandidates does not exist yet — this confirms the bug exists: no domain filtering is performed)
  - Document counterexamples found (e.g., "candidate with sourceUrl 'https://sputniknews.com/photo/123' enters scoring pool without rejection")
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.6_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Non-Blocked Candidate Behavior Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - Observe: `scoreCandidate` on unfixed code for candidates from reuters.com, apnews.com, bbc.co.uk returns scores with existing high-trust bonus (+100)
  - Observe: `scoreCandidate` on unfixed code for Wikimedia Commons candidates returns scores with Wikimedia bonus (+80 or +120 depending on sourceType)
  - Observe: `scoreCandidate` on unfixed code for Picsum/Unsplash fallback candidates returns scores with existing Picsum/Unsplash bonuses
  - Observe: All existing scoring factors (keyword relevance, resolution, aspect ratio, topic relevance, negative keyword filters, entertainment penalty, Picsum penalty, SVG penalty, small image penalty) produce identical results for non-blocked candidates
  - Write property-based test with `fast-check`: for all `MediaCandidate` objects where neither `sourceUrl` nor `url` hostname matches any blocklist pattern, `filterCandidates([candidate])` returns `accepted.length === 1` with the candidate's fields unchanged
  - Write property-based test: for non-blocked candidates from trusted domains (reuters, apnews, bbc, wikimedia), `scoreCandidate` produces the same score as the original implementation (no trust-tier penalty applied to trusted domains)
  - Write property-based test: for non-blocked candidates from unknown domains, the trust-tier penalty is exactly -50 (per design)
  - Verify tests pass on UNFIXED code (the filter passthrough and score preservation tests should pass since non-blocked candidates are unaffected)
  - **EXPECTED OUTCOME**: Tests PASS (confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [x] 3. Create domain filter module (`src/services/domainFilter.ts`)

  - [x] 3.1 Implement domain blocklist, allowlist, and utility functions
    - Create `src/services/domainFilter.ts` with:
    - `DOMAIN_BLOCKLIST`: `Map<string, string[]>` with categories: propaganda (sputniknews, rt.com, presstv, cgtn, tass, xinhua, globalresearch), watermarked-stock (shutterstock, gettyimages, istockphoto, 123rf, dreamstime, depositphotos, alamy), low-quality (9gag, imgur, memegenerator, knowyourmeme, ifunny, cheezburger, buzzfeed), adult-content (pornhub, xvideos, xhamster, redtube, youporn)
    - `TRUSTED_DOMAINS`: array of trusted domain patterns (reuters, apnews, bbc, bloomberg, nytimes, wsj, cnn, cnbc, forbes, wikimedia, unsplash, pexels)
    - `extractHostname(url: string): string` — safely extracts hostname, returns empty string on failure
    - `isDomainBlocked(url: string): { blocked: boolean; pattern?: string; category?: string }` — checks a URL against the blocklist
    - `filterCandidates(candidates: MediaCandidate[]): { accepted: MediaCandidate[]; rejected: Array<{ candidate: MediaCandidate; pattern: string; category: string }> }` — filters array, checking both `sourceUrl` and `url` for each candidate
    - `getDomainTrustTier(url: string): 'trusted' | 'unknown'` — returns trust tier for scoring adjustment
    - _Bug_Condition: isBugCondition(candidate) where sourceUrl or url hostname matches DOMAIN_BLOCKLIST_
    - _Expected_Behavior: blocked candidates rejected before scoring; rejections logged with URL, pattern, category_
    - _Preservation: non-blocked candidates pass through unchanged; trusted domains identified correctly_
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [x] 3.2 Write unit tests for domainFilter
    - Test `extractHostname` with valid URLs, invalid URLs, empty strings, URLs without protocol
    - Test `isDomainBlocked` for each blocklist category (propaganda, watermarked-stock, low-quality, adult-content)
    - Test `isDomainBlocked` returns `{ blocked: false }` for trusted and unknown domains
    - Test `filterCandidates` correctly splits an array into accepted and rejected
    - Test `filterCandidates` checks both `sourceUrl` and `url` fields
    - Test `getDomainTrustTier` returns `'trusted'` for allowlisted domains and `'unknown'` for others
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [x] 3.3 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Blocked Domain Candidates Rejected
    - **IMPORTANT**: Re-run the SAME test from task 1 — do NOT write a new test
    - The test from task 1 encodes the expected behavior for `filterCandidates`
    - When this test passes, it confirms blocked-domain candidates are properly rejected
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms domain filtering works correctly)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.6_

  - [x] 3.4 Verify preservation tests still pass
    - **Property 2: Preservation** - Non-Blocked Candidate Behavior Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions for non-blocked candidates)
    - Confirm all tests still pass after domain filter implementation

- [x] 4. Checkpoint — Ensure all domain filter tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Integrate domain filtering into media harvester

  - [x] 5.1 Integrate `filterCandidates` into `harvestMediaWithSafetyNet` in `src/services/media.ts`
    - Import `filterCandidates` from `./domainFilter`
    - After `candidates = results.flat()` (and after paid fallback append), call `filterCandidates(candidates)` to split into accepted and rejected arrays
    - For each rejected candidate, call `logger.warn('DomainFilter', ...)` with the URL, matched pattern, and category
    - Pass only the accepted array to the scoring loop
    - _Bug_Condition: isBugCondition(candidate) where sourceUrl or url hostname matches DOMAIN_BLOCKLIST_
    - _Expected_Behavior: blocked candidates removed before scoring; rejections logged_
    - _Preservation: non-blocked candidates scored identically to before_
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 5.2 Add trust-tier scoring adjustment to `scoreCandidate` in `src/services/media.ts`
    - Import `getDomainTrustTier` from `./domainFilter`
    - After the existing "Source Authority" section, check `getDomainTrustTier(c.sourceUrl || c.url)`
    - If tier is `'unknown'`, apply -50 penalty so trusted editorial sources are preferred over unknown domains
    - Preserve all existing scoring logic — the trust-tier adjustment is additive
    - _Bug_Condition: unknown-domain candidates previously scored equally to trusted sources_
    - _Expected_Behavior: unknown domains receive -50 penalty; trusted domains unaffected_
    - _Preservation: all existing scoring factors unchanged_
    - _Requirements: 2.5, 3.5_

  - [x] 5.3 Write integration tests for domain filtering in the harvester
    - Test the full `harvestMediaWithSafetyNet` flow with mocked source functions returning a mix of blocked and non-blocked candidates, verifying only non-blocked candidates appear in the final sorted results
    - Test that `sourceSegmentMedia` produces assets only from non-blocked domains when underlying harvesters return mixed results
    - Test that rejection logging is called with correct parameters for each blocked candidate
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [x] 6. Checkpoint — Ensure all domain filter + integration tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement resolution scoring and 4K search hints

  - [x] 7.1 Add resolution bonus calculation to `scoreCandidate` in `src/services/media.ts`
    - After existing dimension checks, compute resolution bonus:
    - 4K+ (width ≥ 3840 && height ≥ 2160) → +200
    - 2K/1440p (width ≥ 2560 && height ≥ 1440) → +100
    - 1080p (width ≥ 1920 && height ≥ 1080) → +50
    - 720p (width ≥ 1280 && height ≥ 720) → +0 (baseline)
    - Below 720p (width < 1280 || height < 720) → -100
    - Unknown dimensions (width/height undefined) → +0 (no bonus or penalty)
    - _Requirements: 5.1, 5.3, 5.4_

  - [x] 7.2 Add 4K search hints to `searchDDGLocal` in `src/services/media.ts`
    - Append "high resolution" to DuckDuckGo image search queries to bias results toward higher-resolution assets
    - _Requirements: 5.2_

  - [x] 7.3 Request highest resolution from Wikimedia in `searchWikimedia` in `src/services/media.ts`
    - Set `thumbwidth=3840` in the Wikimedia API URL to request the highest available resolution version of each image
    - _Requirements: 5.5_

  - [x] 7.4 Write property-based test for resolution scoring monotonicity
    - **Property 3: Resolution Scoring** - Resolution Bonus Monotonicity
    - For any two `MediaCandidate` objects identical except for resolution, the candidate with higher resolution SHALL receive a higher or equal resolution bonus
    - Use `fast-check` to generate pairs of candidates with different resolutions
    - Verify: 4K → +200, 2K → +100, 1080p → +50, 720p → +0, below 720p → -100, unknown → +0
    - Verify that within 100-point relevance score ties, higher resolution wins (tiebreaker behavior)
    - _Requirements: 5.1, 5.3, 5.4_

  - [x] 7.5 Write unit tests for resolution scoring and search hints
    - Test resolution bonus calculation for each tier boundary
    - Test that unknown dimensions produce +0 bonus
    - Test that DuckDuckGo queries include resolution hints
    - Test that Wikimedia API requests use `thumbwidth=3840`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 8. Checkpoint — Ensure all resolution scoring tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Implement vision model quality check (`src/services/visionCheck.ts`)

  - [x] 9.1 Create `src/services/visionCheck.ts` with vision check functions
    - Define `VISION_BLOCKING_CRITERIA` list: visible watermarks, state media branding/logos, meme text overlays, adult/graphic content, extreme low quality/compression, social media screenshots, AI-generated artifacts
    - Define `VISION_GO_CRITERIA` list: professional editorial photography, high resolution/sharp detail, relevant subject matter, clean backgrounds, official/institutional imagery, news wire quality
    - Define `VisionCheckResult` interface: `{ pass: boolean; confidence: number; issues: string[]; qualitySignals: string[]; qualityScore: number }`
    - Implement `buildVisionCheckPrompt(imageUrl: string)` — builds system + user prompt for Reka Edge with blocking and go criteria, requests structured JSON response
    - Implement `checkCandidateVision(imageUrl: string, apiKey: string, options?)` — sends image to `rekaai/reka-edge` via OpenRouter using `fetchWithTimeout` with 15s timeout and 1 retry; returns `VisionCheckResult | null` (non-throwing)
    - Implement `batchVisionCheck(candidates: MediaCandidate[], apiKey: string, options?)` — runs up to 3 concurrent vision checks using `Promise.allSettled`; returns `Map<string, VisionCheckResult>`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.8, 4.9_

  - [x] 9.2 Write unit tests for visionCheck
    - Test `buildVisionCheckPrompt` includes all blocking and go criteria in the prompt
    - Test `checkCandidateVision` returns null on API failure (non-throwing)
    - Test `checkCandidateVision` parses valid Reka Edge responses correctly
    - Test `batchVisionCheck` respects concurrency limit of 3
    - Test `batchVisionCheck` returns partial results when some checks fail
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.8, 4.9_

  - [x] 9.3 Write property-based test for vision check blocking criteria rejection
    - **Property 4: Vision Check** - Blocking Criteria Rejection
    - For any `MediaCandidate` that passes domain filtering, if the Reka Edge vision model returns `pass: false` with detected issues, the candidate SHALL be rejected from the final selection and the rejection SHALL be logged
    - Use `fast-check` to generate mock vision check results with various combinations of blocking issues
    - Verify that candidates with `pass: false` are removed from the pool and logged
    - Verify that candidates with `pass: true` receive a quality score bonus (qualityScore * 20, scaled to 0-200)
    - _Requirements: 4.1, 4.2, 4.5, 4.6_

  - [x] 9.4 Write property-based test for vision check graceful degradation
    - **Property 5: Vision Check** - Graceful Degradation
    - For any scenario where the OpenRouter API key is missing, the vision model call fails, or the call times out, the pipeline SHALL continue with domain-only filtering — no candidates SHALL be lost
    - Use `fast-check` to generate arrays of `MediaCandidate` objects and simulate API failures (missing key, network error, timeout)
    - Verify that all domain-filtered candidates are preserved when vision check is unavailable
    - Verify that a warning is logged when vision check fails
    - _Requirements: 4.7_

- [x] 10. Integrate vision check into media harvester

  - [x] 10.1 Integrate `batchVisionCheck` into `harvestMediaWithSafetyNet` in `src/services/media.ts`
    - Import `batchVisionCheck` from `./visionCheck`
    - After domain filtering and scoring, take the top 5 candidates and run `batchVisionCheck` if OpenRouter API key is available
    - For candidates that fail vision check (`pass: false`), remove them from the pool and log the rejection with detected issues
    - For candidates that pass, add `qualityScore * 20` (scaled to 0-200) as a bonus to their score
    - If no API key is configured or all vision checks fail, skip the vision step entirely and use domain-filtered + resolution-scored results as-is
    - Use `fetchWithTimeout` with 15s timeout and 1 retry, consistent with existing OpenRouter call pattern
    - _Bug_Condition: vision-failed candidates previously had no quality gate_
    - _Expected_Behavior: vision-rejected candidates removed; vision-passed candidates boosted_
    - _Preservation: pipeline continues normally when vision check is unavailable_
    - _Requirements: 4.1, 4.2, 4.5, 4.6, 4.7, 4.8, 4.9_

  - [x] 10.2 Write integration tests for vision check in the harvester
    - Test that vision check is called for top candidates when API key is available
    - Test that vision-rejected candidates are removed from final results
    - Test that vision check failure (API error/timeout) falls back gracefully to domain-only filtering
    - Test that 4K candidates score higher than 1080p candidates with otherwise identical attributes
    - _Requirements: 4.1, 4.5, 4.7, 5.1_

- [x] 11. Final checkpoint — Ensure all tests pass
  - Run the full test suite: `vitest run --passWithNoTests`
  - Verify all 5 correctness properties pass
  - Verify all unit and integration tests pass
  - Ensure no regressions in existing media harvester tests
  - Ensure all tests pass, ask the user if questions arise.
