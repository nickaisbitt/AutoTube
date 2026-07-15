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
12. Cold **release×6** slice (`eval/RELEASE-SLICE-6.md`) — improved but critical 33% > 25% bar
13. `AUTOTUBE_WATCH_MODEL` + judge limitation docs (`eval/JUDGE-LIMITATION.md`)

## Remaining (next execution wave — no pause)
1. Cut held-out **critical rate ≤25%** (repetition / dark / face-less hooks)
2. Re-run release slice with independent `AUTOTUBE_WATCH_MODEL`
3. Expand toward release×24 only after (1)+(2)

## Stop conditions
- Do not open new quality-integration side quests as “proof”
- Do not run keep-best / housing pack loops as readiness
- After each code phase: commit + push + cold sensor run before claiming progress
- **Do not claim release-ready** until critical bar + independent judge pass
