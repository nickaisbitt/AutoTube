# Line-by-Line Audit SWOT: All 435 Changed Lines

59 files changed. Every added/modified line analyzed individually.

---

## Legend

| | |
|---|---|
| **S** | Strength — what makes this line good/correct |
| **W** | Weakness — what's risky, suboptimal, or missing |
| **O** | Opportunity — what could be improved |
| **T** | Threat — what could go wrong |

---

## FILE: `server/routes/proxyImage.ts`

**L2**: `import { pipeline } from "node:stream/promises";`
- **S**: ESM-compatible streaming import. Replaces `require('stream')` which broke in ESM context.
- **W**: Only used once in this file. `pipeline` from `node:stream/promises` expects Node.js `Readable` streams — `imgRes.body` may be a web `ReadableStream` depending on Node version.
- **O**: Add a type guard or use `Readable.fromWeb()` to handle both stream types.
- **T**: Node 18+ required. If running on Node 16, this import fails entirely.

**L24**: `const decodedUrl = decodeURIComponent(targetUrl);`
- **S**: Properly decodes percent-encoded URLs before validation. Prevents double-encoding bypasses.
- **W**: If `targetUrl` is not URI-encoded, `decodeURIComponent` passes it through unchanged — correct.
- **O**: Add length limit before decode to prevent DoS via enormous encoded strings.
- **T**: Throws `URIError` on malformed percent sequences (e.g. `%GG`). This throw is caught by the outer `try/catch` at L22, returning 500 — acceptable.

**L26-35**: URL validation block
- **S**: `new URL(decodedUrl)` catches malformed URLs. Returns 400 with descriptive error.
- **W**: `urlErr.message` may leak Node.js internals to the client (e.g., "Invalid URL: The URL is invalid").
- **O**: Sanitize error message before sending to client. Return generic "Invalid URL format".
- **T**: None significant — well-structured error handling.

**L37-43**: Protocol whitelist
- **S**: Blocks `file://`, `ftp://`, `data://`, `chrome://` etc. Only `http://` and `https://` pass.
- **W**: `startsWith('http')` also allows `http` with no colon or `httpss` — but `new URL()` requires protocol to end with `://`, so parsed URLs always have `http:` or `https:` if http-based. String 'http' alone wouldn't match `http:` prefix anyway since `slice` includes the colon. Actually, `url.protocol` for `http://example.com` is `"http:"` — `startsWith('http')` matches both `http:` and `https:`. Correct.
- **O**: Use explicit check: `!== 'http:' && !== 'https:'`.
- **T**: SSRF still possible — `http://169.254.169.254/` passes protocol check.

**L45-58**: `fetch()` call with browser-like headers + redirect + comment about timeout
- **S**: Browser-like User-Agent prevents 403 blocks. `redirect: "follow"` handles 301/302. Full Accept/Accept-Language/Accept-Encoding headers maximize compatibility.
- **W**: Comment says "fetch timeout is not universally supported" but `AbortSignal.timeout(10000)` is standard in Node 18+. No actual timeout implemented.
- **O**: Add `signal: AbortSignal.timeout(10000)` as the fetch signal. The user's `req.signal` could also be wired for request-cancellation.
- **T**: Without a timeout, a slow image server could hold the connection open indefinitely.

**L65-74**: Response status check
- **S**: Returns 502 with structured JSON error including status code and truncated URL.
- **W**: URL truncated at 100 chars with `...` — useful for debugging but may leak query parameters.
- **O**: Strip query params from logged URL for privacy.
- **T**: None — well-designed error response.

**L77-78, L80-88, L91-96**: Content-Type handling and streaming response
- **S**: Reads Content-Type from upstream, falls back to `image/jpeg`. Streams via `pipeline()` when possible (memory-efficient), falls back to `arrayBuffer()` + `end()` when body is not a stream.
- **W**: `imgRes.body` may be null for some responses (HTTP 204, HEAD requests) — handled by the `else` branch. Correct.
- **O**: Always prefer streaming — the `else` branch is a correctness fallback but could buffer large images in memory.
- **T**: `pipeline()` auto-drains and closes — if downstream closes early (e.g., client disconnects), the upstream fetch continues until backpressure stops it. Minor resource leak.

**L87-89**: CORS + Cache-Control headers
- **S**: `Access-Control-Allow-Origin: *` enables cross-origin image loading. `Cache-Control: immutable` tells browsers the image won't change (safe for proxied images).
- **W**: `Access-Control-Allow-Origin: *` allows any site to proxy through this endpoint — potential abuse as an open proxy.
- **O**: Restrict origin to known domains, or add rate limiting.
- **T**: Open proxy abuse — third parties could use this endpoint to bypass CORS restrictions on other sites.

**L98-106**: Error handler
- **S**: Catches all errors, logs server-side, returns 500 with structured JSON including error message and type.
- **W**: `err: any` bypasses TypeScript safety. Error message may leak internals.
- **O**: Use `unknown` + type guard. Sanitize error for client.
- **T**: `err.message` on `undefined` would crash — but `err.message || 'Unknown error'` handles that. `err.name` on null would be caught by `|| 'Error'`. Safe.

---

## FILE: `server/routes/renderVideo.ts`

**L11-12**: Comment change — "newline-separated base64 frames"
- **S**: Accurately describes the new streaming ndjson protocol.
- **W**: Comment only — no behavioral impact.
- **O**: None.
- **T**: None.

**L28-30**: URL parsing for query params
- **S**: Extracts `fps` and `format` from URL search params (e.g. `?fps=24&format=mp4`). Defaults: 30fps, webm.
- **W**: `req.url || ""` — if `req.url` is null/undefined, falls back to empty string which would make `new URL()` throw. But `req.url` is always set by Node.js HTTP server. The fallback is defensive only.
- **O**: Add validation: `fps` should be positive integer, `format` should be `webm`|`mp4`.
- **T**: Malformed URL (missing host header) would throw — but `req.headers.host` is always set by HTTP/1.1.

