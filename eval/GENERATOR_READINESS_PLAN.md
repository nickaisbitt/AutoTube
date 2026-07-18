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
1. **Generate ≥95%** — wave3 first-pass **62.5%** (later slices collapsed); fix `803ea69` (180s LLM + idle reclick) under sensor
2. **Upload ≥50%** + **raw ≥7.2** — wave3 **0%** upload, raw **6.2** (see `eval/RELEASE-AGGREGATE-WAVE3.md`)
3. **Critical ≤25%** — wave3 **0%** PASS

### Wave 3 release×24 (`eval/RELEASE-AGGREGATE-WAVE3.md`)
- Generate 62.5% / upload 0% / critical 0% / raw 6.2
- Slice 0–5 was 100% generate @ `f3fe632`; later slices degraded under 30s LLM abort

### Fix wave `803ea69`–`127cfb9` (P0–P3)
- Script LLM timeout 180s; timeout ≠ user cancel; idle-after-start reclick (≥90s)
- `mergeVolumePadding` uses filtered pad
- Topic stakes overlays (ambulance, loyalty, ferry, …); insurance-family narrowed
- Intro demotes office/camera junk; beat-prefer first 3s
- Soft-pass junk reject removed after it collapsed generate (HARVEST_VOLUME_FAIL)

### Sensor wave4d
- **dev-02 upload-ready raw 7.4** (first post-wave2 upload signal)
- Release 0–5: gen 50%, upload 0%, critical 0%, raw med 6.4
- Remaining: harvest volume reliability + lift release raw to ≥7.2

### Sensor chain-5 @ `eb3455e`+ (topical-first + scene zoom-punch)
- Dev×2: generate **100%**, upload **0%**, critical **50%** (false-positive scroll hedge — fixed in follow-up), raw median **6.8** (was 6.1)
- Scene QA PASS on both (longest ~2.7–2.8s) after zoom-punch under hookSceneCuts
- Port-strike variety still thin (13 unique); topical-first helped school to variety 8
- Release×24 in progress on tip with honesty + junk-title fixes for remaining topics

## Stop conditions
- Do not open new quality-integration side quests as “proof”
- Do not run keep-best / housing pack loops as readiness
- After each code phase: commit + push + cold sensor run before claiming progress
- **Do not claim release-ready** until all four bars pass on held-out first-pass with independent judge
