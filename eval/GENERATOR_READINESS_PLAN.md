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

## Remaining (execute in order — no pause-for-permission)

### Phase B — Measure (sensors only)
5. Full cold **dev×6** with beats + ranking + beat vision
6. If A/B still weak on critical/stock: ship Whisper-aligned semantic timeline (bounded), then re-run same 6
7. Calibrate only after B5: set provisional release bars from observed percentiles (document, don’t invent)

### Phase C — Release gate
8. Cold **release×24** once (or max affordable subset if cost-bound), blind watcher, report only raw/upload/critical
9. Independent judge model env (`AUTOTUBE_WATCH_MODEL`) if available — else document same-model limitation

## Stop conditions
- Do not open new quality-integration side quests
- Do not run keep-best / housing pack loops as readiness
- After each code phase: commit + push + cold sensor run before claiming progress
