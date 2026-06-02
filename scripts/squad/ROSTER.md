# AutoTube Real-Pass Squad (17 agents)

## Manager — Agent M0
**Role:** Assign tasks, resolve conflicts, track deliverables, gate merge on 7-point Real Pass.  
**Reports to:** PR #17 branch `cursor/video-quality-pipeline-dbd4`

## Specialists (15 failure points)

| ID | Owner | Mission |
|----|-------|---------|
| A1 | E2E Product | Full UI/cli path topic→MP4 (not fixture-only) |
| A2 | Duration | Output duration matches script sum (±10%) |
| A3 | TTS | Reliable narration: Kokoro/env, edge-tts, no silent segments |
| A4 | Encode | Auto CPU fallback when NVENC/VAAPI fails |
| A5 | ffmpeg | ffmpeg scope + cleanup on root & deploy renderers |
| A6 | Visuals | ≥90% image preload; reduce gradient fallback |
| A7 | Music | Ship `public/audio/*.aac`; wire musicPreset mux |
| A8 | Hook | Cold-open + hook packaging in server render |
| A9 | Gates | Quality gates block export; fix AI reviewer inflation |
| A10 | E2E CI | Playwright full journey + file assertions |
| A11 | Signals | No success on 0-byte; exit codes + size checks |
| A12 | Mocks | Robust OpenRouter mock routing (E2E) |
| A13 | Viral PKG | Wire thumbnail concepts + title variants to pipeline |
| A14 | Ops | save-project path contract; deploy sync |
| A15 | Checklist | Automate top P0 gates from quality bugfix spec |

## Real Pass — Agent R7
**Role:** Implement `scripts/verify-real-pass.mjs` enforcing all 7 acceptance criteria.  
**Run:** `npm run verify:real-pass` (exit 0 = merge gate green)  
**Docs:** [`R7-real-pass.md`](./R7-real-pass.md) — checklist, env vars, example output

## Seven-point Real Pass (R7 enforces)

1. Full pipeline → `-final.mp4` ≥ 3 min (or configured target)
2. No silent TTS segments
3. CPU-safe encode (no broken NVENC default)
4. ≥90% images loaded
5. Background music muxed when enabled
6. E2E/verify script: size + duration assertions
7. Export blocked when blind review / gates fail (configurable)
