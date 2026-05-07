# Bugfix Requirements Document

## Introduction

AutoTube's test suite consists entirely of Playwright E2E smoke tests that drive the browser UI. While these tests verify that the app renders and navigates correctly, they do not exercise the pure-logic functions inside the service layer in isolation. As a result, a regression in any of the following critical functions would ship undetected:

- `parseSegmentsFromContent()` in `llm.ts` — parses raw AI JSON into validated `ScriptSegment[]`
- `validateSegment()` in `llm.ts` — coerces and validates individual segment fields
- `scoreCandidate()` in `media.ts` — ranks media candidates by relevance and source authority
- `extractCapitalizedEntities()` in `visualPlanner.ts` — extracts named entities from narration text
- `detectBeat()` (via `planSegmentVisuals`) in `visualPlanner.ts` — classifies narration into narrative beats
- `generateChapterMarkers()` / `formatTimestamp()` in `chapters.ts` — formats YouTube chapter strings
- `validateVisualPlan()` / `validateShot()` in `llmVisualDirector.ts` — validates AI visual plan responses
- `getSupportedMimeType()` in `videoRenderer.ts` — selects the correct video MIME type
- CORS fallback chain in `videoRenderer.ts` — `buildImageSources()` ordering
- Retry logic in `llm.ts`, `tts.ts`, and `llmVisualDirector.ts` — exponential backoff on 429/5xx

The bug condition is: **the test suite does not contain unit tests for service-layer functions**. Any input that exercises a code path inside these functions is a "buggy input" in the sense that the test suite cannot detect whether the function behaves correctly or not.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN `parseSegmentsFromContent()` receives malformed JSON (e.g. markdown-fenced, wrapped in `{"segments":[...]}`, or a bare array) THEN the test suite does not detect whether the function parses it correctly or throws

1.2 WHEN `validateSegment()` receives a segment object with missing or invalid fields (e.g. `type` not in the valid set, negative `duration`, empty `narration`) THEN the test suite does not detect whether the function applies correct fallback defaults

1.3 WHEN `scoreCandidate()` is called with a candidate from a high-trust source (Reuters, Getty) or with a portrait-ratio image THEN the test suite does not detect whether the scoring logic returns the expected relative ranking

1.4 WHEN `extractCapitalizedEntities()` is called with narration text containing proper nouns, stop words, or short tokens THEN the test suite does not detect whether the function returns the correct entity set

1.5 WHEN `generateChapterMarkers()` is called with segments whose cumulative duration crosses hour boundaries THEN the test suite does not detect whether `formatTimestamp()` produces correct `HH:MM:SS` vs `MM:SS` output

1.6 WHEN `validateVisualPlan()` receives a malformed or null AI response THEN the test suite does not detect whether the function returns a safe fallback plan

1.7 WHEN `getSupportedMimeType()` is called in an environment where `video/webm;codecs=vp9` is not supported THEN the test suite does not detect whether the function falls back to the next supported type

1.8 WHEN `fetchWithRetry()` in `llm.ts` or `tts.ts` receives a 429 or 5xx response THEN the test suite does not detect whether the retry logic backs off correctly and eventually throws after exhausting attempts

1.9 WHEN the media harvester's CORS fallback chain in `buildImageSources()` is called with an external URL THEN the test suite does not detect whether the proxy sources are ordered correctly (local proxy → weserv.nl → direct → allorigins → corsproxy)

1.10 WHEN external API calls to Wikipedia, DuckDuckGo, Wikimedia, or Pexels fail or return unexpected shapes THEN the test suite does not detect whether the harvester gracefully returns an empty array instead of throwing

### Expected Behavior (Correct)

2.1 WHEN `parseSegmentsFromContent()` receives malformed JSON THEN the system SHALL parse it correctly (stripping fences, unwrapping `segments` key, extracting embedded arrays) and return a non-empty `ScriptSegment[]`, or throw a descriptive error if no JSON is recoverable

2.2 WHEN `validateSegment()` receives a segment with missing or invalid fields THEN the system SHALL apply correct fallback defaults: `type` defaults to `'section'`, `duration` defaults to `10`, `narration` defaults to `"${title}."`, `visualNote` defaults to `'Relevant B-roll footage'`

2.3 WHEN `scoreCandidate()` is called with candidates from different sources THEN the system SHALL return scores that correctly rank high-trust sources (Reuters/Getty +100) above generic sources, and penalise portrait-ratio images (ratio < 0.9, −150 points)

2.4 WHEN `extractCapitalizedEntities()` is called with narration text THEN the system SHALL return proper nouns of length ≥ 3 while excluding common stop words (`The`, `This`, `And`, etc.) and single-word articles

2.5 WHEN `generateChapterMarkers()` is called with segments whose cumulative duration exceeds 3600 seconds THEN the system SHALL format timestamps as `HH:MM:SS`; for durations under 3600 seconds it SHALL use `MM:SS`

2.6 WHEN `validateVisualPlan()` receives a null, non-object, or structurally invalid AI response THEN the system SHALL return a safe fallback plan with `intent: 'Establish visual context'` and `queries: [fallbackTopic]`

2.7 WHEN `getSupportedMimeType()` is called THEN the system SHALL return the first MIME type from the candidate list that `MediaRecorder.isTypeSupported()` accepts, falling back to `'video/webm'` if none match

2.8 WHEN `fetchWithRetry()` receives a 429 or 5xx response THEN the system SHALL retry up to `maxRetries` times with exponential backoff (1s, 2s, 4s capped at 10s) and throw the last error after all attempts are exhausted

2.9 WHEN `buildImageSources()` is called with an external HTTPS URL THEN the system SHALL return sources in the order: local dev proxy → weserv.nl → direct URL → allorigins.win → corsproxy.io

2.10 WHEN any external API call in the media harvester throws or returns a non-OK response THEN the system SHALL return an empty array without propagating the exception to the caller

### Unchanged Behavior (Regression Prevention)

3.1 WHEN `parseSegmentsFromContent()` receives a valid bare JSON array of segments THEN the system SHALL CONTINUE TO parse it into a `ScriptSegment[]` without modification

3.2 WHEN `validateSegment()` receives a fully valid segment object THEN the system SHALL CONTINUE TO return it with all original field values preserved (no unnecessary coercion)

3.3 WHEN `scoreCandidate()` is called with a Pexels stock candidate in `stock` source mode THEN the system SHALL CONTINUE TO apply the +120 Pexels stock bonus on top of the base score

3.4 WHEN `generateChapterMarkers()` is called with a standard set of segments under 60 minutes THEN the system SHALL CONTINUE TO produce correctly formatted `MM:SS` timestamps with one chapter per segment

3.5 WHEN the existing Playwright E2E tests in `tests/app.spec.ts`, `tests/e2e.spec.ts`, and `tests/user-journey.spec.ts` are run THEN the system SHALL CONTINUE TO pass all tests that currently pass

3.6 WHEN `generateAIScript()` is called with a valid API key and the OpenRouter API returns a well-formed response THEN the system SHALL CONTINUE TO return a validated `ScriptSegment[]` with at least one segment

3.7 WHEN `planSegmentVisuals()` is called without an OpenRouter key THEN the system SHALL CONTINUE TO return a fallback `SegmentVisualPlan` using the rule-based beat detection and query generation path

3.8 WHEN `sourceSegmentMedia()` is called and all external sources return empty results THEN the system SHALL CONTINUE TO fall back to the Wikipedia thumbnail URL if one is available in `topicContext`
