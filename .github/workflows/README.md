# GitHub Actions

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `ci.yml` | Pushes and pull requests targeting `master`; manual dispatch | Runs the server-render sync check, TypeScript lint/typecheck, and unit tests. Manual runs also execute the Playwright smoke suite and short render fixture gate. |
| `ghcr-image.yml` | Successful `CI` completion for a push to `master`; manual dispatch | Builds the tested commit and publishes SHA and `latest` tags to GHCR. There is no direct push trigger. |
| `railway-deploy-ghcr.yml` | Successful `GHCR image` completion; manual dispatch | Deploys the SHA-tagged GHCR image to Railway through the registry-pull script. |

## Automatic release chain

`master` push → `CI` succeeds → `GHCR image` publishes that commit → `Railway deploy GHCR` deploys the same SHA-tagged image.

Failed CI runs do not build or deploy an image. Manual dispatches are explicit
operator overrides.
