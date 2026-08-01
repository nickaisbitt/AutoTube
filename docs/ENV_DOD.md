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
| `RAILWAY_API_TOKEN` | `npm run railway:completion-check` — verifies prod deploy/image matches local HEAD | **PRESENT** — cursor-worker *service* credential; rejected by backboard GQL (`Not Authorized`). Needs a Railway personal API token. |
| `VITE_CF_ACCOUNT_ID` / `VITE_CF_STREAM_TOKEN` | Cloudflare Stream upload in browser | **PRESENT** — invalid/truncated; upload skipped by code guard |
| `VITE_KOKORO_SERVER_URL` | Kokoro TTS server (external Docker) | **PRESENT** — host returns HTTP 404; TTS falls back to espeak-ng |

---

## Commands

| Command | What it does | Keys needed |
|---|---|---|
| `npm run dod:check` | Checks structural DoD bars (stale-tree absence, server-render sync); exits 1 on failure | None |
| `npm run generate:video -- "<topic>"` | Full video-generation pipeline (raw web harvest) | `OPENROUTER_API_KEY` (or `VITE_OPENROUTER_KEY`) + `AUTOTUBE_API_KEY` + dev server running + ffmpeg |
| `npm run watch:video -- <final.mp4>` | Vision-judges a rendered video; exits 0 when upload-ready | `OPENROUTER_API_KEY` + `AUTOTUBE_API_KEY`; scores ≥ 7 require web-harvest motion quality, not stock keys |
| `npm run dod:watch` | Alias for `watch:video` | Same as above |
| `npm run railway:completion-check` | Verifies prod deploy matches HEAD | `RAILWAY_API_TOKEN` (personal/team token — service credential fails) |

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
| `RAILWAY_API_TOKEN` | ⚠️ present (wrong scope) | `railway:completion-check` (currently fails — Not Authorized) |
| `VITE_CF_ACCOUNT_ID` / `VITE_CF_STREAM_TOKEN` | ⚠️ present (invalid) | Cloudflare Stream upload (skipped by code) |
| `VITE_KOKORO_SERVER_URL` | ⚠️ present (404) | Kokoro TTS (falls back to espeak-ng) |

> Upload-ready ≥ 7 is proven with raw web harvest (Bing/Google/DDG/Archive/
> yt-dlp), watcher exit 0, and honest brutal raw scores — not by adding
> stock keys.
