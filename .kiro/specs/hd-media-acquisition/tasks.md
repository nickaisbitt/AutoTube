# Implementation Plan: HD Media Acquisition

## Overview

This plan transforms AutoTube's media pipeline from accepting search-result thumbnails into a professional-grade HD visual acquisition system. The implementation follows the pipeline architecture: **Search → Merge → Resolve → Score → Crop → Select**, with caching at the Resolve and Score stages. Each task builds incrementally on the previous, starting with shared types and caching infrastructure, then adding source providers, and finally wiring everything into the existing harvester.

All new modules live under `src/services/` with source providers in `src/services/sourceProviders/`. Tests follow the existing pattern in `src/services/__tests__/`.

## Tasks

- [x] 1. Schema extensions and shared types
  - [x] 1.1 Extend `MediaAsset` and `AppConfig` in `src/types.ts`
    - Add optional `cropMetadata: { x: number; y: number; width: number; height: number }` to `MediaAsset`
    - Add optional `qualityFactors: { sharpness: number; lighting: number; composition: number; vibrancy: number; relevance: number }` to `MediaAsset`
    - Add optional `resolvedWidth`, `resolvedHeight`, and `resolvedUrl` fields to `MediaAsset`
    - Add optional `pexelsKey`, `pixabayKey`, `flickrKey` fields to `AppConfig`
    - Update `DEFAULT_APP_CONFIG` in `src/store.ts` to include the three new key fields (empty strings)
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 9.1_

  - [x] 1.2 Create `src/services/sourceProviders/types.ts` — SourceProvider interface
    - Define `SourceProviderConfig` interface with `apiKey`, `signal`, `maxResults`
    - Define `SourceProvider` interface with `name`, `requiresKey`, `isAvailable()`, `search()`
    - _Requirements: 2.9_

  - [ ]* 1.3 Write property test for MediaAsset JSON round-trip
    - **Property 11: MediaAsset JSON round-trip**
    - Generate random `MediaAsset` objects with all optional fields (`cropMetadata`, `qualityFactors`, `resolvedWidth`, `resolvedHeight`, `resolvedUrl`, `trace`) using fast-check arbitraries
    - Assert `JSON.parse(JSON.stringify(asset))` produces a deeply equal object
    - Test file: `src/services/__tests__/types.test.ts`
    - **Validates: Requirements 10.6**

- [x] 2. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Caching layer
  - [x] 3.1 Implement `src/services/mediaCache.ts` — MediaCache class
    - Implement `CacheEntry<T>` interface with `data` and `timestamp` fields
    - Export `CACHE_TTL_MS = 24 * 60 * 60 * 1000`
    - Implement `MediaCache` class with `memoryCache` (Map) and `storagePrefix` for localStorage keys
    - Implement `isValid()`, `get()`, `set()` methods for both `'persistent'` (localStorage) and `'memory'` tiers
    - Implement `pruneExpired()` and `clear()` methods
    - Implement convenience methods: `getCachedResolution`, `setCachedResolution`, `getCachedVisionResult`, `setCachedVisionResult`, `getCachedImageData`, `setCachedImageData`
    - Handle `localStorage` quota errors by falling back to in-memory storage silently
    - Handle `JSON.parse` failures on corrupted cache entries as cache misses
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8_

  - [ ]* 3.2 Write property test for cache TTL enforcement
    - **Property 10: Cache TTL enforcement**
    - Generate random timestamps relative to `Date.now()` using fast-check
    - Assert `isValid()` returns `true` iff `Date.now() - timestamp < CACHE_TTL_MS`
    - Assert entries at or beyond the 24-hour boundary are treated as expired
    - Test file: `src/services/__tests__/mediaCache.test.ts`
    - **Validates: Requirements 6.2, 6.4, 6.6**

  - [ ]* 3.3 Write unit tests for MediaCache
    - Test localStorage fallback when quota is exceeded
    - Test expired entry pruning
    - Test memory-tier get/set
    - Test corrupted JSON handling (cache miss)
    - Test file: `src/services/__tests__/mediaCache.test.ts`
    - _Requirements: 6.7, 6.8_

