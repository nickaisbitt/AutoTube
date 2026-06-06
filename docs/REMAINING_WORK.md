# AutoTube — Remaining Work (numbered)

Last updated: 2026-06-06. Use item numbers in chat ("fix 3", "do 7").

## A — Deploy / prod (blocking latest code)

1. **Prod is behind local HEAD** — health shows `6c11d39`; master is `0dbcd0c` (editPlan timing + loop syntax). Run canonical deploy from your Mac:
   ```bash
   gh workflow run ghcr-image.yml && gh run watch --exit-status
   npm run deploy:railway:registry:pull
   npm run railway:completion-check
   ```
2. **Railpack `npm run deploy:railway` still hangs** at Railway "uploading snapshot" after Vite. Use GHCR path (item 1) until Railway fixes Metal/snapshot.
3. **Rotate Railway API token** if it was ever pasted in chat; update Cursor secret `RAILWAY_API_TOKEN`.

## B — Codebase bug sweep (15 items) — DONE

4. All 15 bugs in `.kiro/specs/codebase-bug-sweep/bugfix.md` are fixed on master (store, PreviewStep, media, aiEditor, renderer). See store/orchestrator tests + `usePlayback.editPlan.test.ts`.

## C — Pipeline reliability (5 items) — MOSTLY DONE

5. **Narration scaling** — Browser-only path uses per-segment estimates + parallel Grok/Melo batches; Playwright uses 10–15 min timeouts (`generate-full-video.mjs`). Server TTS (edge-tts) is prod path for renders.
6. **Assembly progress** — `orchestrator.ts` reports "Connecting to render server", per-image preload (`Preloading image N/M`), browser fallback messages.
7. **Script step UI** — `ScriptStep.tsx` rotates `SCRIPT_STATUS_MESSAGES` every 3s while processing.
8. **Media step UI** — `MediaStep/ProcessingView.tsx` shows beat labels, segment names, rotating status.
9. **Remaining** — Record a fresh browser journey after prod deploy to confirm dead-frame % dropped.

## D — Video quality (225 checklist items) — OPEN

10. **Thumbnail / packaging** — Concepts exist in code; need real OpenRouter runs + human pick (not fixture-only).
11. **Hook / retention** — `hookValidator`, shock hooks in YouTube mode; still need loop:video scores ≥7 on prod.
12. **B-roll / harvest** — Real harvest works with keys; bad Vimeo/YouTube clips still need stricter pre-probe (partial fix in `generate-full-video.mjs` sanitization).
13. **9.3 brutal watcher target** — `npm run loop:video -- --until-score 9.3` (needs `OPENROUTER_API_KEY` + dev server).

## E — Tests / CI

14. **Audio module integration tests** — Skip when `ffmpeg`/`lavfi` unavailable (CI agents without ffmpeg). Run on Railway prod or Mac with ffmpeg for full coverage.
15. **Flaky MediaStep spinner test** — May fail under parallel vitest; passes in isolation.
16. **E2E full pipeline** — `npm run test:e2e:full` (~30 min); run after prod deploy.

## F — Definition of done (103%)

17. `npm run railway:completion-check` exit 0 (prod image tag = local `git rev-parse HEAD`).
18. `npm run railway:smoke` pass.
19. `npm run test:unit` — 1741/1741 (or audio suite skipped without ffmpeg).
20. `npm run test:e2e:smoke` — 3/3.
21. One real-topic video: `OPENROUTER_API_KEY=... npm run generate:video -- "Your topic"`.
22. `npm run watch:video` — brutal ≥7, hook pass, upload-ready YES.
23. Optional: `npm run loop:video -- --until-score 9.3`.
