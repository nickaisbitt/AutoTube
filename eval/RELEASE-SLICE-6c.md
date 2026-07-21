# Cold release held-out window (topics 13–18)

**Run:** `eval-release-2026-07-15T07-56-16-789Z`  
**Commit:** `1343374` (topic-derived beats replace defensive "THIS IS REAL" overlays)  
**Protocol:** `--set release --offset 12 --max 6`, cold + VisualBeats + BeatVision + whisperAlign; same-model judge (`xiaomi/mimo-v2.5`, see `eval/JUDGE-LIMITATION.md`)

## Aggregate

| Metric | Slice 1 (1–6) | Slice 2 (7–12) | Slice 3 (13–18) | Combined 18 | Release-candidate bar |
|--------|---------------|----------------|-----------------|-------------|------------------------|
| Generate success | — | — | **83.3%** (5/6) | — | — |
| Upload-ready | 66.7% | 50.0% | **60.0%** | **58.8%** | ≥50% → combined PASS |
| Critical | 33.3% | 50.0% | **40.0%** | **41.2%** | ≤25% → **FAIL** |
| Raw median | 7.5 | 7.5 | **7.4** | **7.4** | ≥7.2 → PASS |
| Raw p25 / p75 | 7.25 / — | — | **7.0 / 7.8** | ~7.2 / 7.8 | ≥6.5 → PASS |

> Rates for slice 3 are over the **5 watched** topics (rel-17 failed to generate). Combined figures are over **17 watched** topics across the three slices.

## Per topic (13–18)

| Id | Topic | Raw | Upload | Critical |
|----|-------|-----|--------|----------|
| rel-13 | archival film reels / climate-control upgrade (history) | 7.4 | yes | no |
| rel-14 | marathon timing chip vendor falsified finish times (sports) | 6.6 | no | yes |
| rel-15 | water utility billed residents for leaks it caused (infrastructure) | 7.8 | yes | no |
| rel-16 | observatory delayed reporting near-earth asteroid (science) | 7.0 | no | yes |
| rel-17 | grocery loyalty cards → insurance pricing (consumer) | — | — | **generate FAIL** (`SCRIPT_TIMEOUT` — Source Media never appeared after 240s) |
| rel-18 | refugee housing lottery gamed by landlords (policy) | 7.8 | yes | no |

## Recurring critical patterns (this window)

- **Fragmented / nonsensical text overlays** that don't form a coherent story (rel-14, rel-16).
- **Generic stock-footage montage** with no narrative or human connection / personality (rel-14, rel-16).
- **Caption readability** over busy backgrounds (rel-14).
- **Inconsistent visual quality / lighting**, dead black frames as transitions/outro (rel-13, rel-15, rel-18).
- **One hard generation failure** (rel-17 `SCRIPT_TIMEOUT`) — pipeline reliability, not a watch-quality issue.

## Verdict

The topic-derived-beats change held raw median (7.4) and kept upload-ready above the calibrated 50% bar (60% this slice, 58.8% combined 18), but **critical remains the blocker** (40% this slice, 41.2% combined) — still well above the ≤25% bar. Repetition / generic stock / weak-hook text patterns continue to dominate failed watches.

**Do not claim release-ready.** Next: attack the critical text-coherence and stock-genericness patterns, and run with an independent `AUTOTUBE_WATCH_MODEL`, then re-measure on `--offset 18 --max 6` (topics 19–24).
