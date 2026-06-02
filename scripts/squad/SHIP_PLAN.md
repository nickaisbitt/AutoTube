# Ship plan — remaining work

## Phase 1 — Strict Real Pass (merge gate)

| Step | Command | Owner |
|------|---------|-------|
| Long fixture render | `npm run render:fixture:full` | A1, A2, A3 |
| Strict verify | `npm run squad:gate` | R7 |
| Full E2E (optional) | `npm run test:e2e:full` | A10 |

## Phase 2 — CI

| Step | Command |
|------|---------|
| Smoke E2E | `npm run test:e2e:smoke` |
| Fixture Real Pass | `npm run squad:gate:fixture` |
| Unit tests | `npm run test:unit` |

## Phase 3 — Ship criteria

- [ ] `npm run squad:gate` exit 0 (≥180s, music when enabled, all 7 checks)
- [ ] `npm run test:e2e:smoke` green
- [ ] Human watch of `test-recordings/FINAL-OUTPUT-final.mp4`
- [ ] PR #17 ready for review (not draft)

## Phase 4 — Post-ship (quality bar)

- Real OpenRouter key run on production topic
- Wire more P0 checklist items (A15)
- Kokoro GPU / voice polish
