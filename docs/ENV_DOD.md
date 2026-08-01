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

## Required for upload-ready score ≥ 7 — stock media keys

`scripts/lib/generate-full-video.mjs` calls `resolveStockKeyMode()` to decide
the stock-footage strategy:

- **`keyed` mode** (Pexels and/or Pixabay available) — topical face/cabin/
  apartment clips are fetched aggressively; quality scores routinely reach
  upload-ready.
- **`keyless` mode** (neither key present) — Archive.org is the only motion
  source; scores are systematically lower and upload-ready ≥ 7 is unlikely.

| Variable | Where used | Fallback accepted |
|---|---|---|
| `PEXELS_API_KEY` | Server-side Pexels proxy `/api/search-pexels` | Yes — `VITE_PEXELS_KEY` |
| `VITE_PEXELS_KEY` | Browser BYOK; local dev without full server | Yes — `PEXELS_API_KEY` |
| `PIXABAY_API_KEY` | Server-side Pixabay proxy `/api/search-pixabay` | Yes — `VITE_PIXABAY_KEY` |
| `VITE_PIXABAY_KEY` | Browser BYOK; local dev without full server | Yes — `PIXABAY_API_KEY` |

At least one of `PEXELS_API_KEY` / `VITE_PEXELS_KEY` **or**
`PIXABAY_API_KEY` / `VITE_PIXABAY_KEY` must be non-empty to enable keyed
mode.

> **⚠ MISSING on this VM.**  Neither `PEXELS_API_KEY` nor `PIXABAY_API_KEY`
> (nor their `VITE_` variants) is set in `.env.local`.  `resolveStockKeyMode()`
> returns `{ mode: 'keyless' }`.  Generated videos will fall back to
> Archive.org only and will not reach upload-ready ≥ 7 without these keys.

---

## Optional keys

| Variable | Purpose | Presence |
|---|---|---|
| `RAILWAY_API_TOKEN` | `npm run railway:completion-check` — verifies production deploy/image matches local HEAD | **PRESENT on this VM** |

---

## Commands

| Command | What it does | Keys needed |
|---|---|---|
| `npm run dod:check` | Checks structural DoD bars (stale-tree absence, server-render sync); exits 1 on failure | None |
| `npm run generate:video -- "<topic>"` | Full video-generation pipeline | `OPENROUTER_API_KEY` (or `VITE_OPENROUTER_KEY`) + `AUTOTUBE_API_KEY` + dev server running + ffmpeg |
| `npm run watch:video -- <final.mp4>` | Vision-judges a rendered video; exits 0 when upload-ready | `OPENROUTER_API_KEY` + `AUTOTUBE_API_KEY`; Pexels/Pixabay needed during generation for scores ≥ 7 |
| `npm run dod:watch` | Alias for `watch:video` | Same as above |
| `npm run railway:completion-check` | Verifies prod deploy matches HEAD | `RAILWAY_API_TOKEN` |

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
| `PEXELS_API_KEY` | ❌ **MISSING** | Keyed stock footage (Pexels) |
| `VITE_PEXELS_KEY` | ❌ **MISSING** | Keyed stock footage (Pexels, BYOK) |
| `PIXABAY_API_KEY` | ❌ **MISSING** | Keyed stock footage (Pixabay) |
| `VITE_PIXABAY_KEY` | ❌ **MISSING** | Keyed stock footage (Pixabay, BYOK) |
| `RAILWAY_API_TOKEN` | ✅ yes | `railway:completion-check` |

> Add at least one Pexels or Pixabay key to `.env.local` and restart the dev
> server to reach upload-ready ≥ 7.  Keys for both providers together give the
> widest topical clip coverage.
