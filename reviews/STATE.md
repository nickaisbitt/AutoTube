# Review State — AutoTube

## Last Full Review
- **Date:** 2026-07-13
- **Commit:** a7d064a
- **Scope:** Complete multi-agent audit (API, security, Railway/live, frontend, backend/render)
- **Report:** [reviews/2026-07-13-full-audit.md](./2026-07-13-full-audit.md)

## Per-Domain Status (2026-07-13)

| Domain | Last Review | P0 Open | P1 Open | Notes |
|--------|------------|---------|---------|-------|
| Frontend/UX | 2026-07-13 | 1 | 4+ | VideoPlayer P0 still open; PIN UI / QualityCheck / Timeline new |
| LLM & Prompts | 2026-07-13 | 0 | 1 | `callLLM` unused; specificity switch partial |
| Media Sourcing | 2026-07-13 | 0 | 1 | Harvest gates in loop only |
| TTS & Audio | 2026-07-13 | 0 | 0 | Prior TTS review file corrupt; chain OK but fragile |
| Video Render | 2026-07-13 | 1 | 2 | **P0: prod uses stale deploy monolith** |
| Backend/API | 2026-07-13 | 3 | 6 | No auth; render-output jail; projectPath fallback |
| DevOps/Deploy | 2026-07-13 | 1 | 2 | GHCR live OK; root `server-render.mjs` not in image; no push CI |
| QA/Testing | 2026-07-13 | 0 | 1 | E2E hits root monolith ≠ prod entry |

## Open P0s (must fix)

1. **Prod render drift** — GHCR never copies root `server-render.mjs`; API runs `deploy/server-render.mjs` without ffmpeg assembly / overlay chain.
2. **Unauthenticated public API** — all `/api/*` open on Railway.
3. **Client-bundled secrets** — Vite `define` + browser OpenRouter.
4. **Newest-`/tmp` project fallback** on server-render.
5. **`/api/render-output` reads any path under project root.**

## Open P1s (summary)

See full audit. Top of list: render child timeout, export-project leak, quality-check key in argv, rate-limit XFF, no push CI, frontend PIN/QualityCheck/Timeline/cancel.

## Live Railway (probed 2026-07-13)

- URL: `https://autotube-production.up.railway.app`
- Health: ok, image `ghcr.io/nickaisbitt/autotube:a7d064a…`, uptime ~34.6 days
- GraphQL platform audit: **not run** (no Railway token in audit environment)

## Prior review (2026-06-01) — superseded

June `STATE.md` claimed “No P0s remaining.” That claim is **obsolete**. Several June frontend P0s (toasts, New Video confirm, keyboard) remain fixed; VideoPlayer and many P1s never closed. Backend/render P0s reopened via deploy drift.

## Review Triggers
- **PR opened:** Always security + API agents. Additional by file-glob.
- **On-demand:** Full multi-agent audit (this report).
- **Deploy failure:** DevOps + render path verification (image contents + `/api/health` deploy block).
- **New dependency:** Security + CI.

## Stale Audit MDs
14 root-level audit reports archived under `reviews/_archive/`. Prefer `2026-07-13-full-audit.md` + `SYSTEM_CONTEXT.md`.
