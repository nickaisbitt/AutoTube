# Cold release-set slice (6/24)

**Run:** `eval-release-2026-07-15T05-27-00-340Z`  
**Flags:** cold + VisualBeats + BeatVision + whisperAlign; same-model judge (see `eval/JUDGE-LIMITATION.md`)

## Aggregate

| Metric | Dev×6 baseline | Release×6 | Provisional release-candidate bar |
|--------|----------------|-----------|-----------------------------------|
| Upload-ready | 16.7% | **66.7%** | ≥50% → **PASS** |
| Critical | 83.3% | **33.3%** | ≤25% → **FAIL** (close) |
| Raw median | 6.8 | **7.5** | ≥7.2 → **PASS** |
| Raw p25 | 6.25 | **7.25** | ≥6.5 → **PASS** |
| Raw mean / max | 6.77 / 7.6 | 7.4 / **8.0** | — |

### Per topic

| Id | Raw | Upload | Critical |
|----|-----|--------|----------|
| rel-01 ambulance GPS | 6.6 | no | yes |
| rel-02 fake climate calibrations | 8.0 | yes | no |
| rel-03 (see report) | 7.2 | no | yes |
| rel-04 | 7.6 | yes | no |
| rel-05 | 7.6 | yes | no |
| rel-06 | 7.4 | yes | no |

## Verdict
**Not release-ready yet** — critical rate still above the calibrated 25% bar.  
**Clear generator improvement** vs cold dev×6 on the same protocol (upload +3.9×, critical −50pp, median +0.7).

## Remaining to close readiness
1. Drive critical below 25% on held-out topics (repetition, dark frames, face-less hooks — recurring watch issues).
2. Re-run release×6 (or expand toward 24) with `AUTOTUBE_WATCH_MODEL` set to a **different** model than generation.
3. Only then claim release-candidate.