- [x] 4. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Source providers
  - [x] 5.1 Implement `src/services/sourceProviders/pexels.ts` — Pexels provider
    - Implement `PexelsProvider` class implementing `SourceProvider`
    - Query `https://api.pexels.com/v1/search?query={query}&per_page=15` with `Authorization` header
    - Map `response.photos[]` to `MediaCandidate` with `baseScore: 170`
    - Include photographer name in `source` field for attribution
    - Use `src.original` or `src.large2x` for full-resolution URL, set `width` and `height`
    - Use `fetchWithTimeout` with 10s timeout
    - _Requirements: 2.2, 2.9, 2.10_

  - [x] 5.2 Implement `src/services/sourceProviders/pixabay.ts` — Pixabay provider
    - Implement `PixabayProvider` class implementing `SourceProvider`
    - Query `https://pixabay.com/api/?key={apiKey}&q={query}&per_page=15&image_type=photo`
    - Map `response.hits[]` to `MediaCandidate` with `baseScore: 160`
    - Use `largeImageURL` for full resolution, set `width` and `height` from `imageWidth`/`imageHeight`
    - Use `fetchWithTimeout` with 10s timeout
    - _Requirements: 2.3, 2.9, 2.11_

  - [x] 5.3 Implement `src/services/sourceProviders/flickr.ts` — Flickr provider
    - Implement `FlickrProvider` class implementing `SourceProvider`
    - Query Flickr API with `flickr.photos.search`, filtered to CC licenses (`license=1,2,3,4,5,6,9,10`)
    - Request `extras=url_l,url_o,o_dims` for full-resolution URLs and dimensions
    - Map results to `MediaCandidate` with `baseScore: 140`
    - Include license type (e.g., "Flickr CC-BY") in `source` field
    - Use `fetchWithTimeout` with 10s timeout
    - _Requirements: 2.4, 2.9, 2.12_

  - [x] 5.4 Implement `src/services/sourceProviders/govPress.ts` — Government press provider
    - Implement `GovPressProvider` class implementing `SourceProvider`
    - `requiresKey = false`, `isAvailable()` always returns `true`
    - Query whitehouse.gov, defense.gov, nato.int photo galleries for political/military/international topics
    - Use Open Graph meta tags and structured data to find images
    - Set `baseScore: 150` for public domain, high-authority images
    - Only activate for topics matching political/military/international keywords
    - Use `fetchWithTimeout` with 10s timeout
    - _Requirements: 2.5_

  - [x] 5.5 Implement `src/services/sourceProviders/index.ts` — Provider registry
    - Export `getAllProviders()` returning all provider instances
    - Export `getAvailableProviders(config)` filtering by `isAvailable()` and API key presence
    - Export `queryAllProviders(query, config, signal)` that queries all available providers in parallel with 10s timeout per provider, merges results, and deduplicates by URL (keeping highest `baseScore`)
    - Export `deduplicateCandidates(candidates)` as a pure function
    - Include existing DDG, Wikimedia, Unsplash/Picsum providers alongside new ones
    - Include Serper as a paid fallback when `config.serperKey` is configured
    - _Requirements: 2.1, 2.6, 2.7, 2.8, 2.9_

  - [ ]* 5.6 Write property test for candidate deduplication
    - **Property 4: Candidate deduplication preserves highest score per URL**
    - Generate arrays of `MediaCandidate` objects with duplicate URLs and varying `baseScore` values
    - Assert every URL appears exactly once in output
    - Assert the kept candidate has the maximum `baseScore` among all candidates sharing that URL
    - Assert output length ≤ input length
    - Test file: `src/services/__tests__/sourceProviders/index.test.ts`
    - **Validates: Requirements 2.7**

  - [ ]* 5.7 Write property test for provider normalization
    - **Property 5: Provider normalization produces valid MediaCandidates**
    - Generate mock API responses for each provider using fast-check
    - Assert every returned `MediaCandidate` has non-empty `source`, `alt`, `query`, numeric `baseScore`, and `type` of `'image'` or `'video'`
    - Test file: `src/services/__tests__/sourceProviders/index.test.ts`
    - **Validates: Requirements 2.9**

  - [ ]* 5.8 Write unit tests for source providers
    - Test Pexels: correct baseScore (170), photographer attribution, max 15 results
    - Test Pixabay: correct baseScore (160), `largeImageURL` usage
    - Test Flickr: CC license filtering, baseScore (140), license in source field
    - Test GovPress: topic keyword activation, public domain marking
    - Test registry: provider failure resilience (one times out, others succeed)
    - Test files: `src/services/__tests__/sourceProviders/pexels.test.ts`, `pixabay.test.ts`, `flickr.test.ts`, `govPress.test.ts`, `index.test.ts`
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 2.8_

