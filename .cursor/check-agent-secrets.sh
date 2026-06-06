#!/usr/bin/env bash
# Run at agent boot — diagnostic only (no secret values printed).
# Mirrors Cursor secret "Railway" → RAILWAY_API_TOKEN when present.
set -e
check() { eval "echo \"  $1 len=\${#$1}\""; }

# Mirror Cursor secret name into RAILWAY_API_TOKEN for scripts that only check that name.
if [ -n "${Railway:-}" ] && [ -z "${RAILWAY_API_TOKEN:-}" ]; then
  export RAILWAY_API_TOKEN="$Railway"
fi
if [ -n "${RAILWAY_API_TOKEN:-}" ] && [ -z "${RAILWAY_TOKEN:-}" ]; then
  export RAILWAY_TOKEN="$RAILWAY_API_TOKEN"
fi

echo "[autotube] Agent secret diagnostics:"
check Railway
check RAILWAY_API_TOKEN
check RAILWAY_TOKEN
check OPENROUTER_API_KEY
check VITE_OPENROUTER_KEY
echo "  RAILWAY_SERVICE_NAME=${RAILWAY_SERVICE_NAME:-}"
echo "  RAILWAY_PROJECT_NAME=${RAILWAY_PROJECT_NAME:-}"
if [ -z "${RAILWAY_API_TOKEN:-}" ] && [ -z "${Railway:-}" ]; then
  echo "  WARN: Railway / RAILWAY_API_TOKEN missing — see docs/RAILWAY_WORKER_SECRETS.md"
fi
