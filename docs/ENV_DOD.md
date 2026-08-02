# Environment Variables — Definition of Done

This document maps every environment variable that the AutoTube scripts and
Vite dev server need, explains which quality gates each key unlocks, and
records the key-presence state of this VM as of the last audit.

---

## How Vite loads `.env.local`

Vite reads `.env.local` at startup.  Place keys there (copy from
`.env.example`).  The file is `.gitignore`d — never commit it.

> **Restart required.**  After creating or changing `.env.local`, stop and
> restart `npm run dev` so Vite re-reads the file and injects the new values
> into both the dev-server middleware (`process.env`) and the browser bundle
> (`import.meta.env`).

---

## Required keys — `npm run generate:video`

These keys must be present for the full video-generation pipeline to run.

| Variable | Where used | Notes |
|---|---|---|
| `OPENROUTER_API_KEY` | Server-side `/api/llm`; `generate:video` | Preferred — never exposed to browser |
| `VITE_OPENROUTER_KEY` | Browser BYOK fallback | Set to the same value locally; **never put this in production builds** |
| `AUTOTUBE_API_KEY` | All `/api/*` routes (except `/api/health`) | Dev server reads this from `.env.local`; clients send it as `X-API-Key` |
| `VITE_AUTOTUBE_API_KEY` | Prefills browser Settings key for Playwright / local dev | Set to the same value as `AUTOTUBE_API_KEY` locally; **never set in production builds** |

If `AUTOTUBE_API_KEY` is absent, every authenticated API call returns 401 and
the onboarding modal blocks the UI.

---

## Motion harvest — primary path (no stock keys required)

The product path for upload-ready ≥ 7 is **raw web harvest**, not stock APIs.
`scripts/lib/generate-full-video.mjs` assembles motion from:

- **Bing / Google / DuckDuckGo** — topical image and clip discovery
- **Archive.org** — historical footage and stills
- **yt-dlp** — direct clip download when a URL resolves to playable video

These sources run in the default **keyless** pipeline. No Pexels or Pixabay
keys are required to generate, score, or prove upload-ready quality.

Current open bars on this VM are **web-motion gate recognition** (watcher
honesty on web-harvest output), **CLI top-up diversity** (segment/asset floors
without thin Archive-only pools), and **upload-ready ≥ 7 via web-harvest proof**
— not “add stock keys.”

### Optional stock keys (niceties, not DoD)

Pexels and Pixabay are **optional** supplemental sources. When present,
`resolveStockKeyMode()` returns `{ mode: 'keyed' }` and the pipeline may
fetch additional topical face/cabin/apartment clips. When absent, harvest
continues on the raw-web path above.

| Variable | Where used | Fallback accepted |
|---|---|---|
| `PEXELS_API_KEY` | Server-side Pexels proxy `/api/search-pexels` | Yes — `VITE_PEXELS_KEY` |
| `VITE_PEXELS_KEY` | Browser BYOK; local dev without full server | Yes — `PEXELS_API_KEY` |
| `PIXABAY_API_KEY` | Server-side Pixabay proxy `/api/search-pixabay` | Yes — `VITE_PIXABAY_KEY` |
| `VITE_PIXABAY_KEY` | Browser BYOK; local dev without full server | Yes — `PIXABAY_API_KEY` |

Neither Pexels nor Pixabay keys is set on this VM. That is expected for
web-harvest proof runs; it does **not** block the DoD path.

---

## Optional keys

| Variable | Purpose | Presence |
|---|---|---|
| `AUTOTUBE_RAILWAY_TOKEN` | Preferred token for `railway:completion-check` / deploy GraphQL (personal or team API token) | **ABSENT** — required to close §C deploy currency on Railway worker VMs |
| `RAILWAY_API_TOKEN` | Fallback token for Railway scripts | **PRESENT** — cursor-worker *service* credential; rejected by backboard GQL (`Not Authorized`). Do **not** treat as deploy-ready. |
| `VITE_CF_ACCOUNT_ID` / `VITE_CF_STREAM_TOKEN` | Cloudflare Stream upload in browser | **PRESENT** — invalid/truncated; upload skipped by code guard |
| `VITE_KOKORO_SERVER_URL` | Kokoro TTS server (external Docker) | **PRESENT** — host returns HTTP 404; TTS falls back to espeak-ng |

