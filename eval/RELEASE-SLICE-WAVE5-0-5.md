# Release slice 0–5 — wave 5 sensor (`22511b9` tip)

**Protocol:** cold first-pass, independent judge `google/gemini-2.5-flash`  
**Dir:** `test-recordings/eval-release-2026-07-18T03-27-10-853Z`  
**Dev×2 same tip:** generate 100%, raw median 6.8, upload 0%

## Slice bars

| Metric | Bar | Result | Status |
|--------|-----|--------|--------|
| Generate | ≥95% | **100%** (6/6) | PASS |
| Critical | ≤25% | **16.7%** (1/6) | PASS |
| Upload-ready | ≥50% | **16.7%** (1/6) | FAIL |
| Raw median | ≥7.2 | **6.3** | FAIL |

## Per topic

| ID | Raw | Upload | Critical | Notes |
|----|-----|--------|----------|-------|
| rel-01 ambulance | 6.4 | no | no | Repeated stock / corporate |
| rel-02 climate lab | 6.2 | no | no | Black-screen interrupts |
| rel-03 airline | 5.6 | no | **yes** | Elmo/cat junk + slow pacing |
| rel-04 zoning | 6.0 | no | no | Generic stock |
| **rel-05 indie** | **7.0** | **YES** | no | First release upload this wave |
| rel-06 museum | 6.4 | no | no | — |

## Signals
- Generate reliability recovered (volume soft-pass + 6 assets/seg).
- One upload-ready release topic (indie cloud lockout) proves raw≥7 path is reachable.
- Remaining gap is variety/pacing on thin topical pools + junk leakage (kids characters).
