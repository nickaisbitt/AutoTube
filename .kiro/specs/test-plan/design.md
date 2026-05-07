# Test Plan Design Document

## Overview

This document describes the technical design for adding a comprehensive unit test suite to AutoTube. The goal is to make the service layer's pure-logic functions verifiable in isolation, without a browser, a running dev server, or any real API keys.

The approach is:
1. Add **Vitest** as the unit test runner (it shares Vite's config, requires zero extra bundler setup, and runs in Node with `jsdom` for any DOM-touching code).
2. Write unit tests for every critical service function identified in the bugfix requirements.
3. Use **inline mocks** (`vi.fn()`, `vi.stubGlobal()`) to replace `fetch` and browser APIs so tests are hermetic.
4. Keep the existing Playwright E2E tests untouched and continue running them via `npm test`.

---

## Technical Context

### Project Stack

| Layer | Technology |
|---|---|
| Framework | React 19 + TypeScript + Vite 7 |
| Bundler | Vite (ESM, `"type": "module"`) |
| Existing tests | Playwright (`@playwright/test`) — E2E only |
| Proposed unit runner | Vitest (native Vite integration) |
| Test environment | `jsdom` for DOM APIs, `node` for pure logic |

### Why Vitest

- Zero config: Vitest reads `vite.config.ts` directly, so path aliases (`@/`) and TypeScript work out of the box.
- Fast: runs in the same process as Vite's transform pipeline; no separate Babel/tsc step.
- Compatible: `vi.fn()` / `vi.spyOn()` / `vi.stubGlobal()` cover all mocking needs.
- No conflict with Playwright: Vitest uses a separate `vitest.config.ts` and a different `test` script name (`test:unit`).

### Functions Under Test

| File | Function | Test type |
|---|---|---|
| `src/services/llm.ts` | `parseSegmentsFromContent` (exported for testing) | Unit |
| `src/services/llm.ts` | `validateSegment` (exported for testing) | Unit |
| `src/services/llm.ts` | `fetchWithRetry` (via `generateAIScript` mock) | Unit |
| `src/services/media.ts` | `scoreCandidate` (exported for testing) | Unit |
| `src/services/media.ts` | `searchDDGLocal` error path | Unit |
| `src/services/media.ts` | `searchWikimedia` error path | Unit |
| `src/services/visualPlanner.ts` | `extractCapitalizedEntities` | Unit |
| `src/services/visualPlanner.ts` | `planSegmentVisuals` (fallback path) | Unit |
| `src/services/llmVisualDirector.ts` | `validateVisualPlan` (exported for testing) | Unit |
| `src/services/llmVisualDirector.ts` | `validateShot` (exported for testing) | Unit |
| `src/services/chapters.ts` | `generateChapterMarkers` | Unit |
| `src/services/chapters.ts` | `generateDetailedChapters` | Unit |
| `src/services/videoRenderer.ts` | `getSupportedMimeType` | Unit |
| `src/services/videoRenderer.ts` | `buildImageSources` (exported for testing) | Unit |
| `src/services/tts.ts` | `generateOpenAITTS` error/null paths | Unit |

### Functions That Require Export Changes

Several functions are currently unexported. To make them unit-testable without restructuring the modules, they will be exported with a `/* @internal */` JSDoc tag to signal they are not part of the public API:

- `parseSegmentsFromContent` in `llm.ts`
- `validateSegment` in `llm.ts`
- `scoreCandidate` in `media.ts`
- `buildImageSources` in `videoRenderer.ts`
- `validateVisualPlan` in `llmVisualDirector.ts`
- `validateShot` in `llmVisualDirector.ts`

---

## Mock Strategy

### Mocking `fetch`

All service functions that call `fetch` will be tested with `vi.stubGlobal('fetch', vi.fn())`. Each test sets up the mock to return a specific `Response`-like object:

```typescript
vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
  ok: true,
  status: 200,
  json: async () => ({ choices: [{ message: { content: '[]' } }] }),
  text: async () => '',
}));
```

For error scenarios, the mock returns `{ ok: false, status: 429 }` or rejects entirely.

### Mocking `MediaRecorder`

`getSupportedMimeType` calls `MediaRecorder.isTypeSupported()`. In the jsdom environment this API does not exist. Tests will stub it:

```typescript
vi.stubGlobal('MediaRecorder', {
  isTypeSupported: (type: string) => type === 'video/webm',
});
```

### Mocking `logger`

The `logger` service writes to a shared log store. Tests will mock it to prevent side effects:

```typescript
vi.mock('../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), success: vi.fn() },
}));
```

### No Real Network Calls

All tests run with `fetch` stubbed. No test will make a real HTTP request to Wikipedia, DuckDuckGo, OpenRouter, OpenAI, or Pexels.

---

## Test File Structure

```
src/
  services/
    __tests__/
      llm.test.ts
      media.test.ts
      visualPlanner.test.ts
      llmVisualDirector.test.ts
      chapters.test.ts
      videoRenderer.test.ts
      tts.test.ts
```

All test files live next to the source they test, inside a `__tests__` directory, following the Vitest convention.

---

## Vitest Configuration

A new `vitest.config.ts` at the project root:

```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/services/**/*.ts'],
    },
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
});
```

A minimal `src/test-setup.ts`:

```typescript
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
```

---

## Package Changes

New dev dependencies (pinned versions):

```json
{
  "vitest": "2.1.8",
  "@vitest/coverage-v8": "2.1.8",
  "jsdom": "25.0.1",
  "@testing-library/react": "16.1.0",
  "@testing-library/jest-dom": "6.6.3"
}
```

New npm scripts:

```json
{
  "test:unit": "vitest run",
  "test:unit:watch": "vitest",
  "test:unit:coverage": "vitest run --coverage"
}
```

The existing `"test": "playwright test"` script is unchanged.

---

## Test Design Per Service

### `llm.test.ts`

**`parseSegmentsFromContent`**

| Scenario | Input | Expected |
|---|---|---|
| Bare JSON array | `'[{"type":"intro","title":"T","narration":"N","visualNote":"V","duration":10}]'` | Array of 1 validated segment |
| Markdown-fenced JSON | `` ```json\n[...]\n``` `` | Same as bare array |
| Wrapped in `{"segments":[...]}` | `'{"segments":[...]}'` | Unwrapped array |
| Embedded array in prose | `'Here is the script: [{"type":"intro",...}]'` | Extracted and parsed |
| Empty array | `'[]'` | Throws `'AI returned an empty segments array'` |
| No JSON at all | `'Sorry, I cannot help.'` | Throws `'AI returned no parseable JSON'` |

**`validateSegment`**

| Scenario | Input field | Expected output |
|---|---|---|
| Invalid type | `type: 'unknown'` | `type: 'section'` |
| Negative duration | `duration: -5` | `duration: 10` |
| Zero duration | `duration: 0` | `duration: 10` |
| Empty narration | `narration: ''` | `narration: 'Title.'` |
| Empty title | `title: ''` | `title: 'Segment 1'` |
| All valid | Full valid object | All fields preserved |

**`fetchWithRetry` (via `generateAIScript`)**

| Scenario | Mock behaviour | Expected |
|---|---|---|
| 429 on first attempt, 200 on second | fetch returns 429 then 200 | Resolves with parsed segments |
| 500 on all attempts | fetch always returns 500 | Throws after `maxRetries` |
| Network error on all attempts | fetch always rejects | Throws last error |

### `media.test.ts`

**`scoreCandidate`**

| Scenario | Candidate properties | Expected score delta |
|---|---|---|
| High-trust source URL (reuters.com) | `sourceUrl: 'https://reuters.com/...'` | +100 vs baseline |
| Portrait ratio image | `width: 400, height: 800` | −150 vs baseline |
| Landscape HD image | `width: 1920, height: 1080` | +30 (ratio) + 40 (pixels) |
| Pexels in stock mode | `source: 'Pexels Stock'`, `sourceType: 'stock'` | +30 + 120 vs baseline |
| Query keyword in alt text | `alt: 'nvidia chip'`, `query: 'nvidia'` | +25 vs baseline |
| Video type in stock mode | `type: 'video'`, `sourceType: 'stock'` | +90 vs baseline |

**Error paths**

| Scenario | Mock | Expected |
|---|---|---|
| `searchDDGLocal` — fetch returns 404 | `fetch` → `{ ok: false, status: 404 }` | Returns `[]` |
| `searchDDGLocal` — fetch throws | `fetch` rejects | Returns `[]` |
| `searchWikimedia` — fetch returns 500 | `fetch` → `{ ok: false, status: 500 }` | Returns `[]` |
| `searchWikimedia` — malformed response | `fetch` → `{ ok: true, json: () => ({}) }` | Returns `[]` |

### `visualPlanner.test.ts`

**`extractCapitalizedEntities`**

| Scenario | Input | Expected |
|---|---|---|
| Single proper noun | `'Nvidia dominates the market'` | `['Nvidia']` |
| Multi-word proper noun | `'Jensen Huang announced'` | `['Jensen Huang']` |
| Stop word only | `'The company grew'` | `[]` (The filtered) |
| Short token | `'AI is growing'` | `['AI']` excluded (length < 3) |
| Empty string | `''` | `[]` |
| Mixed case prose | `'Apple and Microsoft compete'` | `['Apple', 'Microsoft']` |

**`planSegmentVisuals` (fallback path, no API key)**

| Scenario | Input | Expected |
|---|---|---|
| Data beat narration | Narration with `'revenue'` keyword | `beat: 'data'` |
| Hook beat narration | Narration with `'welcome'` keyword | `beat: 'hook'` |
| Quote beat narration | Narration with `'"said"'` pattern | `beat: 'quote'` |
| No key → fallback shots | `openRouterKey: undefined` | Returns plan with `shots.length >= 1` |

### `llmVisualDirector.test.ts`

**`validateVisualPlan`**

| Scenario | Input | Expected |
|---|---|---|
| Null input | `null` | Fallback plan with `intent: 'Establish visual context'` |
| Non-object | `'string'` | Fallback plan |
| Missing intent | `{ visualConcept: 'X' }` | `intent: 'Establish visual context'` |
| Valid full plan | Full valid object | All fields preserved |
| Shots with invalid entries | `primaryShot: null` | Shots array excludes null entries |

**`validateShot`**

| Scenario | Input | Expected |
|---|---|---|
| Null | `null` | Returns `null` |
| Missing concept | `{ queries: ['q'] }` | Returns `null` |
| Valid shot | `{ concept: 'C', queries: ['q'], vibe: 'v' }` | Returns shot object |
| Empty queries array | `{ concept: 'C', queries: [] }` | Returns shot with empty queries |

### `chapters.test.ts`

**`generateChapterMarkers`**

| Scenario | Input | Expected |
|---|---|---|
| Single segment, 0s start | `[{ title: 'Intro', duration: 30 }]` | `'00:00 Intro'` |
| Multiple segments | 3 segments of 30s each | `'00:00 ...\n00:30 ...\n01:00 ...'` |
| Duration crosses 1 hour | Segments summing to > 3600s | First segment `'00:00:00 ...'` |
| Zero-duration segment | `duration: 0` | Timestamp does not advance |

### `videoRenderer.test.ts`

**`getSupportedMimeType`**

| Scenario | `isTypeSupported` mock | Expected |
|---|---|---|
| vp9 supported | Returns true for `video/webm;codecs=vp9` | `'video/webm;codecs=vp9'` |
| Only base webm | Returns true only for `video/webm` | `'video/webm'` |
| Nothing supported | Always returns false | `'video/webm'` (last resort) |
| mp4 format, avc1 supported | Returns true for mp4+avc1 | `'video/mp4;codecs=avc1...'` |

**`buildImageSources`**

| Scenario | Input URL | Expected first source |
|---|---|---|
| External HTTPS URL | `'https://example.com/img.jpg'` | `/api/proxy-image?url=...` |
| Relative URL | `'/images/local.jpg'` | `'/images/local.jpg'` (returned as-is) |
| Source count | Any external URL | 5 sources returned |
| weserv.nl source | Any external URL | Second source contains `images.weserv.nl` |

### `tts.test.ts`

**`generateOpenAITTS`**

| Scenario | Mock | Expected |
|---|---|---|
| No API key | `apiKey: ''` | Returns `null` immediately |
| API returns 401 | `fetch` → `{ ok: false, status: 401 }` | Returns `null` |
| API returns blob | `fetch` → `{ ok: true, blob: () => new Blob() }` | Returns a `blob:` URL string |
| Network error | `fetch` rejects | Returns `null` |

---

## E2E Test Improvements

The existing Playwright tests will be preserved. The following targeted improvements will be made:

1. **`tests/app.spec.ts`** — Add a test for the error state when script generation fails (mock `fetch` to return 500 via `page.route()`).
2. **`tests/e2e.spec.ts`** — Add a `page.route()` intercept for the OpenRouter endpoint to return a fixture JSON response, making the full pipeline test deterministic and fast (no real API key needed).
3. **`tests/user-journey.spec.ts`** — Read the existing file and ensure it is not broken by any changes.

---

## Bug Condition Summary (Pseudocode)

```pascal
FUNCTION isBugCondition(X)
  INPUT: X of type ServiceFunctionCall
  OUTPUT: boolean
  
  // A call is "buggy" if it exercises a code path in a service function
  // that has no corresponding unit test
  RETURN NOT EXISTS unitTest WHERE unitTest.covers(X.function, X.inputClass)
END FUNCTION

// Fix Checking
FOR ALL X WHERE isBugCondition(X) DO
  result ← runWithUnitTest(X)
  ASSERT result matches expectedBehavior(X)
END FOR

// Preservation Checking
FOR ALL existingE2ETest WHERE NOT isBugCondition(existingE2ETest) DO
  ASSERT existingE2ETest.result = SAME AS BEFORE
END FOR
```
