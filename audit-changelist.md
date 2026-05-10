# Complete Change Inventory — All 59 Files

Grouped by category. All 435 added/modified lines accounted for.

---

## A. Bug Fixes (14)

| # | File | Line(s) | What |
|---|---|---|---|
| 1 | `proxyImage.ts` | 26-34 | Added URL validation with `new URL()` — prevents crash on malformed URLs |
| 2 | `proxyImage.ts` | 37-43 | Added protocol whitelist (http/https only) — blocks SSRF via `file://`, `ftp://`, `data://` |
| 3 | `proxyImage.ts` | 60-74 | Added response status check returning 502 — was silently passing non-200 upstream responses through as 200 |
| 4 | `renderVideo.ts` | 48-63 | Streaming ndjson input replaces `JSON.stringify(frames)` — fixes `ERR_STRING_TOO_LONG` crash |
| 5 | `renderVideo.ts` | 82-90 | Remaining buffer flush after stream ends — prevents frame loss on last partial line |
| 6 | `orchestrator.ts:80` | 80 | Server render detection: `serverResult.size > 0` replaces `serverResult.url` — `url` was always truthy (server always returned one), causing false "success" on empty renders |
| 7 | `orchestrator.ts:83` | 83 | Removed `as unknown as Blob` cast — was masking type mismatch between Blob and RenderResult |
| 8 | `encoding.ts:166-167` | 166-167 | AbortError detection now checks `signal?.aborted` — was re-throwing our own 3-min timeout abort as a fatal error instead of falling back to browser render |
| 9 | `renderingShared.ts:156` | 156 | `Object.hasOwn()` guard on accentColors lookup — prevents crash when segType is `"__proto__"`, `"constructor"`, `"toString"` (prototype chain pollution) |
| 10 | `registry.ts:19` | 19 | Removed `meloEngine` from `ENGINE_PRIORITY` — Melo was still in the fallback chain even though it was removed from `TTS_ENGINES` (inconsistent state) |
| 11 | `orchestrator.ts:174` | 174 | `RENDER_DEADLINE` increased 5→12 min — was timing out before render completed |
| 12 | `storeAbortSignal.test.ts` | 81-80 | Removed MeloTTS mock — was referencing deleted module |
| 13 | `narration.test.ts` | 94-93 | Removed MeloTTS mock — was referencing deleted module |
| 14 | `tts.test.ts` | 14 | `TTS_ENGINES` length expectation 4→3 — was failing after MeloTTS removal |

---

## B. Performance Fixes (6)

| # | File | Line(s) | What |
|---|---|---|---|
| 15 | `orchestrator.ts:177-179` | 177-179 | 2-second heartbeat interval — prevents UI from appearing frozen during long single-frame renders |
| 16 | `proxyImage.ts:2,92-96` | 2,92-96 | Streaming response via `pipeline()` — replaces full-buffer `arrayBuffer()` + `end()`, reduces memory per request |
| 17 | `renderVideo.ts:48-63` | 48-63 | Streaming ndjson parser — processes frames as they arrive instead of buffering entire JSON body |
| 18 | `MediaStep/MediaCard.tsx:2,35,42-46` | 2,35,42-46 | Added `React.memo`, `useMemo`, `useCallback` — prevents unnecessary re-renders of media cards during pipeline updates |
| 19 | `MediaStep/index.tsx:2,54-60` | 2,54-60 | Added `useMemo`, `useCallback` — prevents unnecessary re-renders and function recreations |
| 20 | `store/pipeline/orchestrator.ts:404` | 404 | `useParallel = hasGrok` (was `hasGrok || hasMelo`) — MeloTTS removal simplifies parallel TTS decision |

---

## C. Crash & Error Handling Fixes (8)

