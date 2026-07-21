# Cold release held-out window (topics 7–12)

**Run:** `eval-release-2026-07-15T06-58-28-229Z`  
**Commit:** `80cc0f8` (dark demotion / URL reuse / face hooks)  
**Protocol:** `--set release --offset 6 --max 6`, cold + beats + beat vision

## Aggregate

| Metric | Slice 1 (1–6) | Slice 2 (7–12) | Combined 12 | Release-candidate bar |
|--------|---------------|----------------|-------------|------------------------|
| Upload-ready | 66.7% | **50.0%** | **58.3%** | ≥50% → combined PASS |
| Critical | 33.3% | **50.0%** | **41.7%** | ≤25% → **FAIL** |
| Raw median | 7.5 | **7.5** | ~7.5 | ≥7.2 → PASS |

## Per topic (7–12)

| Id | Raw | Upload | Critical |
|----|-----|--------|----------|
| rel-07 youth soccer biometrics | 6.6 | no | yes |
| rel-08 ferry schedule | 7.8 | no | yes |
| rel-09 fake fluency certs | 7.2 | yes | no |
| rel-10 wildlife oil drones | 7.6 | no | yes |
| rel-11 juvenile court leak | 7.4 | yes | no |
| rel-12 double-sold seats | 7.8 | yes | no |

## Verdict
Timeline/dark/face tweaks did **not** clear the critical bar on a fresh held-out window. Critical remains the blocker. Upload + raw median already meet calibrated bars on aggregate.

**Do not claim release-ready.** Next code must attack critical patterns that still dominate failed watches (repetition / generic stock / weak hooks), then re-measure on `--offset 12 --max 6`.
