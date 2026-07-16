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

## Next measurement

Cold sensor on `803ea69+`:
- script LLM timeout 180s + idle-after-start reclick
- mergeVolumePadding filter fix
- topic stakes overlays + soft-pass relevance/junk gate
