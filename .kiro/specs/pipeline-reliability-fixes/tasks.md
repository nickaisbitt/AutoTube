# Pipeline Reliability Fixes — Tasks

## Tasks

- [x] 1. Fix narration timeout for multi-segment scripts
  - [x] 1.1 In `src/store.ts` `generateNarration`, replace the fixed 90ms per-segment delay with a word-count-scaled delay: `Math.max(50, Math.min(200, wordCount * 0.5))` ms per segment
  - [x] 1.2 Add smooth intra-segment progress interpolation in `generateNarration` so progress updates are emitted more frequently (e.g., sub-steps within each segment iteration)
  - [x] 1.3 Add a progress message showing the current segment name and word count during narration generation (e.g., `Generating narration for "Introduction" (142 words)...`)
  - [x] 1.4 Write unit test in `src/services/__tests__/narration.test.ts` verifying that `generateNarration` produces exactly N clips for scripts with 1, 5, 8, 10, and 15 segments
  - [x] 1.5 Write property-based test with fast-check generating random script arrays (1–15 segments, 10–300 words) and asserting clip count equals segment count

- [x] 2. Fix assembly progress gap during server probe and image preloading
  - [x] 2.1 Add `onProgress` parameter to the `preload` function signature in `src/services/videoRenderer.ts`
  - [x] 2.2 Inside `preload`'s batch loop, call `onProgress` after each batch with message `"Preloading image N/M..."` and percentage mapped to the 2–10% range
  - [x] 2.3 In `renderVideoToBlob`, pass the `onProgress` callback to `preload` with appropriate range mapping
  - [x] 2.4 Add progress updates around the `tryServerRender` call in `renderVideoToBlob`: emit `"Connecting to render server..."` at 1% before the call, and `"Server unavailable, preparing browser render..."` at 2% if it fails
  - [x] 2.5 Write unit test in `src/services/__tests__/videoRenderer.progress.test.ts` mocking `tryServerRender` and `preload` to verify `onProgress` is called at least once every 5 seconds during a simulated 20-second probe+preload phase
  - [x] 2.6 Write property-based test generating random image counts (1–20) and verifying `preload` calls `onProgress` at least `ceil(imageCount / batchSize)` times

- [x] 3. Fix dead frames in ScriptStep and MediaStep processing views
  - [x] 3.1 In `src/components/ScriptStep.tsx`, add a `useEffect`-based message rotator that cycles through an array of contextual status messages every 3 seconds when `status === 'processing'` (e.g., "Analyzing topic structure...", "Identifying key narratives...", "Crafting segment transitions...")
  - [x] 3.2 Display the rotating message prominently in the ScriptStep processing view below the progress bar, replacing or supplementing the static `message` prop display
  - [x] 3.3 In `src/components/MediaStep.tsx`, add a similar `useEffect`-based message rotator with media-specific messages (e.g., "Scanning Wikipedia for entity images...", "Querying open-source media libraries...", "Scoring visual relevance...")
  - [x] 3.4 In MediaStep processing view, parse the `message` prop to extract and display the current segment name and beat label dynamically (the store already sends messages like `"[HOOK] Tesla stock chart — harvesting…"`)
  - [x] 3.5 Write unit test in `src/components/__tests__/ScriptStep.test.tsx` rendering ScriptStep with `status='processing'` and using fake timers to verify text content changes after 3-second intervals
  - [x] 3.6 Write unit test in `src/components/__tests__/MediaStep.test.tsx` rendering MediaStep with `status='processing'` and verifying dynamic message display and rotation

- [x] 4. Verify all fixes and run full test suite
  - [x] 4.1 Run `npm run test:unit` to verify all new and existing unit tests pass
  - [x] 4.2 Run `npm run build` to verify no TypeScript or build errors are introduced
