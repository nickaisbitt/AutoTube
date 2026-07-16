# Release aggregate — wave 2 chain (2026-07-16)

**Branch:** `cursor/generator-incredible-b040`  
**Commits:** `3d7d7de` (body flashes, junk rejection) → `742ca5f` (grace no-reload) → `d494882` (everSawGenerating)  
**Protocol:** dev×2 + release×24 cold eval, independent judge `google/gemini-2.5-flash`  
**Log:** `/tmp/eval-full-chain-2.log`

## Aggregate (26 topics, first-pass + eval retry)

| Metric | Bar | Wave 2 | Status |
|--------|-----|--------|--------|
| Generate | ≥95% | **65.4%** (17/26) | FAIL |
| Critical | ≤25% | **5.9%** (1/17 watched) | PASS |
| Upload-ready | ≥50% | **5.9%** (1/17) | FAIL |
| Raw median | ≥7.2 | **6.3** | FAIL |

## Generate failures (9 topics)

| ID | Notes |
|----|-------|
| dev-02 | SCRIPT_TIMEOUT — port strike topic |
| rel-03 | SCRIPT_TIMEOUT @ 305s (pre-grace reload era in slice 0-5) |
| rel-05, rel-06 | SCRIPT_TIMEOUT @ 305s |
| rel-07, rel-10, rel-13, rel-17 | 600s grace exhausted; eval retry also failed |
| rel-16 | Generate failed (no video) |

**Retry pass:** `node scripts/retry-eval-failures.mjs` running with `d494882` → `/tmp/eval-retry-wave2.log`

## Upload pass

| ID | Raw | Upload |
|----|-----|--------|
| rel-08 | 7.0 | ✓ |

Only 1/17 upload-ready. Dominant pattern: raw 5.8–6.6, generic B-roll, weak hooks.

## Critical

| ID | Raw | Issue |
|----|-----|-------|
| rel-19 | 4.2 | Critical after retry (podcast misconduct topic) |

Critical bar passes at 5.9% but upload/raw remain primary blockers.

## Slice breakdown

| Slice | Generate | Upload | Critical | Raw med |
|-------|----------|--------|----------|---------|
| dev×2 | 50% | 0% | 0% | 6.6 |
| rel 1–6 | 50% | 0% | 0% | 6.6 |
| rel 7–12 | 67% | 25% | 0% | 6.3 |
| rel 13–18 | 50% | 0% | 17%* | 6.4 |
| rel 19–24 | 100% | 0% | 17%* | 5.9 |

\*Slice critical inflated by rel-19 only in watched set.

## Verdict

**Not release-ready.** Critical ≤25% holds; generate reliability, upload-ready, and raw median all fail. Script wait improvements help (no reload abort; eval retry rescues rel-18/19/22) but 9 topics still fail generate on first pass+retry.

## Next ranked fixes

1. **Generate:** OpenRouter script timeout — consider longer hard cap or server-side script poll without UI dependency
2. **Upload/raw:** Stronger beat-vision rejection, topic-specific hook stakes, reduce soft-pass volume padding
3. **rel-19 critical:** Read `WATCH_REPORT.md` for podcast overlay/stock pattern