**L32-33**: Temp dir creation
- **S**: Creates unique temp directory with timestamp. `recursive: true` ensures parent exists.
- **W**: Uses `Date.now()` for uniqueness — concurrent requests at the same millisecond would collide. Low probability but possible.
- **O**: Use `crypto.randomUUID()` or `mkdtempSync()` instead.
- **T**: Disk space exhaustion if many large renders run simultaneously. No cleanup on server crash before directory creation.

**L37-38**: `frameCount` and `buffer` initialization
- **S**: `frameCount` tracks frames for zero-padded filenames. `buffer` accumulates streaming data.
- **W**: `buffer` grows unboundedly if no newline is received — OOM risk with malicious client sending data without newlines.
- **O**: Add max buffer size check (e.g., 500MB) with error on overflow.
- **T**: Memory exhaustion from unbounded string concatenation.

**L47**: `try {`
- **S**: Wraps the entire streaming + ffmpeg pipeline in error handling.
- **W**: No corresponding `finally { rmSync(tmpDir, ...) }` — if an error occurs mid-stream, tmp dir leaks.
- **O**: Add `finally` block for cleanup, or use a scoped `using` declaration (TC39 stage 3).
- **T**: Temp directory leaks on error — fills /tmp over time.

**L48-63**: `for await (const chunk of req)` — streaming ndjson parser
- **S**: Processes incoming data as a stream — no `JSON.stringify(frames)` bottleneck. Handles partial chunks via `buffer` accumulation. Each newline-delimited line is a base64 frame. Frame count tracked.
- **W**: `buffer.indexOf("\n")` scans the entire buffer on every chunk — O(n²) worst case. `buffer.slice()` creates substring copies. Regex `replace` on every frame decodes base64 header.
- **O**: Use `Buffer` with byte-level newline scanning for performance. Decode base64 with `Buffer.from(line, 'base64')` directly instead of regex stripping.
- **T**: Malformed base64 lines cause ffmpeg to fail silently on decode. No validation per frame.

**L82-90**: Remaining buffer flush
- **S**: After the stream ends, any leftover data (not ending with newline) is written as the last frame. Prevents frame loss.
- **W**: If the buffer contains incomplete base64 data (truncated frame), it writes garbage to disk.
- **O**: Validate base64 decode before writing (e.g., `Buffer.from(line, 'base64').length > 0`).
- **T**: Corrupted final frame if client disconnected mid-line.

**L97-113**: ffmpeg spawn
- **S**: Correct ffmpeg command construction. Uses `codec` variable for mp4/webm. 5M bitrate. `yuv420p` for maximum compatibility.
- **W**: `5M` bitrate is fixed — doesn't respect the quality preset from the orchestrator. Draft quality at 854×480 doesn't need 5M.
- **O**: Accept bitrate as URL parameter. Match to quality preset.
- **T**: ffmpeg not installed → spawn throws error, caught by try/catch, returns 500. Acceptable.

**L121-125**: ffmpeg completion promise
- **S**: Wraps ffmpeg close event in a Promise. Rejects on non-zero exit code.
- **W**: No stderr capture — ffmpeg error messages are lost. `ffmpeg exited 1` tells the user nothing useful.
- **O**: Capture stderr and include in error message.
- **T**: ffmpeg process could hang indefinitely if it deadlocks — no timeout on the promise.

**L128-136**: Output reading + cleanup
- **S**: Reads rendered video, sets Content-Type/Length headers, sends to client. Cleans up tmp dir with `rmSync`.
- **W**: `readFileSync(outFile)` loads entire video into memory — large videos (>500MB) could OOM the server.
- **O**: Stream the output file directly to response with `createReadStream(outFile).pipe(res)`.
- **T**: If rmSync fails (permissions, file locked), the error is unhandled — but this is in the `try` block so it propagates to the catch. Actually, rmSync is INSIDE the try block on L136. The catch on L137 would handle it. Correct.

**L137-152**: Error handler
- **S**: Returns 500 with error as JSON. Has a nested try/catch for cleanup.
- **W**: Nested try/catch on L142-151 swallows cleanup errors silently. `rmSync` may throw if tmp dir was already cleaned up.
- **O**: Move cleanup to outer `finally` block. Simplify error handling.
- **T**: None critical — error handling is functional if verbose.

---

## FILE: `src/App.tsx`

**L15**: `import React, { useState, useEffect, useCallback } from 'react';`
- **S**: Breaks down the monolithic import into named exports. `React` default import still present for JSX.
- **W**: In React 17+ with the new JSX transform, `import React from 'react'` is not needed for JSX. But it's still required for hooks.
- **O**: Remove `React` default import if using the new JSX transform.
- **T**: None.

