# AutoTube — Master ship plan (numbered)

Last updated: 2026-06-03. Deploy model: **git push `master` → Railway autodeploy** (no GitHub Actions deploy).

---

## A. How production deploy works

| # | Step | Who |
|---|------|-----|
| A1 | **Connect GitHub to Railway** (one-time) — see **A1b** (CLI) or dashboard **Connect Repo** | You / agent |
| A2 | **branch** = `master`, **root directory** = empty / `.` (repo root, not `deploy/`) | Set in A1b |
| A3 | Railway reads **`railway.toml`** + **`nixpacks.toml`** at repo root | Automatic |
| A4 | **`git push origin master`** | You / agent |
| A5 | Railway builds (`npm run build`, edge-tts, native deps) and starts `npx tsx server.mjs` | Automatic |
| A6 | Verify | `curl https://autotube-production.up.railway.app/api/health` |

**No GitHub Actions** for deploy. Workflows are **manual-only** (optional CI).

### A1b. Connect repo via CLI (backend — no dashboard)

Requires `RAILWAY_TOKEN` in the agent shell. **Self-hosted Railway workers** (`railway-AutoTube`): add it on Railway → **cursor-self-hosted-worker** → **cursor-worker** → **Variables**, redeploy worker, new agent session. Cursor Dashboard secrets alone are often **not** injected — see **`docs/RAILWAY_WORKER_SECRETS.md`**.

```bash
npm run railway:connect
```

This runs `scripts/railway-connect-github.sh`: links **AutoTube-Deploy** / **autotube**, sets `nickaisbitt/AutoTube` @ `master`, root `.`, redeploys from GitHub.

**One-time:** Railway’s GitHub App must be installed on your GitHub account (Railway may open OAuth the first time you connect a repo).

---

## B. Environment variables (Railway service)

| # | Variable | Purpose |
|---|----------|---------|
| B1 | `OPENROUTER_API_KEY` / `VITE_OPENROUTER_KEY` | Script, harvest, quality review |
| B2 | `VITE_SERPER_KEY` | Image search (optional) |
| B3 | `TRUST_PROXY` | `true` behind Railway proxy |
| B4 | `ALLOWED_ORIGINS` | Your prod URL(s), comma-separated |
| B5 | `AUTOTUBE_FORCE_CPU` | `1` if NVENC breaks on host |

**Cursor Cloud Agent `RAILWAY_TOKEN`:** only needed for **manual** `./scripts/deploy.sh` / `railway up` — **not** for normal git-push autodeploy.

---

## C. Pull request / branch admin (current)

| # | Item | Status |
|---|------|--------|
| C1 | **#17** video-quality-pipeline | Closed / superseded |
| C2 | **#18** video-watcher MCP | Closed — merged into master |
| C3 | **#19** takeover | Closed — merged to **master** (`58f850f`+) |
| C4 | **Source of truth branch** | `master` only for production |

---

## D. Optional manual deploy (emergency)

| # | Command | When |
|---|---------|------|
| D1 | `npm ci && npm run build` | Pre-sync dist for legacy `deploy/` CLI path |
| D2 | `export RAILWAY_TOKEN=...` | Cursor secret or Railway dashboard token |
| D3 | `./scripts/deploy.sh` | Only if autodeploy is broken |

Normal path: **do not run** — push `master` instead.

---

## E. Video quality — what to run locally

| # | Task | Command |
|---|------|---------|
| E1 | Dev server | `npm run dev -- --port 5173 --host 0.0.0.0` |
| E2 | Fixture gate | `npm run squad:gate:fixture` |
| E3 | Improvement loop | `OPENROUTER_API_KEY=... npm run loop:video -- --until-score 9.3` |
| E4 | Watch export | `npm run watch:video -- path/to-final.mp4` |
| E5 | Enable MCP | `.cursor/mcp.json` → **video-watcher** |

---

## F. Verification (after Railway deploy)

```bash
curl -fsS https://autotube-production.up.railway.app/api/health
npm run squad:gate:fixture    # local, optional
```

---

## G. What “done” means

| # | Milestone | Metric |
|---|-----------|--------|
| G1 | **Deployed** | Push `master` → Railway build green → health OK |
| G2 | **Pipeline** | Real topic → `-final.mp4` ≥ 180s, `squad:gate` 7/7 |
| G3 | **Quality** | Watcher brutal ≥ 7, hook pass, upload-ready YES |
| G4 | **YouTube** | Published with custom thumb + title test |

---

## H. Immediate actions (you)

1. Railway dashboard → confirm **GitHub autodeploy** on `master`, root `.`
2. Confirm Railway **service variables** (B1–B4 above).
3. Push any new commits to `master` — wait for Railway build (not Actions).
4. Open prod URL and run one real topic through the pipeline.
5. `npm run watch:video` on the export; fix items by number from `WATCH_REPORT.md`.