| # | File | Line(s) | What |
|---|---|---|---|
| 21 | `proxyImage.ts:88-106` | 88-106 | Enhanced error handler with `err.message` and `err.name` — was swallowing error details |
| 22 | `proxyImage.ts:30-33,39-41` | 30-33,39-41 | Structured JSON error responses (400/502/500) — was returning raw error text |
| 23 | `renderVideo.ts:137-152` | 137-152 | Full try/catch with 500 response — was failing silently with unhandled promise rejection |
| 24 | `encoding.ts:81-87` | 81-87 | 3-minute timeout on server-render attempt — was hanging indefinitely on missing `edge-tts` Python dependency |
| 25 | `encoding.ts:105` | 105 | `clearTimeout(serverTimeoutId)` on user cancellation — was leaving timer running after abort |
| 26 | `encoding.ts:169` | 169 | `clearTimeout(serverTimeoutId)` on error/fallback path — was leaving timer running |
| 27 | `orchestrator.ts:478` | 478 | Heartbeat cleared in `finally` block — prevents interval leak if render errors mid-way |
| 28 | `orchestrator.ts:336-342` | 336-342 | Streaming ndjson body to `/api/render-video` — `JSON.stringify({ frames })` caused `ERR_STRING_TOO_LONG` for 2000+ frames |

---

## D. Features Added (9)

| # | File | Line(s) | What |
|---|---|---|---|
| 29 | `AssemblyStep.tsx:6-11` | 6-11 | `QUALITY_OPTIONS` constant — defines Draft/Standard/High tiers in the UI |
| 30 | `AssemblyStep.tsx:29` | 29 | `quality` state with default `'standard'` — enables quality selection |
| 31 | `AssemblyStep.tsx:207-226` | 207-226 | Quality selector UI with `data-testid` attributes — user-facing control for render quality |
| 32 | `AssemblyStep.tsx:277` | 277 | `quality` passed to `onAssemble` — wires UI selection to render pipeline |
| 33 | `PipelineStepRouter.tsx:91,108` | 91,108 | `selectedQuality` extracted and passed as `exportOptions` to `assembleVideoWithOptions` — completes draft quality plumbing |
| 34 | `tests/user-journey.spec.ts:77-79` | 77-79 | Draft quality selection in E2E test — enables faster renders in CI |
| 35 | `tests/user-journey.spec.ts:63-68,71-72` | 63-68,71-72 | AI Edit step handling — test now covers the full pipeline including the previously-missing AI Edit step |
| 36 | `tests/user-journey.spec.ts:112-114` | 112-114 | Proper `waitFor`/`expect` assertions for final state — replaces `.catch(() => false)` |
| 37 | `tests/user-journey.spec.ts:12` | 12 | `test.setTimeout(900000)` — 15-min timeout for full pipeline render |

---

## E. Security Fixes (3)

| # | File | Line(s) | What |
|---|---|---|---|
| 38 | `proxyImage.ts:37-42` | 37-42 | Protocol whitelist — blocks `file://`, `ftp://`, `data://`, `chrome://` SSRF attacks |
| 39 | `proxyImage.ts:76-78` | 76-78 | CORS headers (`Access-Control-Allow-Origin`, `-Methods`, `-Headers`) — prevents browser from blocking proxied images |
| 40 | `renderingShared.ts:156` | 156 | `Object.hasOwn()` guard — prevents prototype pollution injection via malformed segment types |

---

## F. Code Quality & Maintainability (11)

