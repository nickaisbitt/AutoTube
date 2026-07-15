# Cold eval wave 4 — beat vision + sentence-aligned timeline

**Commit:** `21d2a0b`  
**Branch:** `cursor/generator-incredible-b040`

## Code changes (this wave)

1. **Cold eval harness** forces `AUTOTUBE_BEAT_VISION=1`, `visualBeats` + `beatVision` in `coldFixState()`
2. **Playwright sessionStorage** injects `autotube_eval_cold=true` and beat vision; overrides loop-fast vision block
3. **Timeline quarantine** — housing/nursing score boosts disabled when `AUTOTUBE_EVAL_COLD=1`
4. **Semantic beat placement** — `beatAtSegmentTime()` uses `sentenceIndex` + narration proportion (not even spacing)
5. **Intro/outro reuse** — segment-local URL reuse so hook clips do not block outro face picks

## Sensor run

```bash
npm run eval:unseen -- --set dev --max 2   # quick sensor
npm run eval:unseen -- --set dev --max 6   # calibration
npm run eval:unseen -- --set release --offset 0 --max 6  # release slice
```

Judge: independent `google/gemini-2.5-flash` when `AUTOTUBE_WATCH_MODEL` unset (cold default).

## Release bars (from calibration)

| Metric | Bar |
|--------|-----|
| Generate success | ≥95% |
| Critical rate | ≤25% |
| Upload-ready (blind) | ≥50% |
| Raw brutal median | ≥7.2 |

## Prior aggregate (18 topics, pre-wave-4)

See `eval/RELEASE-AGGREGATE-18.md` — critical **41.2% FAIL**, upload **58.8% PASS**.

## Sensor results — `e75e233` hook scene cuts

| Topic | Generate | Raw | scene_hook | Critical |
|-------|----------|-----|------------|----------|
| dev-01 | OK | 6.4 | **PASS** (2.2s) | yes* |
| dev-02 | FAIL | — | — | — |

\*False positive: verdict "scroll past within 10–15 seconds" — fixed in `58d6893`.

## Sensor results (pending) — `58d6893`

