#!/usr/bin/env bash
# Run at agent boot — diagnostic only (no secret values printed).
set -e
check() { eval "echo \"  $1 len=\${#$1}\""; }
echo "[autotube] Agent secret diagnostics:"
check RAILWAY_TOKEN
check RAILWAY_API_TOKEN
check OPENROUTER_API_KEY
check VITE_OPENROUTER_KEY
echo "  RAILWAY_SERVICE_NAME=${RAILWAY_SERVICE_NAME:-}"
echo "  RAILWAY_PROJECT_NAME=${RAILWAY_PROJECT_NAME:-}"
if [ -z "${RAILWAY_TOKEN:-}" ]; then
  echo "  WARN: RAILWAY_TOKEN missing — see docs/RAILWAY_WORKER_SECRETS.md"
fi