- [x] 6. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Full-resolution resolver
  - [x] 7.1 Implement `src/services/fullResResolver.ts`
    - Implement `extractBestImageUrl(html, originalUrl, baseUrl)` — pure function that parses HTML to find highest-resolution image from `<meta og:image>`, `srcset`, JSON-LD, `<img>` tags ≥1200px, and gallery pattern matching
    - Implement `stripWordPressDimensions(url)` — strips `-NNNxNNN` suffixes from WordPress image URLs (idempotent)
    - Implement srcset parser that selects the largest width descriptor
    - Implement `checkRobotsTxt(domain, options)` — fetches and parses robots.txt, caches results per session, returns `true` (allowed) on failure
    - Implement `resolveFullResolution(candidate, options)` — fetches source page HTML within 8s timeout, applies resolution strategies in order, falls back to original URL
    - Implement `batchResolve(candidates, options)` — resolves top N candidates in parallel with per-domain rate limiting (max 2 concurrent per domain), integrates with `MediaCache`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 1.11_

  - [ ]* 7.2 Write property test for HTML extraction
    - **Property 1: HTML extraction selects the highest-resolution image**
    - Generate valid HTML documents with random combinations of `<img>` tags, `<meta og:image>`, `srcset`, and JSON-LD image data using fast-check
    - Assert `extractBestImageUrl` returns the URL with the largest pixel dimensions
    - Test file: `src/services/__tests__/fullResResolver.test.ts`
    - **Validates: Requirements 1.1, 1.4, 1.5**

  - [ ]* 7.3 Write property test for srcset parsing
    - **Property 2: srcset parsing selects the largest width descriptor**
    - Generate valid `srcset` strings with random width descriptors using fast-check
    - Assert the parser returns the URL with the numerically largest width descriptor
    - Test file: `src/services/__tests__/fullResResolver.test.ts`
    - **Validates: Requirements 1.2**

  - [ ]* 7.4 Write property test for WordPress dimension stripping
    - **Property 3: WordPress dimension suffix stripping round-trip**
    - Generate URLs with and without `-NNNxNNN` suffixes using fast-check
    - Assert stripping removes the suffix when present, returns unchanged when absent
    - Assert the result is a valid URL string
    - Assert idempotence: applying twice produces the same result as once
    - Test file: `src/services/__tests__/fullResResolver.test.ts`
    - **Validates: Requirements 1.3**

  - [ ]* 7.5 Write unit tests for full-resolution resolver
    - Test timeout fallback (8s) returns original URL
    - Test no-upgrade fallback returns original URL unchanged
    - Test robots.txt blocking skips resolution
    - Test per-domain rate limiting (max 2 concurrent)
    - Test file: `src/services/__tests__/fullResResolver.test.ts`
    - _Requirements: 1.6, 1.7, 1.8, 1.9_

- [x] 8. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Quality scorer
  - [x] 9.1 Implement `src/services/qualityScorer.ts`
    - Define `QualityFactors` interface (`sharpness`, `lighting`, `composition`, `vibrancy`, `relevance` — each 0–10)
    - Define `QualityScorerResult` with `factors` and `compositeScore` (0–200)
    - Export `QUALITY_WEIGHTS` constant: `{ sharpness: 0.25, lighting: 0.20, composition: 0.15, vibrancy: 0.15, relevance: 0.25 }`
    - Implement `computeCompositeScore(factors)` — pure function: `sum(factor × weight) × 20`
    - Implement `parseQualityResponse(raw)` — parses JSON, clamps each factor to [0, 10], returns defaults (all 5) on parse failure
    - Implement `buildQualityScorerPrompt(imageUrl, visualConcept)` — builds Reka Edge prompt for multi-factor assessment
    - Implement `scoreImageQuality(imageUrl, visualConcept, apiKey, options)` — single API call evaluating all 5 factors
    - Implement `batchScoreQuality(candidates, visualConcept, apiKey, options)` — parallel scoring with concurrency limit, top 5 only
    - Fall back to existing `scoreCandidate()` if Reka Edge is unavailable
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 4.11_

  - [ ]* 9.2 Write property test for quality factor clamping
    - **Property 8: Quality factor parsing clamps to valid range**
    - Generate arbitrary JSON values (objects, strings, null, undefined, arrays, malformed data) using fast-check
    - Assert `parseQualityResponse` returns `QualityFactors` where every factor is an integer in [0, 10]
    - Test file: `src/services/__tests__/qualityScorer.test.ts`
    - **Validates: Requirements 4.2, 4.3, 4.4, 4.5, 4.6**

  - [ ]* 9.3 Write property test for composite score formula
    - **Property 9: Composite quality score matches weighted formula**
    - Generate random `QualityFactors` with each factor in [0, 10] using fast-check
    - Assert `computeCompositeScore` returns `(sharpness × 0.25 + lighting × 0.20 + composition × 0.15 + vibrancy × 0.15 + relevance × 0.25) × 20`
    - Assert result is in [0, 200]
    - Test file: `src/services/__tests__/qualityScorer.test.ts`
    - **Validates: Requirements 4.7**

  - [ ]* 9.4 Write unit tests for quality scorer
    - Test API unavailable fallback
    - Test top-5 batch limit enforcement
    - Test prompt construction
    - Test file: `src/services/__tests__/qualityScorer.test.ts`
    - _Requirements: 4.9, 4.11_

