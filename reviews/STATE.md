# Review State — AutoTube

## Last Full Review
- **Date:** 2026-06-01
- **Commit:** cab25b1
- **Scope:** 8-domain full squad review

## Per-Domain Status

| Domain | Last Review | P0 Open | P1 Open | PR |
|--------|------------|---------|---------|-----|
| Frontend/UX | 2026-06-01 | 0 | 8 | #11 |
| LLM & Prompts | 2026-06-01 | 0 | 0 | #7 |
| Media Sourcing | 2026-06-01 | 0 | 8 | #6 |
| TTS & Audio | 2026-06-01 | 0 | 0 | N/A |
| Video Render | 2026-06-01 | 3 | 8 | #4, #9 |
| Backend/API | 2026-06-01 | 3 | 9 | #4, #8 |
| DevOps/Deploy | 2026-06-01 | 0 | 0 | #5 |
| QA/Testing | 2026-06-01 | 0 | 0 | #10 |

## Open P0s
None remaining (all addressed in PRs #4, #8, #9).

## Open P1s
All addressed in PRs #5–#11. Merge queue pending.

## Merged Since Last Full Review

| PR | Date | Domain | Summary |
|----|------|--------|---------|
| #12 | 2026-06-01 | docs | Add reviews/STATE.md + 8 runbooks under reviews/runbooks/ |
| #13 | 2026-06-01 | docs | Reconcile 15 audit MDs into SYSTEM_CONTEXT.md |
| #14 | 2026-06-02 | store, e2e | Add StoreContext so all useVideoProject() consumers share state (architectural fix — sidebar was rendering independent stepStatuses from PipelineStepRouter). Rewrite e2e/basic-flow.spec.ts to mock OpenRouter and assert real selectors. |

## Outstanding Architectural Items (from PR #14 follow-up)
- **StoreContext coverage:** 6/6 component consumers migrated. Test files (`src/services/__tests__/`) still import the original `useVideoProject` from `src/store/index.ts` and rely on its fallback-to-local behavior. This is intentional — keeps `renderHook` working without a provider — but the fallback path is exercised only in tests.

## Review Triggers
- **PR opened:** Always agents 1, 2. Additional agents by file-glob match.
- **Weekly / on-demand:** Full 8-agent squad.
- **Deploy failure:** Agents 4, 5, 7.
- **New dependency:** Agents 6, 7.

## Stale Audit MDs
14 root-level audit reports from prior Copilot sessions archived to `reviews/_archive/` (PR #15). Refer to `SYSTEM_CONTEXT.md` for the consolidated single source of truth.
