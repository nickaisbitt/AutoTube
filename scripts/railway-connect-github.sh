#!/usr/bin/env bash
# Connect the existing Railway service to GitHub (no dashboard clicks).
# Requires: RAILWAY_TOKEN in env (Cursor Cloud Agents → Secrets).
# One-time: Railway GitHub App must be installed on your GitHub account (Railway will prompt on first connect).

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

resolve_token() {
  if [ -n "${RAILWAY_TOKEN:-}" ]; then echo "$RAILWAY_TOKEN"; return; fi
  if [ -n "${RAILWAY_API_TOKEN:-}" ]; then echo "$RAILWAY_API_TOKEN"; return; fi
  if [ -n "${Railway:-}" ]; then echo "$Railway"; return; fi
  if [ -f "${HOME}/.railway/config.json" ] && command -v jq >/dev/null 2>&1; then
    jq -r '.user.token // empty' "${HOME}/.railway/config.json"
    return
  fi
  echo ""
}

TOKEN="$(resolve_token)"
if [ -z "$TOKEN" ]; then
  echo "ERROR: RAILWAY_TOKEN is not set."
  echo "  Add it in cursor.com → Cloud Agents → Secrets (name: RAILWAY_TOKEN), then restart the agent."
  exit 1
fi
export RAILWAY_TOKEN="$TOKEN"

PROJECT="${RAILWAY_PROJECT:-AutoTube-Deploy}"
ENVIRONMENT="${RAILWAY_ENVIRONMENT:-production}"
SERVICE="${RAILWAY_SERVICE:-autotube}"
REPO="${RAILWAY_REPO:-nickaisbitt/AutoTube}"
BRANCH="${RAILWAY_BRANCH:-master}"
# Empty = repo root (where railway.toml + nixpacks.toml live)
ROOT_DIR="${RAILWAY_ROOT_DIRECTORY:-}"

echo "Linking Railway project: $PROJECT / $ENVIRONMENT / service: $SERVICE"
railway link --project "$PROJECT" --environment "$ENVIRONMENT"
railway service link "$SERVICE"

echo "Setting GitHub source: $REPO @ $BRANCH (root: ${ROOT_DIR:-/})"
railway environment edit --service-config "$SERVICE" source.repo "$REPO"
railway environment edit --service-config "$SERVICE" source.branch "$BRANCH"
if [ -n "$ROOT_DIR" ]; then
  railway environment edit --service-config "$SERVICE" source.rootDirectory "$ROOT_DIR"
else
  # Clear subdir so deploy uses repo root
  railway environment edit --service-config "$SERVICE" source.rootDirectory ""
fi

echo "Triggering deploy from GitHub (latest $BRANCH)..."
railway redeploy --service "$SERVICE" --from-source --yes

echo ""
echo "Done. Open Railway → $PROJECT → $SERVICE → Deployments."
echo "Health: https://autotube-production.up.railway.app/api/health"