- [x] 10. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Focal cropper
  - [x] 11.1 Implement `src/services/focalCropper.ts`
    - Export `ASPECT_RATIO_MIN = 1.6`, `ASPECT_RATIO_MAX = 1.9`, `TARGET_ASPECT_RATIO = 16 / 9`
    - Implement `needsCropping(width, height)` — returns `true` iff aspect ratio is outside [1.6, 1.9]
    - Implement `computeCropRect(imageWidth, imageHeight, focalPoint)` — pure function computing 16:9 crop centered on focal point, constrained within image bounds
    - Implement `computeCenterCrop(imageWidth, imageHeight)` — pure function for center-crop fallback
    - Implement `detectFocalPoint(imageUrl, apiKey, options)` — uses Reka Edge with 5s timeout, returns `FocalPoint | null`
    - Implement `focalCrop(imageUrl, imageWidth, imageHeight, apiKey, options)` — full pipeline: detect → compute crop, falls back to center-crop
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_

  - [ ]* 11.2 Write property test for aspect ratio threshold
    - **Property 6: Aspect ratio cropping threshold is correct**
    - Generate random positive integer pairs `(width, height)` using fast-check
    - Assert `needsCropping` returns `true` iff `width / height` is outside [1.6, 1.9]
    - Test file: `src/services/__tests__/focalCropper.test.ts`
    - **Validates: Requirements 3.1, 3.7**

  - [ ]* 11.3 Write property test for crop rectangle validity
    - **Property 7: Crop rectangle is valid 16:9 within image bounds**
    - Generate random dimensions `(width, height)` as positive integers and focal points `(x, y)` in [0, 1] using fast-check
    - Assert `crop.x ≥ 0`, `crop.y ≥ 0`, `crop.x + crop.width ≤ imageWidth`, `crop.y + crop.height ≤ imageHeight`
    - Assert `crop.width / crop.height ≈ 16/9` within ±0.01 tolerance
    - Assert `crop.width > 0` and `crop.height > 0`
    - Test file: `src/services/__tests__/focalCropper.test.ts`
    - **Validates: Requirements 3.2**

  - [ ]* 11.4 Write unit tests for focal cropper
    - Test center-crop fallback when vision model is unavailable
    - Test skip for images already in 16:9 range
    - Test 5s timeout enforcement on focal point detection
    - Test file: `src/services/__tests__/focalCropper.test.ts`
    - _Requirements: 3.6, 3.7, 3.8_

