# Release aggregate — wave 5 (2026-07-18)

**Branch tip during run:** `22511b9` → `0d40d34` (mid-chain honesty/junk/grain fixes)  
**Protocol:** release×24 cold first-pass, independent judge `google/gemini-2.5-flash`  
**Dirs:** `eval-release-2026-07-18T03-27-10-853Z` … `T05-56-53-735Z`

## Aggregate (24 topics, first-pass)

| Metric | Bar | Wave 5 | Status |
|--------|-----|--------|--------|
| Generate | ≥95% | **79.2%** (19/24) | FAIL |
| Critical | ≤25% | **26.3%** (5/19) | FAIL |
| Upload-ready | ≥50% | **21.1%** (4/19) | FAIL |
| Raw median | ≥7.2 | **6.4** | FAIL |

## Upload-ready (raw ≥7, no critical)
rel-05 (7.0), rel-10 (7.0), rel-14 (7.4), rel-19 (7.4)

## Generate failures (SCRIPT_UI_ERROR — truncated LLM JSON)
rel-09, rel-12, rel-17, rel-18, rel-24

## Vs wave 3
| Metric | Wave 3 | Wave 5 |
|--------|--------|--------|
| Generate | 62.5% | **79.2%** |
| Upload | 0% | **21.1%** |
| Critical | 0% | 26.3% |
| Raw median | 6.2 | **6.4** |

## Verdict
**Not release-ready.** Upload path is live (4 topics) but bars still open. Generate reliability hit by OpenRouter JSON truncations (fixed reclick + eval retry after this aggregate). Raw still ~6.4 median — need denser topical variety on the long tail.

## Retry pass (post first-pass, not for release claim)
- rel-09 → raw **7.2** (generate recovered)
- rel-18 → raw 6.4
- rel-12/17/24 still SCRIPT failures (pre reclick fix)
- Follow-up: `d2d9b6e` reclick on JSON fail + SCRIPT_UI_ERROR eval retry