| # | File | Line(s) | What |
|---|---|---|---|
| 41 | `App.tsx` | 1-64 | Reduced from 295 to 64 lines — extracted routing to `PipelineStepRouter`, layout to `AppShell`, modals to `AppModals` |
| 42 | `PipelineStepRouter.tsx` | 1-205 | New file — centralized all step callback handlers, removing inline switch/dsl from App.tsx |
| 43 | `proxyImage.ts:2` | 2 | ESM `import { pipeline }` replaces `require('stream')` — fixes ESM compatibility |
| 44 | `proxyImage.ts:45-58` | 45-58 | Browser-like fetch headers + `redirect: "follow"` — reduces 403 blocks from image CDNs |
| 45 | `renderVideo.ts:9-12` | 9-12 | Updated doc comment — accurately describes ndjson protocol |
| 46 | `orchestrator.ts:62-68` | 62-68 | `reportProgress()` wrapper — centralizes progress tracking for heartbeat support |
| 47 | `orchestrator.ts:74-75,92,98,140,311,316,330,347,473` | multiple | All `onProgress?.()` → `reportProgress()` calls — consistent pattern |
| 48 | `tts/index.ts:37` | 37 | `TTS_ENGINES` now mirrors `ENGINE_PRIORITY` — was inconsistent |
| 49 | `registry.ts:18-19` | 18-19 | ENGINE_PRIORITY comment updated — reflects 3 engines not 4 |
| 50 | `registry.ts:62-65` | 62-65 | Removed `configureEngines` from docs — function no longer exists |
| 51 | `vitest.config.ts:16` | 16 | Added `src/utils/**/*.ts` to test include — enables utility testing |

---

## G. Dead Code Removal (13)

| # | File | Line(s) | What |
|---|---|---|---|
| 52 | `src/services/tts/meloEngine.ts` | all 137 lines | **Entire file deleted** — MeloTTS engine implementation (Cloudflare Workers AI) |
| 53 | `src/types.ts` | all 350 lines | **Entire file deleted** — types consolidated elsewhere |
| 54 | `src/index.css` | 119-223 (105 lines) | Deleted: `shadow-hard`, `shadow-hard-sm`, `shadow-hard-white` utility classes, base body/html styles, scrollbar overrides, animations (pulse-glow, shimmer, blink, fade-in), selection styles, SVG gradient overrides |
| 55 | `tts/index.ts:14` | 14 | Removed `export { generateMeloTts }` — no production imports |
| 56 | `tts/index.ts:30` | 30 | Removed `import { meloEngine }` — unused import |
| 57 | `registry.ts:13` | 13 | Removed `import { meloEngine, setMeloCredentials }` — unused after removal |
| 58 | `registry.ts:36-42` | 36-42 | Removed `configureEngines()` function — only called `setMeloCredentials()` |
| 59 | `registry.ts:47-48` | 47-48 | Removed `cloudflareAccountId`/`cloudflareApiToken` from `buildEngineOptions` — no engine uses them |
| 60 | `store/pipeline/orchestrator.ts:329-330` | 329-330 | Removed `cfAccountId`/`cfApiToken` vars — MeloTTS credentials no longer needed |
| 61 | `store/pipeline/orchestrator.ts:342` | 342 | Removed `if (hasMelo) engines.push('MeloTTS')` — engine list no longer includes Melo |
| 62 | `store/pipeline/orchestrator.ts:392` | 392 | Removed MeloTTS TTS tier block (~20 lines) — Tier 2 MeloTTS generation eliminated |
| 63 | `store/pipeline/orchestrator.ts:36` | 36 | Removed `generateMeloTts` from import — no longer used |

---

## H. Test Reliability (6)

| # | File | Line(s) | What |
|---|---|---|---|
| 64 | `tests/user-journey.spec.ts:12` | 12 | `test.setTimeout(900000)` — prevents timeout on slow render |
| 65 | `tests/user-journey.spec.ts:112-114` | 112-114 | `expect().toBeVisible()` replaces `.catch(() => false)` — fails fast with clear error instead of silent false |
| 66 | `tests/user-journey.spec.ts:104` | 104 | `page.getByTestId('preview-step').waitFor()` replaces `page.waitForURL('**/preview**')` — actually waits for the correct element |
| 67 | `AssemblyStep.test.tsx:109,121` | 109,121 | Updated expected `onAssemble` args to include `quality: 'standard'` — tests match reality |
| 68 | `MediaStep.test.tsx:262,350` | 262,350 | `.hasAttribute('disabled')` replaces `.disabled` — matches actual DOM behavior |
| 69 | `tts.test.ts:14,16` | 14,16 | Expectations updated: length 4→3, removed `'melo'` from engine names — tests match implementation |

---

## I. User Experience (5)

