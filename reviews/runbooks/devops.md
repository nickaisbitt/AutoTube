# DevOps/Deploy Runbook
## Scope
- railway.toml, Dockerfile, docker-compose*, CI/CD configs, scripts/
## Questions to ask
1. Are build and deploy steps reproducible (pinned base images, lockfiles)?
2. Is the health-check endpoint reliable and fast?
3. Are environment variables documented and validated at startup?
4. Is there a rollback strategy for failed deployments?
5. Are container images scanned for vulnerabilities on a schedule?
6. Are logs structured and aggregated (not just console.log)?
7. Is the CI pipeline fast enough to not block merges (<10 min)?
## Tools
- grep for :latest tags, unpinned dependencies in Dockerfile
- Check for missing HEALTHCHECK in Dockerfile or railway.toml