- [x] 12. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Harvester integration — wire everything into `src/services/media.ts`
  - [x] 13.1 Replace inline provider calls with `queryAllProviders()`
    - Modify `harvestMediaWithSafetyNet` to call `queryAllProviders()` from the provider registry instead of inline `searchDDGLocal`, `searchWikimedia`, `searchUnsplash`, `searchPicsum`, `searchDDGVideos` calls
    - Keep existing DDG and Wikimedia providers as part of the registry (they move into the parallel query)
    - Merge and deduplicate results using `deduplicateCandidates()`
    - _Requirements: 2.1, 2.7_

  - [x] 13.2 Insert resolution stage after initial scoring
    - After domain filtering and initial `scoreCandidate()` ranking, call `batchResolve()` on the top 10 candidates
    - Integrate `MediaCache` lookups before resolution (skip cached URLs)
    - Update candidate `url`, `width`, `height` with resolved values
    - Store resolved URLs in cache
    - _Requirements: 1.10, 1.11, 6.1, 6.2_

  - [x] 13.3 Insert quality scoring stage after resolution
    - After resolution, call `batchScoreQuality()` on the top 5 candidates
    - Add composite quality score (0–200) to each candidate's `finalScore`
    - Store quality factors on the `MediaCandidate` for later transfer to `MediaAsset`
    - Integrate `MediaCache` for vision check results
    - _Requirements: 4.9, 4.10, 6.3, 6.4_

  - [x] 13.4 Insert focal cropping after final selection
    - After selecting the best candidate for each shot, call `focalCrop()` on the selected asset
    - Store `cropMetadata` on the resulting `MediaAsset`
    - Skip cropping for assets already in 16:9 range
    - Transfer `qualityFactors`, `resolvedWidth`, `resolvedHeight`, `resolvedUrl` to `MediaAsset`
    - _Requirements: 3.1, 3.2, 3.5, 3.6, 3.7, 10.1, 10.2, 10.3, 10.4_

  - [x] 13.5 Implement video clip enhancement scoring
    - Add +50 score bonus for video clips classified as having motion
    - Add -200 penalty for clips with detected burned-in text or watermarks
    - Add -150 penalty for portrait-orientation clips (aspect ratio < 1.2:1)
    - Add +30 bonus for landscape clips with aspect ratio between 1.6:1 and 1.9:1
    - Use Reka Edge to classify video thumbnails when full video analysis is not feasible
    - Fall back to metadata-only scoring if Reka Edge is unavailable
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

  - [x] 13.6 Implement the structured fallback chain
    - When fewer than 2 candidates have `finalScore > 100`, broaden query by stripping adjectives/modifiers
    - If still insufficient, search related entities from `TopicContext`
    - If still insufficient, use Wikipedia hero image from `TopicContext.thumbnailUrl`
    - As last resort, use Picsum/Unsplash generic stock seeded by segment title, mark `isFallback: true`
    - Log fallback strategy in `MediaAsset.trace` array
    - Guarantee every segment has at least one `MediaAsset`
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_

  - [ ]* 13.7 Write property test for seeded stock variety
    - **Property 12: Seeded stock images vary by segment title**
    - Generate pairs of distinct non-empty segment title strings using fast-check
    - Assert the Picsum fallback URLs generated by seeding with each title are different
    - Test file: `src/services/__tests__/media.test.ts`
    - **Validates: Requirements 8.7**

  - [ ]* 13.8 Write unit tests for harvester integration
    - Test fallback chain stages (broaden → entities → wiki → stock)
    - Test progress message format at each stage
    - Test that every segment gets at least one MediaAsset
    - Test cancellation mid-pipeline (AbortSignal during resolution stage)
    - Test file: `src/services/__tests__/media.test.ts`
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 7.1, 7.2, 7.3, 7.4, 7.5_

- [x] 14. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 15. Progress reporting
  - [x] 15.1 Implement granular progress reporting in `src/services/media.ts`
    - Add `progressCallback` parameter to `sourceSegmentMedia` and `harvestMediaWithSafetyNet`
    - Emit "Searching N sources for '[query]'..." at search start (N = active provider count)
    - Emit "Found N candidates, filtering..." after all providers return
    - Emit "Resolving full-resolution for top N..." at resolution start
    - Emit "Vision-checking top N..." at quality scoring start
    - Emit "Selected: [source], [width]×[height]" after final selection
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [x] 15.2 Wire progress callbacks through `src/store.ts`
    - Pass `setProcessingMessage` and `setProcessingProgress` from the store's `sourceMedia` callback through to the harvester
    - Update numeric progress percentage smoothly across search (0–30%), resolve (30–50%), score (50–75%), select (75–100%) phases per segment
    - _Requirements: 7.6, 7.7_

- [x] 16. Settings UI
  - [x] 16.1 Add Pexels, Pixabay, and Flickr API key fields to `src/components/SettingsModal.tsx`
    - Add three new `<input type="password">` fields for Pexels, Pixabay, and Flickr API keys
    - Place alongside existing API key fields in the "Visual Harvesting" section
    - Add "Get Key" links to each provider's API key page
    - Wire values through the existing `appConfig` / `setAppConfig` flow
    - Persist keys through the existing secure storage mechanism (session storage with optional PIN-encrypted localStorage)
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

- [x] 17. Renderer integration
  - [x] 17.1 Apply crop metadata in `src/services/videoRenderer.ts`
    - When rendering a `MediaAsset` with `cropMetadata`, use `drawImage(img, crop.x, crop.y, crop.width, crop.height, 0, 0, canvasWidth, canvasHeight)` to apply the crop
    - When `cropMetadata` is absent, use the existing full-image draw behavior
    - _Requirements: 10.5_

  - [ ]* 17.2 Write unit test for renderer crop application
    - Test that `drawImage` is called with correct crop coordinates when `cropMetadata` is present
    - Test that existing behavior is preserved when `cropMetadata` is absent
    - Test file: `src/services/__tests__/videoRenderer.test.ts`
    - _Requirements: 10.5_

- [x] 18. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation after each major group
- Property tests validate the 12 universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- All new modules use the existing `fetchWithTimeout` utility for network calls with timeout and retry
- All new modules accept `AbortSignal` for cancellation support, matching the existing codebase pattern
- The `MediaCache` uses `localStorage` with prefix `atube_cache_` for persistent data and in-memory `Map` for session-scoped data
