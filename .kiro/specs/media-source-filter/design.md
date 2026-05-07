# Media Source Filter Bugfix Design

## Overview

The media harvesting pipeline in `src/services/media.ts` fetches image and video candidates from DuckDuckGo, Wikimedia Commons, and paid fallbacks (Serper, Firecrawl), but never checks whether a candidate's source domain is acceptable. This allows state propaganda outlets (Sputnik, RT), watermarked stock previews (Shutterstock, Getty), low-quality meme sites, and adult content domains to enter the scoring pool and potentially appear in generated videos.

The fix introduces a new `src/services/domainFilter.ts` module containing a categorized blocklist, an allowlist of trusted domains, and filtering/scoring functions. The harvester functions in `media.ts` will call the filter after collecting raw candidates and before scoring, rejecting blocked domains and applying a trust-based scoring adjustment for unknown domains. All rejections will be logged with the matched pattern and reason category.

## Glossary

- **Bug_Condition (C)**: A media candidate whose `sourceUrl` or `url` hostname matches a domain on the blocklist (propaganda, watermarked-stock, low-quality, or adult-content category)
- **Property (P)**: Blocked candidates are rejected before scoring; unknown-domain candidates receive a scoring penalty; all rejections are logged with URL, matched pattern, and reason category
- **Preservation**: Existing scoring logic, trusted-source bonuses, Wikimedia/Picsum/Unsplash fallback behavior, video candidate handling, and paid fallback behavior remain unchanged for non-blocked domains
- **`scoreCandidate`**: The function in `src/services/media.ts` that computes a relevance score for a `MediaCandidate` — currently awards bonuses for high-trust domains but never rejects blocked ones
- **`harvestMediaWithSafetyNet`**: The cascading harvester in `src/services/media.ts` that collects candidates from multiple sources, scores them, and returns sorted results
- **`MediaCandidate`**: The interface representing a raw image/video result with `url`, `sourceUrl`, `source`, `alt`, `baseScore`, and dimension fields
- **Domain pattern**: A string matched against a URL's hostname using `includes()` — e.g., `"sputniknews"` matches `sputniknews.com`, `cdn.sputniknews.com`, etc.

## Bug Details

### Bug Condition

The bug manifests when the media harvester returns candidates from DuckDuckGo (or paid fallbacks) whose source URL or image URL hostname belongs to a blocked domain category. The `scoreCandidate` function scores these candidates without any domain-level rejection, and `harvestMediaWithSafetyNet` may select them as top-scoring results.

**Formal Specification:**
```
FUNCTION isBugCondition(candidate)
  INPUT: candidate of type MediaCandidate
  OUTPUT: boolean

  sourceHost := extractHostname(candidate.sourceUrl) OR ""
  imageHost := extractHostname(candidate.url) OR ""

  RETURN domainMatchesBlocklist(sourceHost, BLOCKLIST)
         OR domainMatchesBlocklist(imageHost, BLOCKLIST)
END FUNCTION
```

Where `BLOCKLIST` is a map of category → domain patterns:
- **propaganda**: sputniknews, rt.com, presstv, cgtn, tass, xinhua, globalresearch
- **watermarked-stock**: shutterstock, gettyimages, istockphoto, 123rf, dreamstime, depositphotos, alamy
- **low-quality**: 9gag, imgur, memegenerator, knowyourmeme, ifunny, cheezburger, buzzfeed
- **adult-content**: pornhub, xvideos, xhamster, redtube, youporn

### Examples

