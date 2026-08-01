# AutoTube — Remaining Work

Last updated: 2026-08-01 — branch `cursor/fix-audit-blockers-b466`.

## Done on this branch (code / honesty)

1. Multi-model audit ship-blockers fixed (harvest fail-closed, A/V sync, auth, SSRF pin, watcher exit codes, deploy/server deleted, sprawl cut, espeak TTS fallback, API key plumbing, etc.).
2. `npm run dod:check` — green (no stale deploy/server, server-render sync OK).
3. `npm run lint` + unit suite green on latest harvest/filter commits.
4. **Real `generate:video`** succeeded at least once (airline topic → `FINAL-VIDEO-final.mp4`, ~70.7s / 22.66 MB) with Archive-only harvest + espeak narration.
5. **`watch:video` honesty** — exits **1** when not upload-ready (fixture raw 4.0; real generate raw **5.4**). Gates use raw scores; hook self-attest removed.

## Still open (needs keys / prod — not more floor-lowering)

6. **Upload-ready ≥7 / brutal ≥7** — not met on Archive-only VM (no `PEXELS_API_KEY` / `PIXABAY_API_KEY` in `.env.local`). Stricter junk filters (medical clickbait, carriers, tickers) correctly reject bad clips but leave keyless pools thin → intermittent `HARVEST_VOLUME_FAIL`. **Next step:** add stock API keys, re-run `generate:video` + `watch:video`, optionally `loop:video --until-score 7`.
7. **Prod deploy currency** — `railway:completion-check` needs `RAILWAY_API_TOKEN` from a machine that can deploy GHCR.
8. Optional 9.3 stretch — only after ≥7 is real on cold topics.

## Commands

```bash
npm run dod:check
npm run generate:video -- "Your topic"   # needs OPENROUTER + preferably Pexels/Pixabay
npm run watch:video -- test-recordings/FINAL-VIDEO-final.mp4
```
