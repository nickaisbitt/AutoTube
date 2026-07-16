# Generator readiness plan (LOCKED)

**Branch:** `cursor/generator-incredible-b040`  
**Goal:** A generator that is generically excellent on arbitrary topics — measured only by **cold first-pass held-out** eval. Videos are sensors, not trophies.

**Non-goals / do not claim as proof:** keep-best polish, housing packs, family regex, landlord TARGET on known topics, floored scores.

## Done
1. Cold held-out harness + leakage checks (`eval:unseen`)
2. Quarantine packs / family templates / keep-best under eval cold
3. Intent plumbing (`visualNote` → visual director)
4. Bounded VisualBeatSheet + sessionStorage wiring
5. Heuristic beat ranking in harvest
6. Evidence gate n=2: beats improves critical/upload-ready without raw regression → **continue**
7. Multimodal vision top-N per beat (`AUTOTUBE_BEAT_VISION`, budgeted)
8. Pre-render `gateProjectMediaAgainstBeats` before media quality gate
9. Defaults: VisualBeats **ON**; family templates + curated packs **opt-in only**
10. Beat-aware edit timeline (semantic windows via VisualBeatSheet; Whisper caption align already on in cold eval)
11. Cold **dev×6** calibrated (`eval/CALIBRATION-dev6.md`)
12. Cold **release×6** slice (`eval/RELEASE-SLICE-6.md`) — upload/raw pass; critical 33%
13. `AUTOTUBE_WATCH_MODEL` + judge limitation docs (`eval/JUDGE-LIMITATION.md`)
14. Critical-pattern timeline fixes + `--offset`; recheck on release 7–12 (`eval/RELEASE-SLICE-6b.md`) — critical **50%** (still fail)
15. Topic-derived beats replace defensive overlays; recheck on release 13–18 (`eval/RELEASE-SLICE-6c.md`) — critical **40%** (still fail); combined 18 aggregate (`eval/RELEASE-AGGREGATE-18.md`): upload **58.8%** PASS, critical **41.2%** FAIL, raw median **7.4** PASS
16. Independent blind judge wired for cold eval: `resolveWatchModel()` defaults cold runs to `google/gemini-2.5-flash` (distinct from generation) when `AUTOTUBE_WATCH_MODEL` unset; `EVAL_META.json` records `watch` / `watchIndependent` / `watchModelSource`
17. Cold eval beat vision + sessionStorage `autotube_eval_cold` (`21d2a0b`)
18. Timeline quarantine under cold eval (no housing/nursing boosts)
19. Sentence-index semantic beat placement + intro/outro segment-local reuse

## Remaining (next execution wave — no pause)
1. Drive held-out **critical rate ≤25%** (release×24 overnight: **4.5%** PASS; upload **9%** FAIL; raw median **6.4** FAIL)
2. Drive **generate ≥95%** (release×24: **91.7%** — rel-07, rel-22 SCRIPT_TIMEOUT; grace hard-cap fixed)
3. Drive **upload-ready ≥50%** + **raw median ≥7.2** (generic stock rejection + body scene cuts + hook overlay completeness)
4. Re-run cold sensor after fix wave (`824d4fe`+): dev×2 → release×6 slices

### Fix wave (`824d4fe`+)
- Body scene flashes on **every** cut when `AUTOTUBE_HOOK_SCENE_CUTS` (was every 2nd — 6s holds)
- `MAX_BODY_CUT_SEC` 2.0 → 1.25 (match cold `cutIntervalSec: 0.7`)
- SCRIPT_TIMEOUT: cumulative 600s hard cap across grace/reclick/reload (was resetting to 240s)
- Skip generic `buildShockHookLine` templates in hook overlay; clamp drawtext to 8 words
- Beat relevance + timeline: `isGenericStockJunk` for camcorder/corporate/lab/port loops

## Stop conditions
- Do not open new quality-integration side quests as “proof”
- Do not run keep-best / housing pack loops as readiness
- After each code phase: commit + push + cold sensor run before claiming progress
- **Do not claim release-ready** until critical bar + independent judge pass