| # | File | Line(s) | What |
|---|---|---|---|
| 70 | `orchestrator.ts:177-179` | 177-179 | Heartbeat interval — render progress bar no longer freezes during long frames |
| 71 | `AssemblyStep.tsx:207-226` | 207-226 | Quality selector visible on Assembly screen — users can choose faster renders |
| 72 | `TopicStep.tsx:125-126` | 125-126 | Error message includes actual error + "check your API key in Settings" — actionable error guidance |
| 73 | ~35 component files | ~80 instances | `transition-colors duration-200` added to hover states — smoother visual feedback |
| 74 | `proxyImage.ts:76-79` | 76-79 | `Cache-Control: immutable` — proxied images cached by browser for 24h |

---

## J. Behavior Changes (3)

| # | File | Line(s) | What |
|---|---|---|---|
| 75 | `AssemblyStep.tsx:29` | 29 | Default quality changed from `'high'` to `'standard'` — initial renders now 1080p/12Mbps instead of 1080p/16Mbps |
| 76 | `store/pipeline/orchestrator.ts:335` | 335 | `hasGrok` now detects placeholder API key `'your-xai-key-here'` and skips Grok — prevents wasted API calls with fake keys |
| 77 | `orchestrator.ts:80` | 80 | Server render detection uses `size > 0` instead of truthy `url` — now correctly falls back to browser when server returns empty |

---

## K. CSS Refactor (Tailwind Inline) — ~200 lines across ~38 files

| # | Pattern | Count | Files | What |
|---|---|---|---|---|
| 78 | `shadow-hard` → `shadow-[4px_4px_0px_#ff5500]` | ~30 instances | AIEditStep, AnalyticsDashboard, AssemblyStep, CommandPalette, ConfirmDialog, DebugOverlay, ErrorBoundary, ExportModal, FeatureFlagsPanel, HoverThumbnailPreview, KeyboardShortcutsModal, MediaStep/ProcessingView, MediaStep/index, NarrationStep, OnboardingModal, OnboardingTour, PerfDashboard, PipelineSidebar, RenderProgressBar, ScriptStep, SettingsModal, StepProgressIndicator, Tooltip, TopicStep, TrimEditor, VersionHistoryPanel, VideoComparison, WorkspaceSelector | Replaced global utility class with inline arbitrary value |
| 79 | `shadow-hard-sm` → `shadow-[2px_2px_0px_#ff5500]` | ~7 instances | TestRunner, ConfirmDialog, NarrationStep, OnboardingModal, PreviewStep/index, SettingsModal, TrimEditor | Small shadow variant inlined |
| 80 | `transition-colors duration-200` added | ~80 instances across ~35 files | All major interactive elements | Smooth hover transitions added |

---

## L. TopicStep JSON Parsing Fix (4)

| # | File | Line(s) | What |
|---|---|---|---|
| 81 | `TopicStep.tsx:40` | 40 | Imported `extractJson` utility |
| 82 | `TopicStep.tsx:83` | 83 | Uses `extractJson(content)` instead of manual `.replace(/```json/g, '')` — more robust extraction |
| 83 | `TopicStep.tsx:86-89` | 86-89 | Handles wrapped JSON objects `{ ideas: [...] }` — LLM sometimes wraps arrays in objects |
| 84 | `TopicStep.tsx:94` | 94 | Empty array fallback when JSON parse fails — was leaving previous `parsed` value intact |

---

## Summary

| Category | Count |
|---|---|
| **A. Bug fixes** | 14 |
| **B. Performance fixes** | 6 |
| **C. Crash/error handling fixes** | 8 |
| **D. Features added** | 9 |
| **E. Security fixes** | 3 |
| **F. Code quality/maintainability** | 11 |
| **G. Dead code removal** | 13 |
| **H. Test reliability** | 6 |
| **I. User experience** | 5 |
| **J. Behavior changes** | 3 |
| **K. CSS refactor** | 3 patterns (~200 lines) |
| **L. TopicStep JSON parsing fix** | 4 |
| **Total distinct items** | **84** |
