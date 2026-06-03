# Follow-up plan (numbered) — 2026-06-03

Use this after the long PR/video-quality thread. **Master** is source of truth; **no GitHub Actions deploy**.

---

## Where things stand right now

1. **Code** — Video-watcher, hook sync, QualityCheck server URLs, real-harvest loop, deploy scripts: **on `master`**.
2. **Prod app** — https://autotube-production.up.railway.app/api/health returns OK but **uptime ~3+ days** = **old container**, not your latest commits.
3. **GitHub ↔ Railway** — **Connected** via GraphQL `serviceConnect` (nickaisbitt/AutoTube @ master). Confirm in Railway → autotube → Source shows the repo.
4. **This agent** — `npm run env:debug-railway` → **all token env vars unset** (cannot run `npm run railway:connect` here).
5. **Video quality** — Still **not 9.3/10**; fixture/mock path was the main “meh” source; real harvest + loop fixes are on master but need prod keys + iteration.

Run anytime: `npm run deploy:status`

---

## Phase 0 — Unblock deploy (you or agent with token)

1. **Prove token in the session you care about**
   ```bash
   npm run env:debug-railway
   ```
   Must show `SET` for `Railway` or `RAILWAY_API_TOKEN` or `RAILWAY_TOKEN`.

2. **If unset in Cursor agent (common on self-hosted worker)**
   1. Railway → project **cursor-self-hosted-worker** → service **cursor-worker** → **Variables**
   2. Add `RAILWAY_TOKEN` = deploy token from https://railway.com/account/tokens (AutoTube-Deploy access)
   3. Redeploy **cursor-worker**, start a **new** agent on AutoTube

3. **Connect GitHub (pick one)**
   1. **curl (works when Node/npm abort on worker):** `npm run railway:graphql:connect:curl` or `bash scripts/railway-graphql-curl-connect.sh`
   2. **Node:** `npm run railway:graphql:connect` (when `fetch` works)
   3. **Dashboard:** Connect Repo → `nickaisbitt/AutoTube`, branch **master**, root **`.`**

4. **Ship code**
   ```bash
   git push origin master
   ```

5. **Confirm new deploy**
   1. Railway → Deployments → latest build **Success**
   2. `npm run deploy:status` → prod `deploy.gitCommit` matches `git rev-parse HEAD`
   3. Health **uptime** drops to minutes (not days)

---

## Phase 1 — Railway service variables (prod app)

6. Set on **autotube** service (not cursor-worker):
   1. `OPENROUTER_API_KEY` / `VITE_OPENROUTER_KEY`
   2. `TRUST_PROXY=true`
   3. `ALLOWED_ORIGINS=https://autotube-production.up.railway.app`
   4. Optional: `AUTOTUBE_FORCE_CPU=1` if encode fails

---

## Phase 2 — Prove pipeline (not “meh fixture”)

7. Local: `npm run dev -- --port 5173 --host 0.0.0.0`
8. `OPENROUTER_API_KEY=... npm run generate:video -- "One real topic"`
9. `npm run watch:video -- test-recordings/...-final.mp4`
10. Fix numbered items in `WATCH_REPORT.md` before calling it shippable

---

## Phase 3 — Improvement loop (toward 9.3)

11. `OPENROUTER_API_KEY=... npm run loop:video -- --until-score 9.3`
12. Loop **fixes same topic** until watcher passes, then random topic
13. Stop when `test-recordings/improvement-loop/TARGET_SCORE_REACHED.json` exists

---

## Phase 4 — Cursor tooling

14. Enable MCP **video-watcher** (`.cursor/mcp.json` on master)
15. After each export: `npm run watch:video -- path/to.mp4`

---

## Phase 5 — Definition of done

16. **Deploy:** master pushed → Railway green → health commit matches local
17. **Technical:** `npm run squad:gate:fixture` green
18. **Quality:** Watcher brutal ≥ 7, hook pass, upload-ready YES on a **real topic** (not 8-image mock)
19. **YouTube:** You pick title + thumbnail; upload; read retention

---

## What agents cannot do without step 0–3

20. Run `railway link` / `railway:connect` without token in process env
21. Force Railway dashboard “Connect Repo” without your GitHub OAuth once
22. Guarantee 9.3 from mocks — needs real harvest + OpenRouter on prod or local

---

## Admin (done)

23. PRs **#17–#19** closed; work merged to **master**
24. GitHub Actions **deploy workflows removed** — only manual CI if you run it
25. Plan docs: `docs/SHIP_PLAN_MASTER.md`, `docs/RAILWAY_WORKER_SECRETS.md`
