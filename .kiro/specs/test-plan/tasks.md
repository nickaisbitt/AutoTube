# Test Plan Tasks

## Task List

- [x] 1 Set up Vitest and test infrastructure
  - [x] 1.1 Install Vitest, jsdom, and testing-library dev dependencies
  - [x] 1.2 Create `vitest.config.ts` at project root
  - [x] 1.3 Create `src/test-setup.ts` with global cleanup and mock restore
  - [x] 1.4 Add `test:unit`, `test:unit:watch`, and `test:unit:coverage` scripts to `package.json`
  - [x] 1.5 Verify Vitest runs with zero tests and exits cleanly

- [x] 2 Export internal functions for unit testing
  - [x] 2.1 Export `parseSegmentsFromContent` and `validateSegment` from `src/services/llm.ts` with `@internal` JSDoc
  - [x] 2.2 Export `scoreCandidate` from `src/services/media.ts` with `@internal` JSDoc
  - [x] 2.3 Export `buildImageSources` from `src/services/videoRenderer.ts` with `@internal` JSDoc
  - [x] 2.4 Export `validateVisualPlan` and `validateShot` from `src/services/llmVisualDirector.ts` with `@internal` JSDoc

- [x] 3 Write unit tests for `llm.ts`
  - [x] 3.1 Create `src/services/__tests__/llm.test.ts`
  - [x] 3.2 Test `parseSegmentsFromContent` with bare JSON array input
  - [x] 3.3 Test `parseSegmentsFromContent` with markdown-fenced JSON input
  - [x] 3.4 Test `parseSegmentsFromContent` with `{"segments":[...]}` wrapped input
  - [x] 3.5 Test `parseSegmentsFromContent` with JSON embedded in prose
  - [x] 3.6 Test `parseSegmentsFromContent` throws on empty array
  - [x] 3.7 Test `parseSegmentsFromContent` throws on non-JSON string
  - [x] 3.8 Test `validateSegment` applies `'section'` default for unknown type
  - [x] 3.9 Test `validateSegment` applies `10` default for negative duration
  - [x] 3.10 Test `validateSegment` applies `10` default for zero duration
  - [x] 3.11 Test `validateSegment` applies title-based default for empty narration
  - [x] 3.12 Test `validateSegment` applies `'Segment N'` default for empty title
  - [x] 3.13 Test `validateSegment` preserves all fields when input is fully valid
  - [x] 3.14 Test `generateAIScript` retries on 429 and succeeds on second attempt (mocked fetch)
  - [x] 3.15 Test `generateAIScript` throws after exhausting all retries on 500 (mocked fetch)

- [-] 4 Write unit tests for `media.ts`
  - [x] 4.1 Create `src/services/__tests__/media.test.ts`
  - [x] 4.2 Test `scoreCandidate` gives +100 bonus for high-trust source URL (reuters.com)
  - [x] 4.3 Test `scoreCandidate` applies −150 penalty for portrait-ratio image (ratio < 0.9)
  - [x] 4.4 Test `scoreCandidate` gives +30 ratio bonus and +40 pixel bonus for 1920×1080 image
  - [x] 4.5 Test `scoreCandidate` gives Pexels stock bonus (+120) in stock source mode
  - [x] 4.6 Test `scoreCandidate` gives +25 per matching query keyword found in alt text
  - [x] 4.7 Test `scoreCandidate` gives +90 video bonus in stock source mode
  - [x] 4.8 Test `scoreCandidate` gives +120 Wikimedia bonus in raw source mode
  - [x] 4.9 Test `searchDDGLocal` returns empty array when fetch returns 404
  - [x] 4.10 Test `searchDDGLocal` returns empty array when fetch throws
  - [x] 4.11 Test `searchWikimedia` returns empty array when fetch returns 500
  - [x] 4.12 Test `searchWikimedia` returns empty array when response has no `query.pages`

- [x] 5 Write unit tests for `visualPlanner.ts`
  - [x] 5.1 Create `src/services/__tests__/visualPlanner.test.ts`
  - [x] 5.2 Test `extractCapitalizedEntities` returns single proper noun from simple sentence
  - [x] 5.3 Test `extractCapitalizedEntities` returns multi-word proper noun (e.g. "Jensen Huang")
  - [x] 5.4 Test `extractCapitalizedEntities` excludes common stop words (`The`, `This`, `And`)
  - [x] 5.5 Test `extractCapitalizedEntities` returns empty array for empty string input
  - [x] 5.6 Test `extractCapitalizedEntities` returns multiple entities from mixed sentence
  - [x] 5.7 Test `planSegmentVisuals` returns `beat: 'data'` for narration containing revenue keywords
  - [x] 5.8 Test `planSegmentVisuals` returns `beat: 'hook'` for narration containing welcome/intro keywords
  - [x] 5.9 Test `planSegmentVisuals` returns `beat: 'quote'` for narration with quoted speech pattern
  - [x] 5.10 Test `planSegmentVisuals` returns a plan with at least one shot when called without an API key

