# Quality Wave Summary (Waves 1–5 + Nursing 8.2)

**Branch:** `cursor/quality-honesty-wave1-b040`  
**Base:** `master` (`3e6f624`)  
**Commits:** 71 (2026-07-13 → 2026-07-14)  
**Scope:** ~80 files, +4.8k / −505 lines — improvement loop, Video Watcher honesty, harvest gates, topic families, YouTube-ready defaults.

---

## Executive summary

This branch turns the video improvement loop from “inflated scores + off-brand B-roll” into an honest, topic-aware pipeline. Video Watcher can no longer mint upload-ready from scene floors alone; `--until-score` gates use **raw** overall. Harvest adds relevance scoring, vision rejection, and topic-family locks (especially nursing abuse). A nursing-home CCTV topic reached **brutal flooredOverall 8.2** after fixing misclassification and junk stock filters.

---

## Wave 1 — Honest brutal scoring

**Commit:** `49b81d2` — *Wave 1: honest brutal scoring (capped floors, raw gate, null hard-fail)*

| Change | Location | Effect |
|--------|----------|--------|
| Capped scene/hook floors | `powers/video-watcher/src/score-honesty.mjs` | Floors may nudge a dim by at most **+1** over model raw |
| Raw vs floored overall | `score-honesty.mjs`, `scripts/video-improvement-loop.mjs` | `rawOverall` drives `--until-score`; display uses `flooredOverall` |
| Critical issue gate | `hasCriticalQualityIssues()` | Off-brand insects/puppets/cartoons + scroll-past signals block `youtubeReadiness` 8 |
| Null hard-fail | `scripts/lib/brutal-gate.mjs`, loop | Failed/skipped brutal vision when required → force reharvest |
| Upload-ready honesty | `applyHonestSceneFloors()` | `uploadReady` requires raw ≥ 7 **and** no critical issues |

**Tests:** `src/services/__tests__/scoreHonesty.test.ts` (2 cases)

**Follow-up:** `f393a2b` — “would **not** scroll past” praise no longer triggers false critical.

---

## Wave 2 — Packaging hygiene

**Commit:** `2d553a2` (packaging slice) + topic-family commits

| Change | Location | Effect |
|--------|----------|--------|
| Topic boundary reset | `scripts/lib/loop-state.mjs` → `clearTopicPackaging()` | New random topic does not inherit hooks, overlays, beats, harvest offset |
| Topic families | `src/services/topicFamilyQueries.ts`, `scripts/lib/topic-family.mjs` | `nursing_abuse`, `healthcare_cyber`, `veterans_benefits`, `bank_scam`, `landlord`, … |
| Impact beats | `scripts/lib/impactBeatsByTopic.mjs` | Family-specific yellow cards (not bank OTP on nursing) |
| Hook/overlay hygiene | `scripts/lib/patch-project-for-loop.mjs`, `deploy/server-render/ffmpegOverlays.mjs` | Topic-matched shock hooks; rotate overlay into early beats |
| mimo text extraction | `src/utils/openRouterMessageText.ts` | `content \|\| reasoning` across LLM + vision scorers |

**Tests:** `qualityWaves.helpers.test.ts` (`clearTopicPackaging`), `qualityWave.familyBeats.test.ts`

---

## Wave 3 — Harvest gates

**Commit:** `2d553a2` (harvest slice) + `364323e`, `55fac1b`, `a1baa46`, `145e654`

| Change | Location | Effect |
|--------|----------|--------|
| Relevance scoring | `scripts/lib/harvest-quality.mjs` | Keyword + off-brand blocklist; synthetic `stock-video` queries ignored |
| Soft-pass volume | `evaluateHarvestVolumeWithSoftPass()` | Motion-rich harvest passes even when still count is low |
| Vision gate | `scripts/lib/stock-vision-gate.mjs` | Thumbnail vision rejects beetles/puppets/office junk per topic |
| Nursing harvest lock | `scripts/lib/generate-full-video.mjs`, `src/services/media.ts` | CCTV/care queries; reject architectural models, produce crates, blurry beds |
| Off-brand visuals | `OFF_BRAND_VISUAL_RE` | Puppets, cartoons, insect macros blocked unless topic-allowed |
| Intro topic lock | `scripts/lib/build-edit-timeline.mjs` | Prefer CCTV/care over arch models; demote beetles on outro |