- A DuckDuckGo result with `sourceUrl: "https://sputniknews.com/photo/12345"` → currently enters scoring pool and may be selected; should be rejected with log entry `{url, pattern: "sputniknews", category: "propaganda"}`
- A DuckDuckGo result with `url: "https://image.shutterstock.com/watermark/12345.jpg"` → currently enters scoring pool; should be rejected with log entry `{url, pattern: "shutterstock", category: "watermarked-stock"}`
- A DuckDuckGo result with `sourceUrl: "https://9gag.com/gag/12345"` → currently enters scoring pool; should be rejected with log entry `{url, pattern: "9gag", category: "low-quality"}`
- A DuckDuckGo result with `sourceUrl: "https://reuters.com/photo/12345"` → should continue to pass filtering and receive its existing high-trust bonus (unchanged behavior)

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Wikimedia Commons candidates continue to be included and scored normally (Wikimedia is on the allowlist)
- DuckDuckGo candidates from non-blocked legitimate news/editorial domains (reuters.com, apnews.com, bbc.co.uk) continue to receive their existing high-trust bonus
- Picsum/Unsplash fallback candidates continue to be generated and included normally (they have no external source domain)
- DuckDuckGo Video candidates from non-blocked domains continue to be included and scored normally
- All existing `scoreCandidate` logic (keyword relevance, resolution, aspect ratio, topic relevance, negative keyword filters, entertainment penalty, Picsum penalty, SVG penalty, small image penalty) remains unchanged
- Paid fallback sources (Serper, Firecrawl) continue to work for non-blocked domains
- The `usedUrlsMap` deduplication and visual variety logic remains unchanged

**Scope:**
All candidates whose `sourceUrl` and `url` hostnames do NOT match any blocklist pattern should be completely unaffected by this fix. This includes:
- Candidates from Wikimedia Commons (no external sourceUrl to block)
- Candidates from Picsum/Unsplash (synthetic URLs, no external domain)
- Candidates from trusted editorial sources (Reuters, AP, BBC, etc.)
- Candidates from any domain not on the blocklist

## Hypothesized Root Cause

Based on the bug description and code analysis, the root cause is straightforward:

1. **No domain filtering exists**: The `harvestMediaWithSafetyNet` function collects candidates from all sources and passes them directly to `scoreCandidate` without any domain-level filtering. There is no blocklist, no rejection logic, and no domain validation anywhere in the pipeline.

2. **Scoring rewards but never rejects**: The `scoreCandidate` function has a "Source Authority" section that awards bonus points to high-trust domains (Reuters, AP, Bloomberg, etc.) but has no mechanism to reject or heavily penalize unacceptable domains. A Sputnik image with good keyword relevance and resolution can outscore a legitimate source.

3. **No logging of source quality decisions**: The harvester logs candidate counts per source (`"Found N free images"`) but never logs anything about the quality or trustworthiness of the domains those images come from.

4. **Both URL fields need checking**: A candidate has both `url` (the direct image URL) and `sourceUrl` (the page the image was found on). A blocked domain could appear in either field — e.g., an image hosted on `cdn.rt.com` with a `sourceUrl` on a different aggregator.

## Correctness Properties

Property 1: Bug Condition - Blocked Domain Rejection

