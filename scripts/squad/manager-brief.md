# Manager Agent M0 — Daily coordination

## Priority order
1. A5, A4, A11 (render must not crash or lie)
2. A3, A7 (audio must not be silent/flat)
3. A1, A2, A6, A10, R7 (prove full pipeline + 7-point pass)
4. A8, A9, A13, A15 (viral quality)
5. A12, A14 (tests & ops)

## Per-agent deliverable required
- `status`: done | blocked | in_progress
- `files_changed`: list
- `evidence`: command output or path to artifact
- `blocks`: other agent IDs

## Merge gate (all required for "Real Pass")
Run: `npm run verify:real-pass` (R7) must exit 0.

**Fixture/CI short run:** `REAL_PASS_FIXTURE=1 MIN_DURATION_SEC=30 npm run verify:real-pass`  
**Full checklist + env vars:** `scripts/squad/R7-real-pass.md`