**Tests:** `qualityWaves.helpers.test.ts` (soft-pass, relevance, nursing preferBright), `qualityWave.familyBeats.test.ts` (timeline locks)

---

## Wave 4 — Reliability

**Commit:** `2d553a2` (reliability slice) + `d7d2eb3`, `87be8d8`, `c6b423e`

| Change | Location | Effect |
|--------|----------|--------|
| Draft brutal gate | `scripts/lib/brutal-gate.mjs` | Draft tier skip-vision is **not** a hard fail (unblocks draft→full promotion) |
| QC hardening | `server/quality-check/check_quality.py`, `server/routes/qualityCheck.ts` | 3-judge panel; timeout handling |
| LLM proxy timeout | `server/routes/llmProxy.ts` | 120s for long script/title calls |
| Source Media wait | `scripts/lib/generate-full-video.mjs` | Reload + testid resilience |
| Cost tracker split | `src/services/costTracker.node.mjs` + browser-safe `costTracker.ts` | Vite client no longer crashes on `fs.existsSync` |
| Loop preflight | `scripts/loop-preflight.mjs`, `nixpacks.toml` | faster-whisper/scenedetect optional degrade; Railway build installs them |
| Karaoke sync | `deploy/server-render/ffmpegOverlays.mjs` | Caption offset by intro silence (~3.5s) |

**Tests:** `qualityWaves.helpers.test.ts` (`isBrutalHardFail`, draft placeholder soft-pass)

---

## Wave 5 — Architecture levers

**Commit:** `2d553a2` (architecture slice) + loop defaults stack

| Lever | Location | Effect |
|-------|----------|--------|
| `rewriteScript` | `loop-state.mjs`, `apply-watch-fixes.mjs` | Watcher can request full script rewrite between iterations |
| `preferBrightBroll` / `faceSeekBroll` | `generate-full-video.mjs`, loop state | Bright/daylight queries; face-seeking stock; nursing uses care-home not office |
| `brollPlacement` | `scripts/lib/broll-placement.mjs`, `orchestrator.ts` | LLM B-roll placement wired for loop + UI |
| YouTube-ready defaults | `orchestrator.ts`, `renderingShared.ts`, server-render | ffmpeg hard cuts, fast pacing, shock hooks, impact beats |
| `--keep-going` | `scripts/video-improvement-loop.mjs` | Multi-topic grind continues past single-topic score hits |
| `--until-score 8` | loop + honesty gates | Chase ≥8 on raw/floored per `scoreForTargetGate()` rules |
| Model defaults | `src/services/llm/defaultModels.ts` | mimo-v2.5 default; Video Watcher vision gpt-5.4-mini |

**Pre-wave foundation (same branch):** YouTube export defaults, stock API top-up (Pexels/Pixabay/archive), zoom-punch interrupts, scene-anchored floors (`e60ae36`–`59f2ba0`), landlord/insurance hook templates.

---

## Nursing 8.2 result

**Topic:** *The nursing home cameras that recorded abuse for years* (`scripts/lib/random-topics.mjs`)

### Problem (pre-fix)

Nursing abuse was misclassified as `healthcare_cyber`, producing:

- Bank/hospital breach impact cards (`HOSPITAL BREACH`, `OTP STOLEN`)
- Office architecture B-roll and purple placeholder cards
- Inflated brutal scores despite off-brand visuals

### Fix stack

