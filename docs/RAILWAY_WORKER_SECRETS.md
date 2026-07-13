# Railway token in Cursor Cloud Agents

## Secret names (important)

Cursor Dashboard secrets map to **environment variable names**. AutoTube accepts the same names as Podomator:

| Cursor secret name | Works? |
|--------------------|--------|
| **`Railway`** | Yes (common Cursor label) |
| **`RAILWAY_API_TOKEN`** | Yes (recommended) |
| **`RAILWAY_TOKEN`** | Yes |

If your other projects work but AutoTube did not, the script may have been checking only `RAILWAY_TOKEN`. Use **`npm run env:debug-railway`** — it checks all names above.

## Verify THIS agent session

```bash
npm run env:debug-railway
```

If this prints **unset** for every key, **this VM has no token** — including Podomator in the same shell:

```bash
cd ../podomator && npm run env:debug-railway
```

If both are unset, the token is not injected into **this** cloud agent run (not an AutoTube-only bug).

### “Global” Cursor secret works in other projects but not here

1. **Same worker, same truth:** In one agent shell, run Podomator’s `npm run env:debug-railway` — if it is also unset, the global secret is **not in this VM**, regardless of AutoTube.
2. **Other sessions that “work” are often different:**
   - **Mac Cursor app** → `railway login` → `~/.config/railway/token` (cloud agents do not get that file).
   - **Podomator** → gitignored `.env.local` from an earlier `env:fetch-railway` (app vars, not always the API token).
   - **Different Cloud Agent environment** → secret attached to `railway-Podomator` but not `railway-AutoTube`.
3. **Fix for AutoTube agent:** Cursor → Cloud Agents → **Environments** → open **railway-AutoTube** → ensure **Railway** or **RAILWAY_API_TOKEN** is listed → new agent run.
4. **Or** add `RAILWAY_API_TOKEN=...` to AutoTube `.env.local` (gitignored) — scripts now read it.

## If secret is in Cursor but debug shows unset

1. Secret name is **`Railway`** or **`RAILWAY_API_TOKEN`** (value from [railway.com/account/tokens](https://railway.com/account/tokens) — not SSH key, not `ghp_`, not `crsr_`).
2. **Start a new agent run** after saving the secret (injection happens at VM boot).
3. If you use a **saved environment / snapshot**, refresh it so new secrets are included.

## Connect GitHub (when token is present)

```bash
npm run railway:connect
```

Or push `master` after connecting repo once in Railway UI.

## Worker vs AutoTube project

`cursor-worker` injects `RAILWAY_PROJECT_ID` for **cursor-self-hosted-worker**. Deploy scripts target **AutoTube-Deploy** by name via CLI — that is correct and unrelated to the worker’s project id.

## AutoTube app secrets (production service)

| Variable | Role |
|----------|------|
| **`OPENROUTER_API_KEY`** | Server-only LLM key (`/api/llm`). Do **not** set `VITE_OPENROUTER_KEY` on Railway for production images. |
| **`AUTOTUBE_API_KEY`** | Required in `NODE_ENV=production`. Clients send the same value as `X-API-Key` (Settings → AutoTube API Key). `/api/health` stays public. |
| **`SERPER_API_KEY`** | Optional server image search |
| **`PEXELS_API_KEY` / `PIXABAY_API_KEY`** | Optional stock media (server-side) |

Generate a long random `AUTOTUBE_API_KEY`, set it on Railway, and enter the same value in the AutoTube Settings modal (or `VITE_AUTOTUBE_API_KEY` for local `.env.local` only).
