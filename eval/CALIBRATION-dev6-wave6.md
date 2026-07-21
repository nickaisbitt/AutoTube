# Cold dev×6 calibration — wave 6 (`58d6893`)

**Date:** 2026-07-16  
**Branch:** `cursor/generator-incredible-b040`  
**Judge:** `google/gemini-2.5-flash` (independent, cold default)

## Aggregate

| Metric | Result | Bar | Status |
|--------|--------|-----|--------|
| Generate success | **100%** (6/6) | ≥95% | PASS |
| Critical rate | **16.7%** (1/6) | ≤25% | **PASS** |
| Upload-ready | **0%** (0/6) | ≥50% | FAIL |
| Raw median / p25 / p75 | **6.4 / 6.05 / 6.6** | ≥7.2 median | FAIL |

## Per-topic

| ID | Raw | Critical | scene | objective | Notes |
|----|-----|----------|-------|-----------|-------|
| dev-01 | 6.2 | no | PASS | PASS | generic stock |
| dev-02 | 5.8 | no | FAIL (5.6s body) | FAIL | stock / pacing |
| dev-03 | 6.6 | no | FAIL (6.1s body) | FAIL | repetitive camcorder |
| dev-04 | 6.6 | no | PASS | PASS | closest to upload |
| dev-05 | 6.8 | **yes** | FAIL (6.1s body) | FAIL | truncated hook overlay |
| dev-06 | 6.0 | no | PASS | PASS | generic stock |

## Critical sole failure (dev-05)

- Verdict: *"scroll past in 3 seconds"* (legitimate hook-fail signal)
- Hook overlay truncated: `ORDINARY PEOPLE ARE ALREADY PAYING THE`
- Body scene hold 6.1s (addressed in `61309c0`: flashes on all segments)

## Next wave (`61309c0`)

- Micro-flash scene cuts on **all** segments (body holds)
- Body cut cap 2.0s
- Reject band/orchestra junk stock

## Release readiness

Critical bar met on dev×6. Proceed to **release×6 slice** after quick dev×2 sensor on `61309c0`.

Upload bar still open — primary levers: hook overlay fit, stock relevance, raw ≥7.