1. **`55fac1b`** — `nursing_abuse` family, nursing-first impact beats, intro topic lock, mimo `content||reasoning` on vision scorers
2. **`364323e`** — Gate all stock (incl. Pexels) with nursing relevance; skip post-sanitize rebalance that shoved office clips onto intro
3. **`d7d2eb3`** — Draft skip-vision no longer blocks nursing draft→full promotion
4. **`87be8d8`** — Denser nursing impact intervals; hook overlay rotates into early beats at 1.5s
5. **`a1baa46` / `145e654`** — Reject produce crates, grocery stock, blurry empty hospital beds (harvest regex + vision gate aligned)

### Outcome

- **Brutal flooredOverall: 8.2** on nursing pass (commit `145e654` message: *“after the 8.2 nursing pass”*)
- Critical off-brand issues cleared; CCTV/care B-roll and family-visit shots dominate intro/outro
- `uploadReady` path honest: raw overall + no critical `topIssues`

### Verification commands

```bash
npm run test:unit -- --run \
  src/services/__tests__/scoreHonesty.test.ts \
  src/services/__tests__/qualityWaves.helpers.test.ts \
  src/services/__tests__/qualityWave.familyBeats.test.ts

# Full loop proof (needs OPENROUTER_API_KEY + dev server)
npm run loop:video -- --topic "The nursing home cameras that recorded abuse for years" --until-score 8
```

---

## Remaining items (post-merge)

| # | Item | Notes |
|---|------|-------|
| 1 | **9.3 brutal stretch** | `npm run loop:video -- --until-score 9.3` — aspirational gate per `docs/REMAINING_WORK.md` |
| 2 | **Multi-topic ≥8 grind** | Bank, landlord, insurance, cyber, veterans — only nursing has documented 8.2 pass |
| 3 | **Prod deploy** | GHCR image + `npm run deploy:railway:registry:pull`; prod may lag `master` |
| 4 | **E2E full pipeline** | `npm run test:e2e:full` (~30 min) after deploy |
| 5 | **Thumbnail human pick** | Concepts wired; needs real OpenRouter runs + human selection |
| 6 | **Checklist 225 items** | `docs/REMAINING_WORK.md` §D — mostly open |
| 7 | **Whisper on clean VM** | Optional degrade OK; Railway build installs faster-whisper + scenedetect |
| 8 | **Browser journey recording** | Confirm dead-frame % dropped post-deploy |
| 9 | **Stock API keys** | Pexels/Pixabay improve motion top-up; archive.org/Mixkit work without keys |

---

## Key files (quick index)

| Area | Files |
|------|-------|
| Scoring honesty | `powers/video-watcher/src/score-honesty.mjs`, `powers/video-watcher/src/vision-brutal.mjs` |
| Loop | `scripts/video-improvement-loop.mjs`, `scripts/lib/loop-state.mjs`, `scripts/lib/apply-watch-fixes.mjs` |
| Harvest | `scripts/lib/harvest-quality.mjs`, `scripts/lib/stock-vision-gate.mjs`, `scripts/lib/generate-full-video.mjs` |
| Topic families | `src/services/topicFamilyQueries.ts`, `scripts/lib/topic-family.mjs`, `scripts/lib/impactBeatsByTopic.mjs` |
| Tests | `scoreHonesty.test.ts`, `qualityWaves.helpers.test.ts`, `qualityWave.familyBeats.test.ts` |

---

## Commit log (branch vs master)

See `git log master..cursor/quality-honesty-wave1-b040 --oneline --reverse` (71 commits). Landmark commits:

| Hash | Summary |
|------|---------|
| `49b81d2` | Wave 1: honest brutal scoring |
| `2d553a2` | Waves 2–5: packaging, harvest, reliability, architecture |
| `55fac1b` | Nursing topic family + CCTV/care lock |
| `364323e` | Harvest lock, bright B-roll, costs, mimo text |
| `d7d2eb3` | Draft skip-vision fix; B-roll placement |
| `87be8d8` | Overlay rotate, placeholder soft-pass, Source Media |
| `f393a2b` | False critical on “would not scroll past” |
| `a1baa46` | Nursing: reject produce crates / blurry beds |
| `145e654` | Harden nursing filters (post 8.2 pass) |
| `c6b423e` | faster-whisper preflight optional degrade |
