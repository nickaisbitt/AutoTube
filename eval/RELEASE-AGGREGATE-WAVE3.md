# Release aggregate — wave 3 (2026-07-16)

**Branch:** `cursor/generator-incredible-b040`  
**Baseline commit for slices:** `f3fe632` / `2567a41` (pre script-idle + padding/hooks soft-pass fix)  
**Fix commit after baseline:** `803ea69` (P0–P3 — not measured in this aggregate)  
**Protocol:** release×24 cold first-pass, independent judge `google/gemini-2.5-flash`

## Aggregate (24 topics)

| Metric | Bar | Wave 3 | Status |
|--------|-----|--------|--------|
| Generate | ≥95% | **62.5%** (15/24) | FAIL |
| Critical | ≤25% | **0%** (0/14 watched) | PASS |
| Upload-ready | ≥50% | **0%** (0/14) | FAIL |
| Raw median | ≥7.2 | **6.2** | FAIL |

## Slice breakdown

| Slice | Dir | Generate | Upload | Critical | Raw med |
|-------|-----|----------|--------|----------|---------|
| 0–5 | `eval-release-2026-07-16T19-16-50-081Z` | **100%** | 0% | 0% | 6.1 |
| 6–11 | `eval-release-2026-07-16T20-46-26-145Z` | 83.3% | 0% | 0% | 6.4 |
| 12–17 | `eval-release-2026-07-16T21-54-25-105Z` | 50% | 0% | 0% | 6.2 |
| 18–23 | `eval-release-2026-07-16T22-39-14-787Z` | 16.7% | 0% | 0% | 6.4 |

Generate collapsed in later slices (likely OpenRouter 30s abort + hard-cap burn — addressed in `803ea69`).

## Generate failures

rel-11, rel-14, rel-15, rel-17, rel-19, rel-20, rel-21, rel-22, rel-24

## Verdict

**Not release-ready.** Critical bar holds at 0%. Upload/raw stuck at 0% / 6.2. Generate unreliable on later slices under pre-fix waiter.

## Sensor wave-4 @ `c77e5e1` / `127cfb9` (after P0–P3)

| Suite | Generate | Upload | Critical | Raw med | Notes |
|-------|----------|--------|----------|---------|-------|
| wave4a (0.30 relevance) | ~17% | 0% | 0% | — | HARVEST_VOLUME_FAIL |
| wave4b | 50% release | 0% | 0% | 6.4 | |
| wave4c (0.28 relevance) | 66.7% release | 0% | 25% | 6.4 | rel-03 raw 6.8 |
| **wave4d** (`127cfb9`) | 50% | **dev-02 upload** | 0% | **dev-02 raw 7.4** | first upload since wave2 |

**Signal:** port-strike topic (dev-02) hit **raw 7.4 / upload-ready** on first pass after hooks + padding fix. Release slice still raw ~6.4 with HARVEST_VOLUME_FAIL on thin pools.

Logs: `/tmp/eval-sensor-wave4d.log`
Dirs: `eval-dev-2026-07-17T02-20-26-763Z`, `eval-release-2026-07-17T02-37-15-364Z`
