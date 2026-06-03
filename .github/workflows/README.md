# GitHub Actions

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `ci.yml` | **Manual only** (`workflow_dispatch`) | Optional lint / unit / e2e — does not run on push |

**Production deploy:** push to `master` → **Railway GitHub autodeploy** (not Actions).

Removed: `railway-deploy.yml`, `deploy.yml` (Docker/GHCR).
