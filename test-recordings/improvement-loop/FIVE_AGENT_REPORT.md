# Five-Agent Quality Push — Critic Report

**Branch:** `cursor/five-agent-quality-push-4719`
**Date:** 2026-06-09
**Topic:** "The museum heist streamed live on TikTok"
**Agent:** 5 (CRITIC/MANAGER)

---

## Executive Summary

**Overall verdict: FAIL** — Pipeline generates videos and the objective gate passes, but brutal scores plateau at 5.0–5.8/10 (target: 9.1). The current CI environment cannot run real harvest (missing Playwright Chromium), and mock-harvest videos are systematically rejected by the 55s duration gate (renders ~48s).

---

## Loop Run Results (this session — mock harvest, --max 3)

| Iter | Topic | Generate | Duration | Score | Objective | Scene QA | Upload-Ready |
|------|-------|----------|----------|-------|-----------|----------|--------------|
| 1 | Museum heist (retry 1) | FAIL | 48.1s < 55s | — | — | — | NO |
| 2 | Museum heist (retry 2) | FAIL | 48.8s < 55s | — | — | — | NO |
| 3 | Nuclear plant whistleblower | FAIL | 48.6s < 55s | — | — | — | NO |

**All 3 iterations failed the duration validation gate.** No scoring was possible because videos never reached the watch phase.

---

## Historical Scoring (prior session — real harvest, same branch)

These results from the previous run (2026-06-08) used real Playwright harvest and represent the best data:

| Iter | Render Tier | Brutal Score | Objective Gate | Objective Score | Scene QA | Hook Pass | Upload-Ready |
|------|-------------|--------------|----------------|-----------------|----------|-----------|--------------|
| 2 | draft | 0/10 | FAIL | 100 | PASS (1.5s) | — | NO |
| 3 | draft | 0/10 | PASS | 75 | PASS (2s) | — | NO (→ promoted to full) |
| 4 | full | **5/10** | PASS | 75 | PASS (2s) | PASS | NO |
| 5 | full | **5.8/10** | PASS | 75 | PASS (1s) | PASS | NO |
| 6 | full | **5/10** | PASS | 75 | PASS (1s) | FAIL | NO |

**Best brutal score achieved: 5.8/10** (target: 9.1)
**Kept videos (upload-ready): 0**

---

## PASS/FAIL Per Area

| Area | Status | Detail |
|------|--------|--------|
| Script generation | **PASS** | OpenRouter generates scripts reliably |
| TTS narration | **PASS** | edge-tts synthesis works |
| FFmpeg assembly | **PASS** | Hard-cuts pipeline renders correctly |
| Duration validation | **FAIL** | Mock harvest produces 48–49s videos (gate: ≥55s) |
| Objective gate | **PASS** | Passes on draft tier (promotes to full correctly) |
| Scene QA | **PASS** | Longest scene ≤2s, well within limits |
| Hook overlay | **PASS/PARTIAL** | Works for iterations 4–5 but regressed in iteration 6 |
| Visual variety | **FAIL** | Brutal scores cite "repetitive clips" and "static visuals" |
| Pacing | **FAIL** | Brutal scores cite "feels slow with repetitive visuals" |
| Brutal score | **FAIL** | Plateau at 5.0–5.8, no iteration broke 6/10 |
| Upload-ready | **FAIL** | 0 videos reached upload-ready in any run |
| Fix-gating logic | **PASS** | Correctly applies cuts, reharvest, and nonce bumps |
| Real harvest (Playwright) | **BLOCKED** | Chromium not installed on this VM |
| Harvest volume | **FAIL** | Real harvest in earlier attempt stuck at 0 assets/0 segments for 10+ min |

---

## Blocker List (ordered by severity)

### Critical Blockers

1. **Playwright Chromium missing** — Real harvest requires `npx playwright install chromium`. Without it, live web search returns 0 results and the pipeline starves for media assets. This is an environment setup issue, not a code bug.

2. **Mock-harvest duration shortfall** — `loopShort: true` + mock clips produce ~48s videos, below the 55s `MIN_DURATION_SEC` in `validate-loop-video.mjs`. Either:
   - Lower the gate to 45s for mock mode, or
   - Generate longer scripts in `loopShort` mode, or
   - Add a `--skip-duration-gate` flag for CI testing

3. **Brutal score plateau at 5.0–5.8** — The fix-gating logic correctly escalates (faster cuts, reharvest, nonce bumps), but the underlying visual content quality doesn't improve enough. Root causes per the watcher:
   - "Too many static visuals" — mock/stock assets lack motion diversity
   - "Limited visual diversity, with repetitive clips" — dedup gate isn't working (reports 0% dup but watcher sees repetition)
   - "Text-heavy frames lacking engaging content" — overlay burn-in dominates visual space

### Non-Critical Issues

4. **Hook overlay regression** — Iteration 6 hook failed after passing in 4–5. The `visionFix` passthrough (commit `a7d064a`) may have inadvertently changed overlay rendering logic.

5. **Harvest starvation on real search** — Even with Chromium, earlier logs show `0 assets / 0 segments` after 10+ minutes. The harvest pipeline may have a timeout or concurrency issue with the API-based search path.

6. **objectiveScore stuck at 75** — Never improves above 75/100 across all iterations despite fix escalation. The fix loop doesn't have a strategy for improving objective score beyond the initial pass threshold.

---

## Agent Commits on Branch (20 commits)

Key quality-related commits:
- `a7d064a` — Only pass visionFix to hook overlay builder for instruction strings
- `5fd094d` — Fix video clip retention and full-tier hook overlay chain
- `d199755` — Improve volume top-up with multi-provider direct image search
- `eaac52a` — Fix re-harvest starvation and add server-side volume top-up
- `5629349` — Top off loop segments with Wikimedia when harvest pool is short
- `7c1a63e` — Harvest quality gates: relevance filter, volume gate, placeholder objective check
- `c1eaa59` — FFmpeg YouTube overlays: hook text, karaoke captions, URL dedup, asset hardening
- `24345ce` — Upload-ready path: visible cuts, tier-aware gates, harvest diversity

---

## Recommendations for Next Push

1. **Install Playwright Chromium** on CI/dev VMs to unblock real harvest
2. **Reduce `MIN_DURATION_SEC` to 45s** or add `--ci` flag that relaxes the gate for mock-harvest runs
3. **Focus on visual motion** — The brutal scorer heavily penalizes static images. Prioritize video clips over still images in harvest, ensure >70% of assets are video clips
4. **Fix dedup detection** — The repetition detector shows 0% but the brutal scorer sees repetition; alignment needed between algorithmic and AI visual scoring
5. **Hook overlay stability** — Regression test the hook overlay chain across tier transitions
6. **Script length tuning** — Ensure `loopShort` mode targets 65–75s narration to produce videos safely above 55s even with mock clips

---

## Raw Data Locations

- Loop log: `test-recordings/improvement-loop/AGENT5_LOOP_RUN.log`
- Journal: `test-recordings/improvement-loop/JOURNAL.md`
- Journal JSONL: `test-recordings/improvement-loop/JOURNAL.jsonl`
- Best watch report: `test-recordings/improvement-loop/run-0004-1780944390372/WATCH_REPORT.md`
- FIX_STATE: `test-recordings/improvement-loop/FIX_STATE.json`
