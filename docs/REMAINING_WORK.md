# AutoTube — Remaining Work (numbered)

Last updated: 2026-08-01 (audit fix branch `cursor/fix-audit-blockers-b466`).

## Status after multi-model audit fix sweep

**Code/security/honesty gates:** largely DONE (see commits on this branch). `npm run dod:check` is green.

**Product quality DoD (manual-with-keys):**
- ✅ `generate:video` real airline topic produced MP4 (70.7s, 22.66 MB) with espeak fallback TTS and fail-closed harvest soft-pass.
- ✅ `watch:video` exits 1 when not upload-ready (honesty works).
- ❌ Upload-ready ≥7 not yet met on Archive-only keyless run (latest raw **5.4/10** — off-topic medical/carrier clips). Needs stock keys (Pexels/Pixabay) and/or further harvest relevance, then re-watch.


---

# AutoTube — Remaining Work (numbered)

Last updated: 2026-08-01 on branch `cursor/fix-audit-blockers-b466`. Use item numbers in chat ("fix 3", "do 7").

## A — Multi-model audit fix sweep — DONE on this branch

Landed 2026-08-01 in `c3d8dbe`, `2a525e3`, `bd72324`, `5055c41`:

1. **Harvest fail-closed** — no query-laundering through quality gates; fallback harvest filtered; Picsum inject dropped; NSFW CDN bans kept at domain parity between client and server.
2. **A/V sync** — narration gaps propagate into video/captions/ducking; empty narration and killed renders now fail instead of shipping silent output.
3. **Watcher honesty** — brutal/upload-ready gates no longer inflate scores. `npm run watch:video -- <mp4>` exit semantics (`scripts/watch-video.mjs`): exit 0 **only** when `uploadReady === true`, or when `--min-score N` is given and the raw brutal score ≥ N with no critical issues; exit 1 otherwise (including vision-skipped or failed reviews).
4. **Security** — fail-closed API auth; tighter SSRF/proxy limits; LLM/render bounds; `downloadClip` redirect hardening; production error masking; lossy project-ID collisions rejected; `VITE_*` browser-secret exposure documented in `.env.example`.
5. **Deploy drift** — stale unauthenticated `deploy/server` tree deleted; CI guard blocks revival (`.github/workflows/ci.yml`); `npm run check:server-render` detects root↔deploy monolith drift.
6. **Audio** — background-music multi-root resolve; Remotion audio offset; Kokoro SSML strip.
7. **CI** — GHCR image publishes only after green CI; Playwright `forbidOnly`; script discovery fixed.
8. **Sprawl** — dead services/components and mock social uploads quarantined; unused TypeScript FX mirrors deleted (canonical path is `deploy/server-render/*.mjs`).
9. **Eval honesty** — eval chain exits non-zero on failed release bars; aggregation defaults to the latest wave. Note: artifacts in `test-recordings/` (incl. 2026-07-21 eval-release runs) predate these honesty fixes — their scores must not be cited as DoD evidence.

## B — Script-enforceable DoD — `npm run dod:check`

Fast, no keys required, exit 1 on any failure:

10. `deploy/server` / `deploy/server.mjs` must be absent (mirrors the CI guard).
11. `deploy/server-render.mjs` must match root `server-render.mjs` (delegates to `scripts/sync-server-render-deploy.mjs --check`; fix with `npm run sync:server-render`).
12. Optional slower bar: `node scripts/dod-check.mjs --unit` also runs the vitest suite (off by default to keep the check fast; CI runs the suite on every push).
13. Typecheck stays separate: `npm run lint` (`tsc --noEmit`) — hinted by dod:check, not executed by it.

## C — Product DoD — STILL OPEN (manual, needs keys; do NOT claim these are met)

14. **Real generate** — `npm run dev`, then `OPENROUTER_API_KEY=... npm run generate:video -- "<real topic>"` (needs ffmpeg). Must be re-run on this branch's code; pre-sweep artifacts don't count.
15. **Watch ≥ 7** — `npm run watch:video -- <new-final.mp4> --min-score 7` exits 0 on the fresh real-topic artifact. OPEN.
16. **Upload-ready** — `npm run watch:video -- <new-final.mp4>` exits 0 (`uploadReady === true`, vision enabled). OPEN.
17. **9.3 stretch (optional)** — `OPENROUTER_API_KEY=... npm run loop:video -- --until-score 9.3` until `test-recordings/improvement-loop/TARGET_SCORE_REACHED.json` exists. OPEN.

## D — Deploy / prod

18. **Prod currency** — `npm run railway:completion-check` exits 0 ⇔ prod deploy/image tag matches local `git rev-parse HEAD` (needs `RAILWAY_API_TOKEN`; also probes https://autotube-production.up.railway.app/api/health). Status from this VM: UNVERIFIED — no Railway token in this environment.
19. **Ship path** — push to master → GHCR image workflow (`.github/workflows/ghcr-image.yml`, runs only after green CI) → from a machine holding the token: `npm run deploy:railway:registry:pull`, then `npm run railway:completion-check`. Railpack `npm run deploy:railway` still hangs at Railway "uploading snapshot"; use the GHCR path.
20. **Token hygiene** — rotate the Railway API token if it was ever pasted in chat; update the Cursor secret `RAILWAY_API_TOKEN`.

## E — Test / CI environment notes

21. **ffmpeg** — audio integration tests skip when ffmpeg/lavfi is unavailable (by design); full coverage needs ffmpeg installed.
22. **E2E smoke** — `npm run test:e2e:smoke` needs `npx playwright install chromium --with-deps`; run on Mac or CI.
23. **E2E full pipeline** — `npm run test:e2e:full` (~30 min); run after prod deploy.
24. **Onboarding modal** — blocks UI clicks when `VITE_OPENROUTER_KEY` is unset; set it in `.env.local` (map `OPENROUTER_API_KEY` if needed) before E2E or manual testing, and restart the dev server.
25. **Known-open unit failure (2026-08-01)** — `server/__tests__/routeHardening.test.ts` › "rejects an oversized image from Content-Length before buffering" fails on this branch (expects a 413 Content-Length pre-check in `server/routes/proxyImage.ts`); a fix is in flight in the security-hardening pass. `node scripts/dod-check.mjs --unit` stays red until it lands; the rest of the suite (2029 tests) passes.
