# Cold eval B5 results + provisional release bars

**Run:** `eval-dev-2026-07-15T04-08-09-271Z`  
**Flags:** `AUTOTUBE_EVAL_COLD`, `AUTOTUBE_VISUAL_BEATS=1`, `AUTOTUBE_BEAT_VISION=1`, flash off  
**Commit at start:** `6d42c1e` (beat timeline `71a92e4` landed mid-run; Node timeline picks up on next eval)

## Aggregate (dev × 6, first-pass, blind)

| Metric | Value |
|--------|-------|
| Generate success | 100% |
| Upload-ready | **16.7%** (1/6) |
| Critical issues | **83.3%** (5/6) |
| Raw mean / median | 6.77 / **6.8** |
| Raw p25 / p75 | 6.25 / **7.2** |
| Raw min–max | 6.0 – 7.6 |

### Per topic

| Id | Raw | Upload | Critical |
|----|-----|--------|----------|
| dev-01 school ransomware | 6.0 | no | yes |
| dev-02 port strike/hack | 7.2 | no | yes |
| dev-03 fertility Telegram | 6.2 | no | yes |
| dev-04 coral restoration | 7.2 | no | yes |
| dev-05 library fines | 6.4 | no | yes |
| dev-06 Olympic forged tests | 7.6 | **yes** | no |

## vs prior n=2 beats-only peek

Earlier n=2 looked better (50% upload / 0% critical). **Full n=6 invalidates that optimism** — use this table as the honest baseline, not the lucky pair.

## Provisional bars (from observed percentiles — not invented TARGET 8)

### Improvement detection (must beat this baseline on same protocol)
- `uploadReadyRate` > **0.167**
- `criticalRate` < **0.833**
- `raw.median` > **6.8**

### Release-candidate (stretch, calibrated to ≥ baseline p75 + critical cut)
- `uploadReadyRate` ≥ **0.50**
- `criticalRate` ≤ **0.25**
- `raw.median` ≥ **7.2** (baseline p75)
- `raw.p25` ≥ **6.5**

Do **not** claim readiness until release-set cold eval meets release-candidate bars.

## Next (Phase C)
Cold `eval:unseen --set release --max 6` (affordable 6/24 slice), then expand if cost allows.
