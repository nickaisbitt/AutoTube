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

**Not release-ready.** Critical ≤25% holds at merged **13.6%** (rel-10/16/19 on retry watches); generate **88.5%** after retry; upload **9.1%** (rel-08, rel-13); raw **6.4**.

## dev×2 wave-3 sensor (`f3fe632`, 2026-07-16T18:43)

| Metric | Result | Bar |
|--------|--------|-----|
| Generate | **100%** (2/2) | — |
| Critical | **0%** | PASS |
| Upload | **0%** | — |
| Raw median | **6.2** | — |

**dev-02** (port strike) now generates on first pass with `everSawGenerating` script wait — was a persistent failure through wave 2.

## release×6 wave-3 slice 0–5 (`f3fe632`, 2026-07-16T19:16)

| Metric | Result |
|--------|--------|
| Generate | **100%** (6/6) — rel-03, rel-06 fixed |
| Critical | **0%** |
| Upload | **0%** |
| Raw median | **6.2** |

Remaining slices 6–23 running → `/tmp/eval-release-wave3-rest.log` (`eval-retry-2026-07-16T17-10-02-195Z`)

| Metric | First pass | + Retry | Bar |
|--------|------------|---------|-----|
| Generate | 65.4% | **88.5%** (23/26) | ≥95% FAIL |
| Upload | 5.9% | **9.1%** (2/22) | ≥50% FAIL |
| Critical | 5.9% | **13.6%** (3/22) | ≤25% PASS |
| Raw median | 6.3 | **6.4** | ≥7.2 FAIL |

**Retry rescued:** rel-05, rel-07, rel-10, rel-13 (raw **7.2**, upload pass), rel-16, rel-17  
**Still fail generate:** dev-02, rel-03, rel-06

## Upload passes (merged)

| ID | Raw | Source |
|----|-----|--------|
| rel-08 | 7.0 | wave2 |
| rel-13 | 7.2 | retry |

## Next fixes (`ceb9ff7`+)

- Podcast/observatory/gene-therapy hook overlays (rel-19 critical driver)
- Tighter cold relevance (0.30) + filtered volume padding merge
- Stricter motion soft-pass (2.5 v/seg cold)
- Camera/ultrasound junk rejection in harvest