- [x] 6 Write unit tests for `llmVisualDirector.ts`
  - [x] 6.1 Create `src/services/__tests__/llmVisualDirector.test.ts`
  - [x] 6.2 Test `validateVisualPlan` returns fallback plan for null input
  - [x] 6.3 Test `validateVisualPlan` returns fallback plan for non-object input
  - [x] 6.4 Test `validateVisualPlan` uses `'Establish visual context'` as default intent
  - [x] 6.5 Test `validateVisualPlan` preserves all fields from a fully valid input object
  - [x] 6.6 Test `validateVisualPlan` excludes null shots from the shots array
  - [x] 6.7 Test `validateShot` returns null for null input
  - [x] 6.8 Test `validateShot` returns null when concept field is missing
  - [x] 6.9 Test `validateShot` returns a valid shot object for fully valid input
  - [x] 6.10 Test `validateShot` returns shot with empty queries array when queries is empty

- [x] 7 Write unit tests for `chapters.ts`
  - [x] 7.1 Create `src/services/__tests__/chapters.test.ts`
  - [x] 7.2 Test `generateChapterMarkers` formats single segment starting at `00:00`
  - [x] 7.3 Test `generateChapterMarkers` produces correct cumulative timestamps for multiple segments
  - [x] 7.4 Test `generateChapterMarkers` uses `HH:MM:SS` format when total duration exceeds 3600 seconds
  - [x] 7.5 Test `generateChapterMarkers` uses `MM:SS` format for durations under 3600 seconds
  - [x] 7.6 Test `generateDetailedChapters` includes type emoji in each chapter line

- [x] 8 Write unit tests for `videoRenderer.ts`
  - [x] 8.1 Create `src/services/__tests__/videoRenderer.test.ts`
  - [x] 8.2 Test `getSupportedMimeType` returns `video/webm;codecs=vp9` when it is supported
  - [x] 8.3 Test `getSupportedMimeType` falls back to `video/webm` when no codec variant is supported
  - [x] 8.4 Test `getSupportedMimeType` returns `video/webm` as last resort when nothing is supported
  - [x] 8.5 Test `getSupportedMimeType` returns mp4 MIME type when format is `'mp4'` and avc1 is supported
  - [x] 8.6 Test `buildImageSources` returns local proxy URL as first source for external HTTPS URL
  - [x] 8.7 Test `buildImageSources` returns weserv.nl URL as second source
  - [x] 8.8 Test `buildImageSources` returns the direct URL as third source
  - [x] 8.9 Test `buildImageSources` returns 5 sources total for an external HTTPS URL
  - [x] 8.10 Test `buildImageSources` returns the URL as-is for a relative path

- [x] 9 Write unit tests for `tts.ts`
  - [x] 9.1 Create `src/services/__tests__/tts.test.ts`
  - [x] 9.2 Test `generateOpenAITTS` returns null immediately when apiKey is empty string
  - [x] 9.3 Test `generateOpenAITTS` returns null when API responds with 401
  - [x] 9.4 Test `generateOpenAITTS` returns a blob URL string when API responds with a valid blob
  - [x] 9.5 Test `generateOpenAITTS` returns null when fetch throws a network error

- [x] 10 Improve existing E2E tests
  - [x] 10.1 Add a Playwright test in `tests/app.spec.ts` that intercepts the OpenRouter endpoint and returns a 500, verifying the UI shows a fallback script (template mode)
  - [x] 10.2 Add a Playwright test in `tests/e2e.spec.ts` that uses `page.route()` to return a fixture OpenRouter response, making the full pipeline test run without a real API key
  - [x] 10.3 Verify all existing Playwright tests still pass after the export changes in task 2

- [x] 11 Verify and document
  - [x] 11.1 Run `npm run test:unit` and confirm all unit tests pass
  - [x] 11.2 Run `npm test` and confirm all existing Playwright tests still pass
  - [x] 11.3 Run `npm run test:unit:coverage` and confirm service coverage is reported
