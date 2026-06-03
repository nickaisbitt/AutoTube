# Railway token + Cursor Cloud Agent (why secrets sometimes “don’t work”)

## What’s going on

AutoTube agents often run on a **self-hosted Cursor worker** on Railway:

- Service: `cursor-worker`
- Project: `cursor-self-hosted-worker`
- Worker id: `railway-AutoTube` (see `.cursor/agent-cli-state.json` on the worker)

**Cursor Dashboard → Secrets** inject into **Cursor-hosted** cloud agent VMs.

**Self-hosted Railway workers** only get:

1. Variables you set on the **Railway `cursor-worker` service** (Railway dashboard → Variables), and  
2. Railway runtime metadata (`RAILWAY_PROJECT_ID`, `RAILWAY_SERVICE_NAME`, …) for **that worker**, not AutoTube-Deploy.

So `RAILWAY_TOKEN` can be “definitely in Cursor secrets” but still **length 0** inside the agent shell.

## Fix (pick one)

### Option A — Recommended for `railway-AutoTube` worker

1. Open Railway → project **cursor-self-hosted-worker** → service **cursor-worker** → **Variables**.
2. Add **`RAILWAY_TOKEN`** = your deploy token from [railway.com/account/tokens](https://railway.com/account/tokens) (project token for **AutoTube-Deploy** is best).
3. **Redeploy / restart** the `cursor-worker` service so the new variable is in the process env.
4. Start a **new** Cursor agent on AutoTube → run `npm run railway:connect`.

### Option B — Cursor environment-scoped secret

1. Cursor → **Cloud Agents** → environment **railway-AutoTube** (or your AutoTube environment name).
2. Add secret **`RAILWAY_TOKEN`** on **that environment**, not only global secrets.
3. **New agent session** (restart agent).

### Option C — Dashboard (no token in agent)

1. Railway → **AutoTube-Deploy** → **autotube** → **Connect Repo** (one-time).
2. Then only `git push origin master` for deploys.

## Verify in the agent

```bash
echo "RAILWAY_TOKEN len=${#RAILWAY_TOKEN}"
npm run railway:connect
```

`len` should be **36** (or similar), not **0**.

## AutoTube deploy vs worker project

| Project | Purpose |
|---------|---------|
| `cursor-self-hosted-worker` | Runs the Cursor agent VM |
| `AutoTube-Deploy` | Production AutoTube app (`autotube-production.up.railway.app`) |

`RAILWAY_TOKEN` must be a token that can manage **AutoTube-Deploy**, even when set on the worker service.
