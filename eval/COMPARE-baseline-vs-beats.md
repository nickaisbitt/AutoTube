# Cold held-out comparison: baseline vs VISUAL_BEATS

**Protocol:** first-pass, `AUTOTUBE_EVAL_COLD`, blind watcher, `--set dev --max 2`, zero retries. Same topics: `dev-01` (school ransomware), `dev-02` (port strike/hack).

| Run | Dir | Flag | Commit |
|-----|-----|------|--------|
| Baseline | `test-recordings/eval-dev-2026-07-15T02-04-17-581Z` | beats off | `af122a6` era |
| Beats | `test-recordings/eval-dev-2026-07-15T02-22-37-293Z` | `AUTOTUBE_VISUAL_BEATS=1` + harvest ranking | `339409a` |

## Aggregate (n=2)

| Metric | Baseline | Beats-on | Δ |
|--------|----------|----------|---|
| Generate success | 100% | 100% | — |
| Upload-ready (blind) | **0%** | **50%** | +50pp |
| Critical issues | **100%** | **0%** | −100pp |
| Raw mean | 6.7 | 7.0 | +0.3 |
| Raw median | 6.0 | 7.0 | +1.0 |
| Raw min–max | 6.0–7.4 | 6.6–7.4 | floor up |
| Wall (~sum) | ~12.6 min | ~10.6 min | not worse |

## Per topic (raw / upload / critical)

| Topic | Baseline | Beats-on |
|-------|----------|----------|
| dev-01 | 6.0 / no / **critical** (beetles, hallway loop) | 6.6 / no / no critical |
| dev-02 | 7.4 / no / **critical** (generic stock) | 7.4 / **yes** / no critical |

## Evidence gate (provisional)

**PASS for continuing the vertical slice** — first-pass cold metrics improved on critical + upload-ready without raw regression or latency blow-up.

Caveats (do not overclaim):
- n=2 only; same-model watcher; not release-set.
- Beats still leave remaining issues (repetitive B-roll, weak faces, dark clips).
- Not keep-best / pack / known-topic proof.

## Next ranked options

1. Expand cold eval to full **dev (6)** with beats on for a stronger signal.
2. Optional multimodal vision top-N on beat candidates (cost/latency trade).
3. Pre-render storyboard / evidence gates before assembly.
4. Narration-aligned semantic timelines (Whisper).
