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