_For any_ media candidate where `isBugCondition(candidate)` returns true (i.e., the candidate's `sourceUrl` or `url` hostname matches a blocklist pattern), the filtering function SHALL remove that candidate from the results array, and the logger SHALL be called with the rejected URL, the matched blocklist pattern, and the reason category.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.6**

Property 2: Preservation - Non-Blocked Candidate Behavior

_For any_ media candidate where `isBugCondition(candidate)` returns false (i.e., neither the candidate's `sourceUrl` nor `url` hostname matches any blocklist pattern), the filtering function SHALL include that candidate in the results array with its original fields unchanged, and the `scoreCandidate` function SHALL produce the same score as before the fix (plus any trust-tier adjustment for unknown domains per Requirement 2.5, plus any resolution bonus per Requirement 5.1).

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**

Property 3: Resolution Scoring Monotonicity

_For any_ two media candidates that are identical except for resolution, the candidate with higher resolution SHALL receive a higher or equal resolution bonus. Specifically: 4K+ (≥3840×2160) → +200, 2K (≥2560×1440) → +100, 1080p (≥1920×1080) → +50, 720p (≥1280×720) → +0, below 720p → -100.

**Validates: Requirements 5.1, 5.3**

Property 4: Vision Check - Blocking Criteria Rejection

_For any_ media candidate that passes domain filtering, if the Reka Edge vision model returns `pass: false` with detected issues, the candidate SHALL be rejected from the final selection and the rejection SHALL be logged with the detected issues.

**Validates: Requirements 4.1, 4.2, 4.5**

Property 5: Vision Check - Graceful Degradation

_For any_ scenario where the OpenRouter API key is missing, the vision model call fails, or the call times out, the pipeline SHALL continue with domain-only filtering and resolution scoring — no candidates SHALL be lost due to vision check infrastructure failures.

**Validates: Requirements 4.7**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `src/services/domainFilter.ts` (NEW)

**Purpose**: Centralized domain filtering module with blocklist, allowlist, and filtering functions.

**Specific Changes**:

1. **Domain Blocklist Data Structure**: Define a `DOMAIN_BLOCKLIST` as a `Map<string, string[]>` mapping category names to arrays of domain pattern strings. Categories: `propaganda`, `watermarked-stock`, `low-quality`, `adult-content`.

2. **Domain Allowlist**: Define a `TRUSTED_DOMAINS` array of known high-quality domain patterns (reuters, apnews, bbc, bloomberg, nytimes, wsj, cnn, cnbc, forbes, getty editorial, wikimedia, unsplash, pexels) used for the trust-tier scoring adjustment.

3. **`extractHostname(url: string): string`**: Utility function that safely extracts the hostname from a URL string, returning empty string on failure.

4. **`isDomainBlocked(url: string): { blocked: boolean; pattern?: string; category?: string }`**: Checks a single URL against the blocklist. Returns the matched pattern and category if blocked.

5. **`filterCandidates(candidates: MediaCandidate[]): { accepted: MediaCandidate[]; rejected: Array<{ candidate: MediaCandidate; pattern: string; category: string }> }`**: Filters an array of candidates, checking both `sourceUrl` and `url` for each. Returns accepted candidates and rejected candidates with their match details.

6. **`getDomainTrustTier(url: string): 'trusted' | 'unknown'`**: Returns the trust tier for a candidate's domain, used by the scoring adjustment.

---

**File**: `src/services/visionCheck.ts` (NEW)

**Purpose**: Vision model quality inspection using Reka Edge via OpenRouter. Sends candidate images for physical inspection against blocking/go criteria.

**Specific Changes**:

1. **Blocking Criteria List**: Define `VISION_BLOCKING_CRITERIA` — the list of issues that cause immediate rejection: visible watermarks, state media branding/logos, meme text overlays, adult/graphic content, extreme low quality/compression, social media screenshots, AI-generated artifacts.

2. **Go Criteria List**: Define `VISION_GO_CRITERIA` — positive signals that boost scoring: professional editorial photography, high resolution/sharp detail, relevant subject matter, clean backgrounds, official/institutional imagery, news wire quality.

3. **`buildVisionCheckPrompt(imageUrl: string): { system: string; user: Array<...> }`**: Builds the prompt for Reka Edge. System prompt instructs the model to evaluate the image against the blocking and go criteria. Requests structured JSON response with `pass`, `confidence`, `issues`, `quality_signals`, and `quality_score`.

4. **`checkCandidateVision(imageUrl: string, apiKey: string, options?: { signal?: AbortSignal }): Promise<VisionCheckResult | null>`**: Sends a single image to Reka Edge via OpenRouter. Uses `fetchWithTimeout` with 15s timeout and 1 retry. Returns parsed `VisionCheckResult` on success, `null` on failure (non-throwing). Model: `rekaai/reka-edge`.

5. **`batchVisionCheck(candidates: MediaCandidate[], apiKey: string, options?: { signal?: AbortSignal; concurrency?: number }): Promise<Map<string, VisionCheckResult>>`**: Runs vision checks on up to `concurrency` (default 3) candidates concurrently using `Promise.allSettled`. Returns a map of candidate URL → result.

6. **`VisionCheckResult` interface**: `{ pass: boolean; confidence: number; issues: string[]; qualitySignals: string[]; qualityScore: number }`.

---

**File**: `src/services/media.ts` — Resolution Scoring

**Function**: `scoreCandidate`

**Additional Changes for Resolution Scoring**:

1. **Resolution bonus calculation**: After existing dimension checks, compute resolution bonus based on candidate dimensions:
   - `width >= 3840 && height >= 2160` → +200 (4K+)
   - `width >= 2560 && height >= 1440` → +100 (2K/1440p)
   - `width >= 1920 && height >= 1080` → +50 (1080p)
   - `width >= 1280 && height >= 720` → +0 (720p baseline)
   - `width < 1280 || height < 720` → -100 (below 720p penalty)
   - Unknown dimensions (width/height undefined) → +0 (no bonus or penalty)

2. **Search query enhancement**: In `searchDDGLocal`, append "high resolution" or "4K" to the search query string to bias results toward higher-resolution assets.

---

**File**: `src/services/media.ts` — Vision Check Integration

**Function**: `harvestMediaWithSafetyNet`

**Additional Changes for Vision Check Integration**:

1. **Import `batchVisionCheck`** from `./visionCheck`.

2. **After domain filtering and scoring, before final selection**: Take the top N candidates (e.g., top 5 per segment) and run `batchVisionCheck` on them if an API key is available.

3. **Apply vision results**: For candidates that fail the vision check (`pass: false`), remove them from the pool. For candidates that pass, add `qualityScore * 20` (scaled to 0-200) as a bonus to their score.

4. **Graceful degradation**: If no API key is configured or all vision checks fail, skip the vision step entirely and use domain-filtered + resolution-scored results as-is.

---

**File**: `src/services/media.ts` — Wikimedia 4K

**Function**: `searchWikimedia`

**Specific Changes for 4K Resolution**:

1. **Request highest resolution**: When constructing Wikimedia API URLs, set `thumbwidth=3840` to request the highest available resolution version of each image.

---

**File**: `src/services/media.ts`

**Function**: `harvestMediaWithSafetyNet`

**Specific Changes**:

1. **Import `filterCandidates`** from `./domainFilter`.

2. **Apply filtering after candidate collection, before scoring**: After `candidates = results.flat()` (and after the paid fallback append), call `filterCandidates(candidates)` to split into accepted and rejected arrays.

3. **Log rejections**: For each rejected candidate, call `logger.warn('DomainFilter', ...)` with the URL, matched pattern, and category.

4. **Score only accepted candidates**: Pass only the accepted array to the scoring loop.

---

**File**: `src/services/media.ts`

**Function**: `scoreCandidate`

**Specific Changes**:

1. **Import `getDomainTrustTier`** from `./domainFilter`.

2. **Add trust-tier scoring adjustment**: After the existing "Source Authority" section, check `getDomainTrustTier(c.sourceUrl || c.url)`. If the tier is `'unknown'` (not on the trusted list and not a known source like Wikimedia/Picsum), apply a penalty (e.g., `-50`) so that trusted editorial sources are preferred over unknown domains.

3. **Preserve all existing scoring logic**: The trust-tier adjustment is additive — it does not replace or modify any existing score calculations.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Create `MediaCandidate` objects with `sourceUrl` values from blocked domains (sputniknews.com, shutterstock.com, 9gag.com) and pass them through `scoreCandidate` and the harvester pipeline. Observe that they are scored and potentially selected without any rejection.

**Test Cases**:
1. **Propaganda Domain Test**: Create a candidate with `sourceUrl: "https://sputniknews.com/photo/123"` and verify it enters the scoring pool (will pass on unfixed code — demonstrates the bug)
2. **Watermarked Stock Test**: Create a candidate with `url: "https://image.shutterstock.com/watermark/123.jpg"` and verify it enters the scoring pool (will pass on unfixed code)
3. **Low-Quality Domain Test**: Create a candidate with `sourceUrl: "https://9gag.com/gag/123"` and verify it enters the scoring pool (will pass on unfixed code)
4. **Image URL vs Source URL Test**: Create a candidate with a clean `sourceUrl` but a blocked `url` hostname and verify it still enters the scoring pool (will pass on unfixed code)

**Expected Counterexamples**:
- All blocked-domain candidates are scored and returned in the results array
- No log entries are generated for domain-level quality issues
- Possible cause: complete absence of domain filtering logic

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL candidate WHERE isBugCondition(candidate) DO
  result := filterCandidates([candidate])
  ASSERT result.accepted.length == 0
  ASSERT result.rejected.length == 1
  ASSERT result.rejected[0].pattern IS NOT EMPTY
  ASSERT result.rejected[0].category IN ['propaganda', 'watermarked-stock', 'low-quality', 'adult-content']
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL candidate WHERE NOT isBugCondition(candidate) DO
  ASSERT filterCandidates([candidate]).accepted.length == 1
  ASSERT filterCandidates([candidate]).accepted[0] DEEP_EQUALS candidate
  
  // Score preservation (modulo the trust-tier adjustment)
  originalScore := scoreCandidate_original(candidate, topicContext, visualConcept, sourceType)
  fixedScore := scoreCandidate_fixed(candidate, topicContext, visualConcept, sourceType)
  trustAdjustment := getDomainTrustTier(candidate.sourceUrl || candidate.url) == 'unknown' ? -50 : 0
  ASSERT fixedScore == originalScore + trustAdjustment
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain (random URLs, random domain patterns, random candidate fields)
- It catches edge cases that manual unit tests might miss (e.g., URLs with unusual formats, empty strings, missing fields)
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for non-blocked domain candidates, then write property-based tests capturing that behavior.

**Test Cases**:
1. **Trusted Domain Preservation**: Verify candidates from reuters.com, apnews.com, bbc.co.uk pass filtering unchanged and retain their existing high-trust scoring bonus
2. **Wikimedia Preservation**: Verify Wikimedia Commons candidates pass filtering unchanged and retain their existing scoring
3. **Picsum/Unsplash Preservation**: Verify fallback candidates with synthetic URLs pass filtering unchanged
4. **Score Consistency Preservation**: Verify that for non-blocked candidates, all existing scoring factors (keyword relevance, resolution, aspect ratio, topic relevance, negative keywords) produce identical results

### Unit Tests

- Test `extractHostname` with valid URLs, invalid URLs, empty strings, and URLs without protocol
- Test `isDomainBlocked` for each blocklist category (propaganda, watermarked-stock, low-quality, adult-content)
- Test `isDomainBlocked` returns `{ blocked: false }` for trusted and unknown domains
- Test `filterCandidates` correctly splits an array into accepted and rejected
- Test `filterCandidates` checks both `sourceUrl` and `url` fields
- Test `getDomainTrustTier` returns `'trusted'` for allowlisted domains and `'unknown'` for others
- Test that the trust-tier scoring penalty is applied correctly in `scoreCandidate`
- Test `buildVisionCheckPrompt` includes all blocking and go criteria in the prompt
- Test `checkCandidateVision` returns null on API failure (non-throwing)
- Test `checkCandidateVision` parses valid Reka Edge responses correctly
- Test `batchVisionCheck` respects concurrency limit
- Test `batchVisionCheck` returns partial results when some checks fail
- Test resolution bonus calculation: 4K → +200, 2K → +100, 1080p → +50, 720p → +0, below 720p → -100
- Test resolution bonus returns 0 for unknown dimensions

### Property-Based Tests

- Generate random `MediaCandidate` objects with random domain strings and verify: if any domain matches the blocklist, the candidate is rejected; otherwise it is accepted (Property 1)
- Generate random non-blocked `MediaCandidate` objects and verify `filterCandidates` returns them unchanged with all fields preserved (Property 2)
- Generate random `MediaCandidate` objects with trusted-domain URLs and verify `scoreCandidate` produces the same score as before the fix (no trust-tier penalty applied)
- Generate random `MediaCandidate` objects with unknown-domain URLs and verify the trust-tier penalty is exactly the expected value

### Integration Tests

- Test the full `harvestMediaWithSafetyNet` flow with mocked source functions returning a mix of blocked and non-blocked candidates, verifying only non-blocked candidates appear in the final sorted results
- Test that `sourceSegmentMedia` produces assets only from non-blocked domains when the underlying harvesters return mixed results
- Test that rejection logging is called with correct parameters for each blocked candidate in a realistic harvesting scenario
- Test that vision check is called for top candidates when API key is available
- Test that vision-rejected candidates are removed from final results
- Test that vision check failure (API error/timeout) falls back gracefully to domain-only filtering
- Test that 4K candidates score higher than 1080p candidates with otherwise identical attributes
- Test that Wikimedia API requests use `thumbwidth=3840` for maximum resolution