### Railway deploy token (human action)

On `railway-AutoTube` / cursor-worker VMs, Railway injects a **runtime service**
`RAILWAY_API_TOKEN`. That value shows `SET` in `npm run env:debug-railway` but
cannot call `backboard.railway.app/graphql` (exit **2** from `env:debug-railway`
when only the worker credential is present; `railway:completion-check` still
exits **1** with `Not Authorized`).

Unblock §C:

```bash
# 1) Create Personal/Team token: https://railway.app/account/tokens
# 2) Prefer a separate env name so the worker runtime token is left alone:
echo 'AUTOTUBE_RAILWAY_TOKEN=<personal-or-team-token>' >> .env.local
# 3) Verify:
npm run env:debug-railway          # should source AUTOTUBE_RAILWAY_TOKEN (exit 0)
npm run railway:completion-check   # exit 0 only when prod SHA/image == local HEAD
```

Alternatively set `AUTOTUBE_RAILWAY_TOKEN` as a Cursor Environment secret on
**railway-AutoTube** and start a new agent (secrets inject at VM boot).

---

## Commands

| Command | What it does | Keys needed |
|---|---|---|
| `npm run dod:check` | Checks structural DoD bars (stale-tree absence, server-render sync); exits 1 on failure | None |
| `npm run generate:video -- "<topic>"` | Full video-generation pipeline (raw web harvest) | `OPENROUTER_API_KEY` (or `VITE_OPENROUTER_KEY`) + `AUTOTUBE_API_KEY` + dev server running + ffmpeg |
| `npm run watch:video -- <final.mp4>` | Vision-judges a rendered video; exits 0 when upload-ready | `OPENROUTER_API_KEY` + `AUTOTUBE_API_KEY`; scores ≥ 7 require web-harvest motion quality, not stock keys |
| `npm run dod:watch` | Alias for `watch:video` | Same as above |
| `npm run railway:completion-check` | Verifies prod deploy matches HEAD | `AUTOTUBE_RAILWAY_TOKEN` (preferred) or personal/team `RAILWAY_API_TOKEN` — worker service credential fails |
| `npm run env:debug-railway` | Token presence + scope hint | Exit **2** when only worker runtime credential is present |

> `dod:check` is fast and requires no API keys.  It does **not** enforce
> quality bars — those require a real generated video evaluated by
> `watch:video`.

---

## Key presence table — this VM

Presence was verified against `.env.local` at repo root.  Secret values are
not shown.

| Variable | Present | Gate unlocked |
|---|---|---|
| `OPENROUTER_API_KEY` | ✅ yes | LLM script generation |
| `VITE_OPENROUTER_KEY` | ✅ yes | Browser BYOK fallback |
| `AUTOTUBE_API_KEY` | ✅ yes | API auth gate |
| `VITE_AUTOTUBE_API_KEY` | ✅ yes | Browser auto-fill |
| `PEXELS_API_KEY` | ❌ not set | Optional Pexels supplement (not required for DoD) |
| `VITE_PEXELS_KEY` | ❌ not set | Optional Pexels BYOK (not required for DoD) |
| `PIXABAY_API_KEY` | ❌ not set | Optional Pixabay supplement (not required for DoD) |
| `VITE_PIXABAY_KEY` | ❌ not set | Optional Pixabay BYOK (not required for DoD) |
| `AUTOTUBE_RAILWAY_TOKEN` | ❌ not set | Preferred GraphQL/deploy token — **blocks §C** until set |
| `RAILWAY_API_TOKEN` | ⚠️ present (wrong scope) | Worker service credential; `env:debug-railway` exit 2; `railway:completion-check` Not Authorized |
| `VITE_CF_ACCOUNT_ID` / `VITE_CF_STREAM_TOKEN` | ⚠️ present (invalid) | Cloudflare Stream upload (skipped by code) |
| `VITE_KOKORO_SERVER_URL` | ⚠️ present (404) | Kokoro TTS (falls back to espeak-ng) |

> Upload-ready ≥ 7 is proven with raw web harvest (Bing/Google/DDG/Archive/
> yt-dlp), watcher exit 0, and honest brutal raw scores — not by adding
> stock keys. Airline cold-topic proof: airline-web8 raw **7.8** / upload-ready
> YES (`pexels=0 pixabay=0`, youtube inject skipped without cookies).
