# Review State — AutoTube

## Last Full Review
- **Date:** 2026-07-13
- **Commit:** a7d064a (audit); remediation on branches `cursor/fix-prod-render-canonical-b040` → `cursor/p2-cleanup-b040`
- **Scope:** Complete multi-agent audit + full remediation plan (Phases 1–4)
- **Reports:** [2026-07-13-full-audit.md](./2026-07-13-full-audit.md) (if present on audit branch), this STATE

## Remediation status (2026-07-13)

| Phase | Branch / PR | Status |
|-------|-------------|--------|
| 1 Canonical render | `cursor/fix-prod-render-canonical-b040` | Implemented — root `server-render.mjs` in GHCR + spawn fix + drift guard |
| 2 Auth + secrets | `cursor/api-auth-and-secrets-b040` | Implemented — `AUTOTUBE_API_KEY`, path jails, `/api/llm`, no Vite secret define |
| 3 P1 harden | `cursor/p1-harden-ci-frontend-b040` | Implemented — timeouts, CI-on-push, frontend leftovers |
| 4 P2 cleanup | `cursor/p2-cleanup-b040` | Implemented — OpenAPI sync, ffmpeg concat fallback, completion-check, placeholder gate |

## Remaining follow-ups

- Set `AUTOTUBE_API_KEY` on Railway and enter the same value in Settings before relying on prod API.
- Redeploy via GHCR after merging Phases 1–4; run `railway:smoke`.
- Cull dead components listed in `src/components/_unused/README.md` when ready.
- Railway GraphQL platform audit still needs a token in the agent env.
- Optional: shrink GHCR image (drop unused `src/` from runtime) in a dedicated PR.

## Open P0s after remediation merge

None expected once Phases 1–2 are deployed to Railway with `AUTOTUBE_API_KEY` set. Until deploy: prod still runs pre-remediation image.

## Review Triggers
- **PR opened:** Security + API agents; render path check if Docker/server-render touched.
- **Deploy failure:** DevOps + `/api/health` deploy block + image tag vs git SHA.
- **Weekly / on-demand:** Full multi-agent audit.
