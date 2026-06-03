# AutoTube — Master ship plan (numbered)

Last updated: 2026-06-03. Single source of truth for what to merge, deploy, and run next.

---

## A. Environment variables (what exists where)

| # | Variable | Where | Purpose |
|---|----------|--------|---------|
| A1 | `RAILWAY_PROJECT_ID`, `RAILWAY_SERVICE_ID`, … | **This cloud worker** (len 36 each) | Runtime metadata — you are *on* Railway; not a deploy CLI token |
| A2 | `RAILWAY_TOKEN` or `RAILWAY_API_TOKEN` | **GitHub Secrets** + Cursor Cloud Agent secrets | `railway up` / GHA deploy — **not injected in this worker session** (len 0 here) |
| A3 | `OPENROUTER_API_KEY` / `VITE_OPENROUTER_KEY` | Railway service variables + local `.env` | Script, harvest, Video Watcher vision |
| A4 | `CURSOR_GIT_TOKEN` | Cloud agent | Git push, PR API (cannot clear draft on agent PRs without `ready_for_review` POST) |

**Action:** In Cursor → Cloud Agent → Secrets, ensure the secret is named exactly `RAILWAY_TOKEN` (Railway → Project → Settings → Tokens → **AutoTube-Deploy** project token). Same name in GitHub → Settings → Secrets → Actions.

---

## B. Pull requests — approve & merge order

| # | PR | Branch | Action |
|---|-----|--------|--------|
| B1 | **Close / ignore #17** | `cursor/video-quality-pipeline-dbd4` | Superseded by #19 |
| B2 | **#18** | `cursor/video-watcher-mcp-dbd4` | Mark **Ready for review** → merge into #19 base OR close after #19 merges (content included in #19) |
| B3 | **#19** | `cursor/takeover-quality-deploy-dd71` | **Primary ship PR** — mark Ready → merge to `master` |
| B4 | After merge | `master` | Triggers `railway-deploy.yml` if `RAILWAY_TOKEN` in GitHub Secrets |

Agent cannot click "Approve" in GitHub UI; you: open PR → **Ready for review** → **Merge squash**.

---

## C. Deploy (three paths — pick one)

| # | Path | Steps |
|---|------|--------|
| C1 | **GitHub Actions (recommended)** | 1) Add `RAILWAY_TOKEN` to repo secrets 2) Merge #19 to `master` 3) Watch Actions → "Deploy to Railway" 4) `curl https://autotube-production.up.railway.app/api/health` |
| C2 | **Local / agent with token** | `export RAILWAY_TOKEN=...` → `npm ci && npm run build` → `./scripts/deploy.sh` |
| C3 | **Railway GitHub integration** | Railway dashboard → connect repo → root `deploy/` or custom build that runs `scripts/deploy.sh` logic |

---

## D. Video quality — execution phases

### Phase 1 — Ship blockers (this week)

| # | Task | Owner | Done when |
|---|------|-------|-----------|
| D1 | Merge **#19** to `master` | You | `master` has hook sync + server URLs + watcher |
| D2 | Deploy prod (C1 or C2) | CI / you | `/api/health` 200 |
| D3 | Set Railway vars: `OPENROUTER_API_KEY`, `VITE_OPENROUTER_KEY`, `TRUST_PROXY`, `ALLOWED_ORIGINS` | You | Script + harvest work in prod UI |
| D4 | Enable **video-watcher** MCP in Cursor (`.cursor/mcp.json`) | You | `watch_video` tool works |
| D5 | Run `npm run squad:gate:fixture` on CI | CI | 7/7 green on PR |

### Phase 2 — Fix “meh” output (hook + A/V + QC)

| # | Task | Status in #19 |
|---|------|----------------|
| D6 | Ban "In 2024…" in prompts + validation | Done |
| D7 | `project.hookLine` + sync intro narration | Done |
| D8 | TTS silence 3.5s = cold open | Done |
| D9 | Server render URL → QualityCheck (no blob) | Done |
| D10 | Mock/fixture shock hooks | Done |
| D11 | Real harvest per topic in loop (`realHarvest: true`) | On branch; needs OpenRouter in prod |
| D12 | Media sanitization before render | On branch |

### Phase 3 — Improvement loop to 9.3

| # | Task | Command |
|---|------|---------|
| D13 | Dev server | `npm run dev -- --port 5173 --host 0.0.0.0` |
| D14 | Fix-gated loop | `OPENROUTER_API_KEY=... npm run loop:video -- --until-score 9.3` |
| D15 | Stop condition | `test-recordings/improvement-loop/TARGET_SCORE_REACHED.json` |
| D16 | Review each fail | `run-*/WATCH_REPORT.md` + apply fixes (same topic retry) |

### Phase 4 — YouTube packaging (human + app)

| # | Task |
|---|------|
| D17 | Pick title from `SHIP_PACKAGE.json` / title variants |
| D18 | Custom thumbnail (not video frame) |
| D19 | Upload; read retention graph; fix drop-offs in *next* video |
| D20 | Series niche (cyber / AI / health tech) — not random topics only |

---

## E. Verification checklist (run after merge)

```bash
npm ci
npm run build
npm run test:e2e:smoke          # requires dev server in another terminal
npm run squad:gate:fixture
npm run watch:video -- docs/artifacts/FINAL-VIDEO-youtube-review.mp4  # if artifact exists
curl -fsS https://autotube-production.up.railway.app/api/health
```

---

## F. What “done” means

| # | Milestone | Metric |
|---|-----------|--------|
| F1 | **Technical ship** | #19 on `master`, prod health OK, CI green |
| F2 | **Pipeline ship** | One full topic → `-final.mp4` ≥ 180s, `squad:gate` 7/7 |
| F3 | **Quality ship** | Video Watcher brutal ≥ 7/10, hook pass, upload-ready YES |
| F4 | **Business ship** | You published 1 video with thumb + title test; CTR/retention tracked |

**9.3/10** is F3 stretch goal via loop D14 — not realistic on fixture-only path.

---

## G. Immediate next 5 actions (you)

1. Open https://github.com/nickaisbitt/AutoTube/pull/19 → **Ready for review** → **Merge**.
2. Confirm GitHub secret `RAILWAY_TOKEN` (AutoTube-Deploy token).
3. Confirm Railway service variables include OpenRouter key.
4. Hit https://autotube-production.up.railway.app/api/health after deploy.
5. Run one real topic in prod UI (not fixture); `npm run watch:video` on the export.