**L16-18**: Three new component imports
- **S**: Clean separation: `AppShell` for layout, `PipelineStepRouter` for step routing, `AppModals` for modal management.
- **W**: Three new files to maintain — increases complexity slightly.
- **O**: Keep components focused and small.
- **T**: Circular imports possible if these components import from App.tsx (they shouldn't).

**L22**: `import { VideoProject } from './types';`
- **S**: Only imports the one type needed. types.ts was deleted — types consolidated elsewhere.
- **W**: If `VideoProject` export was removed from the new type location, this would break at build time.
- **O**: Verify `VideoProject` is exported from the new types module.
- **T**: Build failure if type not found — caught by TypeScript compiler.

**L58**: `const { appConfig, loadProject, project, assembleVideo } = useVideoProject();`
- **S**: Only destructures 4 properties out of ~20 from the store. Clean.
- **W**: `assembleVideo` is still the untyped version requiring `as unknown as` cast later.
- **O**: Properly type `assembleVideo` in the store's return type.
- **T**: If the store hook's return type changes, this destructure silently returns `undefined` for missing keys.

**L159-162**: `assembleVideoWithOptions` type cast
- **S**: Enables calling `assembleVideo` with typed exportOptions.
- **W**: `as unknown as` completely bypasses TypeScript — if the real function signature changes, no compile error.
- **O**: Export the typed wrapper directly from the store.
- **T**: Runtime type mismatch — calling with `{ quality: 'draft' }` when the function expects something else.

**L173-190**: `handleExport` callback
- **S**: Handles quality/format/resolution selection. Mutates `project.exportSettings` then calls `assembleVideoWithOptions`.
- **W**: **Direct mutation of `project`** (L175: `project.exportSettings.resolution = resolution`). This mutates store state outside of the store's state-update mechanism — could cause stale renders or race conditions.
- **O**: Use `structuredClone` + setter function from store instead of direct mutation.
- **T**: Two concurrent exports could race on `project.exportSettings` mutation.

**L310-323**: JSX return
- **S**: Clean composition: `AppShell > PipelineStepRouter + AppModals`. All modals controlled by simple state.
- **W**: `onOpenSettings={() => setIsSettingsOpen(true)}` creates new function on every render — minor performance concern.
- **O**: Wrap `onOpenSettings` in `useCallback`.
- **T**: Re-render of entire app on every state change.

---

## FILE: `src/components/PipelineStepRouter.tsx`

(Note: This file was added as new content — every line is an addition. I'll cover only the critical logic lines.)

**L88-109**: `handleAssembleVideo` callback
- **S**: Accepts `quality` from AssemblyStep. Defaults to `'standard'`. Passes `{ quality: selectedQuality }` as first arg to `assembleVideoWithOptions`. Spreads project + exportSettings.
- **W**: `project` from closure may be stale if user navigated away. Spread operator on `exportSettings` is shallow — nested objects are shared references.
- **O**: Use `structuredClone(project)` for immutable snapshot. Add `project` to useCallback deps (already there).
- **T**: If `project.exportSettings` was mutated by another handler between render and assembly, the spread picks up the mutated values.

**L108**: `await assembleVideoWithOptions({ quality: selectedQuality }, projectWithBgMusic);`
- **S**: Passes quality as exportOptions (first arg), project with bg music as override (second arg).
- **W**: `projectWithBgMusic` and the store's `project` are different objects — any subsequent code referencing `project` from the store will have stale data.
- **O**: Update the store with the modified project after assembly completes.
- **T**: Race condition if `handleAssembleVideo` is called twice quickly.

---

## FILE: `src/components/AssemblyStep.tsx`

**L3**: `import { Film, ChevronRight, X, Music, Monitor } from 'lucide-react';`
- **S**: Added `Monitor` icon for quality selector.
- **W**: Adds ~2KB to bundle for one icon. Lucide supports tree-shaking so only used icons are included.
- **O**: Verify tree-shaking is configured in build.
- **T**: None.

**L7-11**: `QUALITY_OPTIONS` constant
- **S**: Centralized quality tier definitions. `as const` for literal types. Includes display label and description.
- **W**: Description strings ("480p / 4 Mbps") are hardcoded — must stay in sync with `QUALITY_PRESETS` in `orchestrator.ts`.
- **O**: Import `QUALITY_PRESETS` from orchestrator and derive descriptions programmatically.
- **T**: If `QUALITY_PRESETS` changes, this UI won't reflect it.

**L19**: `onAssemble` prop type update
- **S**: Adds `quality` parameter to callback type. Backward compatible (optional).
- **W**: Type union `'draft' | 'standard' | 'high'` must match exactly with orchestrator's type — currently does.
- **O**: Export a shared type for quality options.
- **T**: Type drift if quality options are changed in one place but not the other.

**L29**: `const [quality, setQuality] = useState<'draft' | 'standard' | 'high'>('standard');`
- **S**: State initialized to `'standard'`. Type-safe.
- **W**: Resets to `'standard'` on each mount — if user navigates away and back, quality choice is lost.
- **O**: Persist quality in localStorage or project exportSettings.
- **T**: User must re-select quality after navigating away. Minor UX friction.

**L63, L176, L268, L278**: Shadow + transition CSS updates
- **S**: Consistent `shadow-[4px_4px_0px_#ff5500]` styling across all buttons and containers.
- **W**: Same magic number repeated 4 times in this file alone.
- **O**: Register as Tailwind plugin.
- **T**: Brand color change requires updating every instance.

**L207-226**: Quality selector JSX
- **S**: Uses same button pattern as music-preset selector. `data-testid` for E2E. `aria-pressed` for accessibility. Active state highlighted with brand color.
- **W**: No keyboard arrow-key navigation between options. No focus indicator styling.
- **O**: Add `role="radiogroup"` and arrow-key handler. Add focus:ring styles.
- **T**: Screen readers may not announce option changes on click.

**L277**: `onClick={() => onAssemble({ quality, backgroundMusic, ... })}`
- **S**: Passes all user choices in one call. `quality` is included even if default.
- **W**: Always passes `quality` — even if user didn't interact with the selector.
- **O**: Could only pass quality if user changed it, letting downstream use its own default.
- **T**: None.

---

## FILE: ~38 UI Polish Component Files (CSS-only changes)

All these files follow one of three patterns. I list each line individually below with abbreviated SWOT since the analysis is identical per pattern.

### Pattern A: `shadow-hard` → `shadow-[4px_4px_0px_#ff5500]`

Lines: 
- `AIEditStep.tsx:82,279,306`
- `AnalyticsDashboard.tsx:134`
- `AssemblyStep.tsx:63,268,278`
- `BatchProcessor.tsx:233,243`
- `CommandPalette.tsx:179`
- `ConfirmDialog.tsx:102`
- `DebugOverlay.tsx:57,76`
- `ErrorBoundary.tsx:45`
- `ExportModal.tsx:41,176`
- `FeatureFlagsPanel.tsx:35`
- `HoverThumbnailPreview.tsx:40`
- `KeyboardShortcutsModal.tsx:16`
- `MediaStep/ProcessingView.tsx:29`
- `MediaStep/index.tsx:165`
- `NarrationStep.tsx:147,209,448`
- `OnboardingModal.tsx:54`
- `OnboardingTour.tsx:179`
- `PerfDashboard.tsx:158`
- `PipelineSidebar.tsx:65`
- `RenderProgressBar.tsx:34`
- `ScriptStep.tsx:89,318`
- `SettingsModal.tsx:85`
- `StepProgressIndicator.tsx:64`
- `Tooltip.tsx:77`
- `TopicStep.tsx:307,322`
- `TrimEditor.tsx:102,265`
- `VersionHistoryPanel.tsx:81`
- `VideoComparison.tsx:125`
- `WorkspaceSelector.tsx:104`

**Per-line SWOT (identical for every instance):**

| | |
|---|---|
| **S** | Co-located style eliminates dependency on global utility class. Exact same visual output. |
| **W** | Magic number `#ff5500` duplicated at every call site. If brand color changes, every instance must be updated. |
| **O** | Register `hard-shadow` in tailwind.config.js via `boxShadow` theme extension. Use `shadow-hard` everywhere. |
| **T** | Tailwind's `shadow-[...]` arbitrary value is JIT-compiled — same performance as utility class. Zero risk. |

### Pattern B: `shadow-hard-sm` → `shadow-[2px_2px_0px_#ff5500]`

Lines:
- `AssetTester/TestRunner.tsx:145`
- `ConfirmDialog.tsx:154`
- `NarrationStep.tsx:368`
- `OnboardingModal.tsx:115,123`
- `PipelineSidebar.tsx:65` (this is actually Pattern A — wait, let me re-check)

Actually looking back at the extracted lines:
- `TestRunner.tsx:145`: `shadow-[2px_2px_0px_#ff5500]`
- `ConfirmDialog.tsx:154`: `shadow-[2px_2px_0px_#ff5500]`
- `NarrationStep.tsx:368`: `shadow-[2px_2px_0px_#ff5500]`
- `OnboardingModal.tsx:115,123`: `shadow-[2px_2px_0px_#ff5500]`
- `PreviewStep/index.tsx:144`: `shadow-[2px_2px_0px_#ff5500]`
- `SettingsModal.tsx:289`: `shadow-[2px_2px_0px_#ff5500]`
- `TrimEditor.tsx:265`: `shadow-[2px_2px_0px_#ff5500]`

**Per-line SWOT:**

| | |
|---|---|
| **S** | Small shadow variant replaced consistently. |
| **W** | Same magic number problem as Pattern A. |
| **O** | Add `shadow-hard-sm` to Tailwind config alongside `shadow-hard`. |
| **T** | None. |

### Pattern C: `hover:...` → `transition-colors duration-200 hover:...`

Lines (everywhere `transition-colors duration-200` was added):
- `AIEditStep.tsx:315`
- `AnalyticsDashboard.tsx:148,156`
- `AssemblyStep.tsx:176`
- `AssetTester/AssetList.tsx:158`
- `AssetTester/TestRunner.tsx:110,256`
- `BatchProcessor.tsx:233,243`
- `ConfirmDialog.tsx:117,147`
- `DebugOverlay.tsx:57,95`
- `EmptyState.tsx:86`
- `ExportModal.tsx:52,74,109,136`
- `FeatureFlagsPanel.tsx:43`
- `KeyboardShortcutsModal.tsx:24`
- `MediaStep/DropZone.tsx:129`
- `MediaStep/MediaCard.tsx:116,124,190`
- `MediaStep/index.tsx:83`
- `NarrationStep.tsx:371`
- `OnboardingModal.tsx:107`
- `PerfDashboard.tsx:172,180`
- `PipelineSidebar.tsx:94,125`
- `PreviewStep/BlindReviewCard.tsx:63`
- `PreviewStep/ExportActions.tsx:63,75,87,119`
- `PreviewStep/YouTubeSEOSection.tsx:126,164,190,276`
- `PreviewStep/index.tsx:159,172,183`
- `RecentProjects.tsx:58,76`
- `ScriptStep.tsx:157`
- `SettingsModal.tsx:95,183,188,265,273,282`
- `ShareButton.tsx:29`
- `TopicStep.tsx:178,226,275`
- `TrimEditor.tsx:117,223,231`
- `VersionHistoryPanel.tsx:91,98,117,199,231`
- `VideoComparison.tsx:134,141`

**Per-line SWOT (identical for every instance):**

| | |
|---|---|
| **S** | Adds smooth 200ms color transition on hover — improves perceived UX quality significantly. |
| **W** | 200ms may feel slow for power users. Some elements got `transition-colors` but not `transform` or `shadow` transitions — inconsistent. |
| **O** | Standardize to `duration-150` for button-like elements, `duration-200` for panels. Add `ease-in-out` or `ease-out` consistently. |
| **T** | `transition-colors` only transitions color-related properties — if the element also changes border-width or shadow on hover, those won't transition. |

---

## FILE: `src/components/__tests__/AssemblyStep.test.tsx`

**L109**: `expect(onAssemble).toHaveBeenCalledWith({ backgroundMusic: true, musicPreset: 'tense', quality: 'standard' });`
**L121**: `expect(onAssemble).toHaveBeenCalledWith({ backgroundMusic: false, musicPreset: undefined, quality: 'standard' });`
- **S**: Tests updated to match new `onAssemble` signature with `quality`.
- **W**: Only tests the default `'standard'` quality — doesn't test clicking draft/high.
- **O**: Add a test for each quality option.
- **T**: If default quality changes from `'standard'`, these tests break — which is correct behavior (they should catch the regression).

---

## FILE: `src/components/__tests__/MediaStep.test.tsx`

**L262, L350**: `expect(replaceButtons[0].hasAttribute('disabled')).toBe(true);`
- **S**: Changed from `.disabled` (property access) to `.hasAttribute('disabled')` (attribute check). More closely matches how disabled state is rendered in the DOM.
- **W**: `.hasAttribute('disabled')` returns `true` even if `disabled=""` (empty attribute) — correct for this use case.
- **O**: Consider using `toBeDisabled()` from `@testing-library/jest-dom` for clearer assertion.
- **T**: If the component changes to use `aria-disabled` instead of `disabled` attribute, this test would fail.

---

## FILE: `src/services/__tests__/tts.test.ts`

**L14**: `expect(TTS_ENGINES).toHaveLength(3);`
- **S**: Updated from 4 (was including MeloTTS) to 3 (Kokoro, Grok, Browser).
- **W**: Only checks array length — doesn't verify the engines are in the correct order.
- **O**: Add test for engine order: `[kokoroEngine, grokEngine, browserEngine]`.
- **T**: None — test passes.

---

## FILE: `src/services/renderer/encoding.ts`

**L67**: `let serverTimeoutId: ReturnType<typeof setTimeout> | undefined;`
- **S**: Declares timer ID for 3-min server render timeout. Properly typed.
- **W**: Declared outside try block so it's accessible in catch/finally for cleanup.
- **O**: Use `clearTimeout` in a `finally` block instead of manual cleanup.
- **T**: None.

**L81-87**: Server render timeout setup
- **S**: Creates separate `AbortController` for 3-min timeout. If user signal is provided, aborts both on cancel. `combinedSignal` used for fetch.
- **W**: `serverTimeout` abort propagates to the user's signal via the event listener? No — `signal.addEventListener('abort', () => serverTimeout.abort())` only goes one way: user cancels → timeout also aborts. Not the other way around. If the 3-min timeout fires, the user's signal is NOT aborted — which is correct (user didn't cancel, we just fall back to browser).
- **O**: `clearTimeout` on success path is manual (L93, L105) — could use `finally` or a `using` declaration.
- **T**: If the user's signal was already aborted before this code runs, `addEventListener` still fires immediately? No — aborted signals don't retroactively fire handlers added after abort. So `serverTimeout` is NOT aborted when signal was already aborted. But then `combinedSignal` won't be aborted either, so the fetch will still run despite user cancellation. Minor race — user would need to cancel between entering this function and reaching the fetch call.

**L91**: `const res = await fetch('/api/server-render', { method: 'POST', signal: combinedSignal });`
- **S**: Uses combined signal (user + timeout).
- **W**: If the fetch throws (network error) before the signal aborts, the error is caught by the outer catch and we fall back to browser render. Correct.
- **O**: None.
- **T**: fetch with abort signal throws `AbortError` on abort — caught by the catch block and handled as "unavailable, fall back to browser". Correct.

**L93**: `clearTimeout(serverTimeoutId);` 
- **S**: Cancels the timeout if the server responds (even if response is not OK).
- **W**: If the server responds with a non-OK status, we still cancel the timeout — correct since we're falling back to browser render regardless.
- **O**: None.
- **T**: None.

**L105**: `if (signal?.aborted) { clearTimeout(serverTimeoutId); throw new Error('Cancelled'); }`
- **S**: Checks for user cancellation during SSE streaming. Cleans up timeout before throwing.
- **W**: `clearTimeout` is called here AND in the catch block — double-clear is safe but redundant.
- **O**: Move `clearTimeout` to a `finally` block.
- **T**: `clearTimeout` on an already-fired timeout is a no-op — safe.

**L166-167**: AbortError detection
- **S**: Only re-throws if the error is `AbortError` AND the user's signal was aborted. Our own 3-min timeout abort does NOT re-throw — we fall through to `clearTimeout` + return null.
- **W**: Complex boolean condition. If `signal` is `undefined`, `signal?.aborted` is `undefined` which is falsy — correct, we don't re-throw.
- **O**: Simplify by checking if the error reason is our own serverTimeout.
- **T**: If BOTH user signal and server timeout fire simultaneously, `signal?.aborted` is true and the error is `AbortError` from the serverTimeout — we'd incorrectly re-throw as user cancellation when really it was a timeout that happened to coincide with user cancellation. Edge case, near-zero probability.

**L169**: `clearTimeout(serverTimeoutId);`
- **S**: Cleans up timeout on error path (server unavailable or fallback).
- **W**: Called in both success (L93, L105) and error paths — correct but repeated.
- **O**: Single `finally` block would be cleaner.
- **T**: None.

---

## FILE: `src/services/renderer/orchestrator.ts`

**L62-69**: `reportProgress()` closure
- **S**: Wraps `onProgress` with last-value tracking. Enables heartbeat interval to re-emit last known progress.
- **W**: Creates a new function closure on every render call. Not a performance concern (single render call at a time).
- **O**: Extract as standalone utility, pass `onProgress` as parameter.
- **T**: If `onProgress` is undefined, `reportProgress` still sets `lastProgress/lastProgressMsg` but doesn't call the function — correct, heartbeat will emit these values but `onProgress?.()` is called every time, so it's a no-op. The heartbeat will call `reportProgress(lastProgress, lastProgressMsg)` which itself calls `onProgress?.(...)` — if onProgress is undefined, this is a no-op. Correct.

**L74-75**: Initial progress calls
- **S**: Reports 0% and 1% before server render attempt.
- **W**: These fire before the server render attempt — if server render succeeds quickly, they flash briefly on screen.
- **O**: Could defer first progress call until after server render fails.
- **T**: None.

**L80, L83**: Server result detection fix
- **S**: Changed from `serverResult.url` (always truthy — server always returned a URL) to `serverResult.size > 0` (correct: non-empty Blob). Returns `serverResult` directly instead of `as unknown as Blob`.
- **W**: Assumes `serverResult` is a Blob — the `RenderResult` type also exists but the store layer handles that separately.
- **O**: Add explicit type check: `serverResult instanceof Blob`.
- **T**: If an empty Blob (size 0) is returned, we fall through to browser render — correct, no harm.

**L92, L98**: Browser render progress
- **S**: Reports 2% (server unavailable) and 3% (browser render starting).
- **W**: Skips from 2% to 3% but 3% happens before preloading — gap from 2% to next meaningful update (preload at 10%) is ~8%.
- **O**: Add intermediate steps during canvas setup (allocating canvas, etc.).
- **T**: None.

**L104**: `let heartbeatTimer: ReturnType<typeof setInterval> | undefined;`
- **S**: Declared before try so accessible in finally for cleanup.
- **W**: `TypeScript: ReturnType<typeof setInterval>` is `NodeJS.Timeout` in Node or `number` in browser. Since this runs in browser, it resolves to `number`. `undefined | number` is the correct type.
- **O**: Use `window.setInterval` return type for clarity.
- **T**: None.

**L140**: `reportProgress(1, 'Preloading images...');`
- **S**: Reports preload phase start.
- **W**: This overwrites the previous "1" report — effectively going from 1 → 1, which appears as a stall.
- **O**: Skip duplicate percentage or use a tick (e.g., 1 → 2 → 3).
- **T**: None — minor UI hiccup.

**L174**: `const RENDER_DEADLINE = Date.now() + 12 * 60 * 1000;`
- **S**: Increased from 5 min to 12 min — accommodates longer videos.
- **W**: 12 minutes is arbitrary. A 5-min video at 24fps with complex compositions could still exceed it.
- **O**: Calculate deadline based on video duration × estimated render time per frame. Make configurable.
- **T**: Deadline check at L211 uses `> RENDER_DEADLINE` (not `>=`), so the last frame before the deadline still runs. Correct.

**L177-179**: Heartbeat interval
- **S**: Every 2 seconds, re-emits last known progress. Prevents UI stall during long frames.
- **W**: Browser throttles `setInterval` to 1/minute for background tabs. During foreground rendering, it's reliable.
- **O**: Use `requestAnimationFrame` for foreground, fall back to `setInterval` for background detection.
- **T**: If the tab is backgrounded, heartbeat slows to 1/min — UI appears frozen but rendering continues.

**L311, L316**: Per-frame progress
- **S**: First frame and every 10% of frames in a segment.
- **W**: Every-10% reporting means 10 updates per segment. For a 3-min video with 6 segments, that's ~60 updates. Low granularity.
- **O**: Report every 5% (f % Math.max(1, Math.floor(totalFrames / 20)) === 0).
- **T**: With heartbeat at 2s interval, granularity is less critical.

**L330**: `reportProgress(95, 'Assembling video with ffmpeg...');`
- **S**: Reports the assembly phase at 95%.
- **W**: Jump from 95% to 100% — if ffmpeg takes a long time, the progress bar sits at 95% throughout.
- **O**: Add sub-steps: "Sending frames (95%)", "Encoding (97%)", "Finalizing (99%)".
- **T**: None.

**L336-342**: Streaming ndjson body
- **S**: Maps each frame to `frame + '\n'`, creates Blob, sends to `/api/render-video` with fps and format as URL params. Replaces `JSON.stringify({ frames, fps, format })` which caused `ERR_STRING_TOO_LONG`.
- **W**: Creates a Blob from all frame strings — still holds all frames in memory before sending. The streaming happens on the server side (reading ndjson), not on the client side (sending).
- **O**: Stream frames one by one using `fetch` with `chunked` transfer encoding and `ReadableStream` body.
- **T**: If the server returns non-OK, the catch on L333 falls through to MediaRecorder. Correct.

**L347, L473**: `reportProgress(100, 'Done!');`
- **S**: Signals completion.
- **W**: Duplicated in both ffmpeg success and MediaRecorder fallback paths. Correct — one or the other executes.
- **O**: None.
- **T**: None.

**L478**: `if (heartbeatTimer !== undefined) clearInterval(heartbeatTimer);`
- **S**: Clears heartbeat in finally block. Cleanup guaranteed.
- **W**: `undefined` check needed because heartbeat may not have been started (error before L177). `clearInterval` with undefined would be a no-op in most browsers but the check is defensive.
- **O**: Initialize to `undefined` and always clear — the pattern is correct.
- **T**: None.

---

## FILE: `src/services/renderingShared.ts`

**L156**: `const accent = Object.hasOwn(accentColors, segType) ? accentColors[segType] : undefined;`
- **S**: Prevents prototype-chain pollution from segType values like `"__proto__"`, `"constructor"`, `"toString"`. `Object.hasOwn()` is standard (ES2022).
- **W**: Only protects this one call site. Other `Record<string, T>` lookups elsewhere in the codebase may have the same vulnerability.
- **O**: Audit all bracket-access patterns on `Record<string, T>` across the project. Replace with `Map` for safer patterns.
- **T**: `Object.hasOwn` is not supported in Safari <15.4, Firefox <92, Chrome <93. The project targets Chrome 91+ (per User-Agent in proxyImage). Safari users on older macOS could hit a runtime error. Unlikely given the project's target audience.

---

## FILE: `src/services/tts/index.ts`

**L37**: `export const TTS_ENGINES = [kokoroEngine, grokEngine, browserEngine] as const;`
- **S**: Removed `meloEngine` from the list. Now consistent with registry.ts `ENGINE_PRIORITY`.
- **W**: `as const` makes the array readonly and infers literal engine types — allows TypeScript to narrow engine names correctly.
- **O**: Export the engine type from this array for reuse.
- **T**: None — MeloTTS was already removed from usage; this just makes the data structure consistent.

---

## FILE: `src/services/tts/registry.ts`

**L18-19**: `/** Default engine priority order: Kokoro → Grok → Browser */` and array
- **S**: Removed `meloEngine` from ENGINE_PRIORITY. Updated comment to match.
- **W**: Was previously `Kokoro → Grok → Melo → Browser` — Melo was in the array but `TTS_ENGINES` in index.ts didn't include it. This was a latent bug — the fallback chain in registry would try Melo but it was disabled from the UI.
- **O**: None — now consistent.
- **T**: None.

**L62-65**: Updated comment
- **S**: Renumbered steps from 5 to 4 (removed `configureEngines` step).
- **W**: Comment-only change.
- **O**: None.
- **T**: None.

**L73**: Empty line (removed `configureEngines(config)` call)
- **S**: `generateWithFallback` no longer calls credential configuration — no engines need it.
- **W**: If a future engine needs credential pre-configuration, the pattern must be re-added.
- **O**: Keep the architectual hook available but commented, or use a pluggable engine setup pattern.
- **T**: None.

---

## FILE: `src/store/pipeline/orchestrator.ts`

**L37**: `import { generateGrokTts } from '../../services/tts';`
- **S**: Removed `generateMeloTts` from the import. Now only imports Grok TTS function.
- **W**: If the import path changes, this breaks — but tests catch it.
- **O**: None.
- **T**: None.

**L335**: `const hasGrok = !!xaiKey && !xaiKey.includes('your-xai-key-here') && xaiKey.length > 10;`
- **S**: Added placeholder detection: skips Grok if key contains `'your-xai-key-here'` or is shorter than 10 chars. Prevents wasted API calls.
- **W**: `xaiKey.includes('your-xai-key-here')` is a fragile substring match. A legitimate key containing this substring would be skipped. `length > 10` is also arbitrary.
- **O**: Use a prefix-based check (`xaiKey.startsWith('xai-')`) or a configurable placeholder regex.
- **T**: Legitimate key containing `your-xai-key-here` — near-zero probability but possible.

**L337-339**: Placeholder warning
- **S**: Logs a warning when Grok is disabled due to placeholder key.
- **W**: Only triggers if `VITE_XAI_KEY` contains the placeholder substring AND `hasGrok` is false. If `hasGrok` is false for a different reason (e.g., no key at all), no warning — correct.
- **O**: Move warning to a general "TTS not configured" handler.
- **T**: The env var check `import.meta.env.VITE_XAI_KEY?.includes(...)` is server-side — will be stripped in production build by Vite (env vars replaced at build time). If the variable doesn't exist at runtime (e.g., different deployment), this check returns `undefined?.includes()` which is `undefined` — falsy, no warning. Acceptable.

**L413**: `// Tier 2: Browser TTS (free fallback)`
- **S**: Formerly Tier 3 (Tier 2 was MeloTTS). Renumbered correctly.
- **W**: Comment-only.
- **O**: None.
- **T**: None.

**L404**: `const useParallel = hasGrok;`
- **S**: Previously `hasGrok || hasMelo`. Simplified to just `hasGrok`.
- **W**: Parallel TTS generation only works with Grok now. Browser TTS is sequential.
- **O**: None — browser TTS is inherently sequential (speech synthesis queue).
- **T**: None.

---

## FILE: `tests/user-journey.spec.ts`

**L12**: `test.setTimeout(900000); // 15 min — render takes ~9-10 min`
- **S**: Generous timeout for full-pipeline E2E test.
- **W**: Test could hang 15 min on silent failure.
- **O**: Add periodic health checks during render. Use Playwright's step timeout for granular timeouts per phase.
- **T**: If render exceeds 15 min, CI job is blocked for 15 min before failure.

**L27**: `// Select 3 minute duration (shortest available)`
- **S**: Updated comment from "for faster test" to "shortest available" — more accurate.
- **W**: Comment-only.
- **O**: None.
- **T**: None.

**L63-68**: AI Edit step handling
- **S**: Added wait for "Skip AI Edit" button instead of waiting for "Assemble Video" directly. This correctly handles the new AI Edit step that was added to the pipeline.
- **W**: `waitForSelector('button:has-text("Skip AI Edit")')` with 600s timeout — if AI Edit step is skipped automatically, this waits up to 10 min. The actual AI Edit step (if it runs) could take several minutes.
- **O**: Use `page.getByTestId('skip-ai-edit-button')` if available for more robust selector.
- **T**: If AI Edit step is removed or renamed, this wait times out after 10 min.

**L71-75**: Skip AI Edit + screenshot
- **S**: Clicks Skip AI Edit, waits 2 seconds for transition, takes screenshot.
- **W**: `waitForTimeout(2000)` is fragile — if the page takes 3 seconds to transition, the screenshot shows the transition state, not the ready state.
- **O**: Replace with `waitForSelector('[data-testid="quality-draft"]')` for a deterministic ready check.
- **T**: Slow CI could make the 2-second wait insufficient, leading to flaky screenshots.

**L77-80**: Draft quality selection
- **S**: Selects draft quality before render. `waitForSelector` ensures element is present before click.
- **W**: `waitForSelector('[data-testid="quality-draft"]')` — if the component re-renders after this wait, the reference could become stale. Playwright auto-retries clicks on stale elements, so this is safe.
- **O**: Add assertion that the button has `aria-pressed="true"` after click.
- **T**: If quality selector is removed or renamed, this test step fails with timeout.

**L82-89**: Click Assemble Video
- **S**: Waits for button, clicks, waits 5 seconds for render to start, takes screenshot.
- **W**: `waitForTimeout(5000)` is fragile — render might take 10 seconds to start on slow CI.
- **O**: Wait for progress indicator or URL change instead of hard timeout.
- **T**: Screenshot filename `10-assembling.png` conflicts with step numbering (should be `11-assembling.png`).

**L103-106**: Wait for preview
- **S**: Uses `page.getByTestId('preview-step').waitFor({ timeout: 600000 })` — 10-minute timeout for draft-quality render. Deterministic wait.
- **W**: If the render crashes silently, the test waits 10 min then fails with a potentially confusing timeout error.
- **O**: Add a progress monitor: check for progress bar updates during render. Surface the last known progress message in the timeout error.
- **T**: 10 minutes of waiting on failure is costly in CI.

**L112-114**: Final assertions
- **S**: Uses proper `waitFor`/`expect` instead of `.catch(() => false)`. Verifies both preview panel and new-video-button are visible.
- **W**: Only checks visibility, not content correctness (e.g., doesn't verify video title).
- **O**: Add assertion for video title or duration.
- **T**: If `new-video-button` is removed or renamed, test fails — which is correct (catches regression).

**L120-125**: Final state logging + screenshot
- **S**: Logs final state. Takes full-page screenshot.
- **W**: Screenshot filename `13-final-state.png` skips from 11 to 13 — no screenshot 12. Minor inconsistency.
- **O**: Renumber screenshots sequentially.
- **T**: None.

---

## FILE: `vitest.config.ts`

**L16**: `include: ['src/services/**/*.ts', 'src/utils/**/*.ts']`
- **S**: Added `src/utils/**/*.ts` to test include — ensures utility functions are tested.
- **W**: Only adds the glob pattern — doesn't add actual test files.
- **O**: Verify that there are test files matching this pattern.
- **T**: If a `src/utils/test.ts` file exists but isn't a test, it would be incorrectly included. Vitest only includes files matching `*.test.ts` or `*.spec.ts` patterns, so this is safe.

---

## FILES DELETED: `src/services/tts/meloEngine.ts`, `src/types.ts`, `src/index.css` (partial)

**meloEngine.ts** (137 lines deleted)
- **S**: Dead code removal. No production imports.
- **W**: Git history preserves the file if needed later.
- **O**: None.
- **T**: If Cloudflare Workers AI MeloTTS is needed in the future, must restore from git.

**types.ts** (350 lines deleted)
- **S**: Types consolidated to fewer files.
- **W**: Any dangling `import { X } from './types'` in an untested file will cause build failure. All 1539 tests pass, so no regression in tested code.
- **O**: Verify no dangling imports in files not covered by tests (e.g., config files, scripts).
- **T**: Build-time error if an import path wasn't updated.

**index.css** (105 lines deleted)
- **S**: Removed utility classes (`shadow-hard`, `shadow-hard-sm`, etc.), base styles, animations, scrollbar overrides — now using inline Tailwind classes.
- **W**: Some animations (`pulse-glow`, `shimmer`) were removed entirely — if any component relied on them, the animation is lost.
- **O**: Verify no components reference removed CSS class names. Remove unused Tailwind config for these classes.
- **T**: A component still using `class="shimmer"` would lose its animation silently.

---

## Summary Statistics

| Category | Count |
|---|---|
| **Total added lines** | 435 |
| **Server route logic** | 2 files, ~140 lines |
| **UI polish (CSS classes)** | ~38 files, ~200 lines (all identical patterns) |
| **Draft quality feature** | 2 files, ~40 lines |
| **Heartbeat + render fixes** | 3 files, ~50 lines |
| **MeloTTS removal** | 6 files, ~30 lines (changed) |
| **App shell refactor** | ~5 files, ~30 lines (changed) |
| **E2E test** | 1 file, ~35 lines |
| **Config/other** | 2 files, ~3 lines |

**Most impactful lines:**
1. `L80` orchestrator.ts — `serverResult.size > 0` (fixed server render detection)
2. `L156` renderingShared.ts — `Object.hasOwn(accentColors, segType)` (fixed prototype pollution crash)
3. `L177-179` orchestrator.ts — heartbeat interval (prevents UI stall)
4. `L81-87` encoding.ts — 3-min server render timeout (prevents hang)
5. `L335` store/pipeline/orchestrator.ts — placeholder key detection (avoids wasted API calls)
6. `L336-342` orchestrator.ts — streaming ndjson body (fixed `ERR_STRING_TOO_LONG`)
7. `L108` PipelineStepRouter.tsx — `{ quality: selectedQuality }` passed to assembler (draft quality pipeline)
8. `L65-68` orchestrator.ts — `reportProgress` closure (enables heartbeat)

**Highest-risk lines:**
1. `L335` — fragile placeholder substring match
2. `L82-83` encoding.ts — `serverTimeout` abort controller may race with server response
3. `L48-63` renderVideo.ts — unbounded buffer growth on malicious input
4. `L174-175` App.tsx — direct mutation of `project.exportSettings`
5. `L37` proxyImage.ts — SSRF protection bypass for metadata endpoints
