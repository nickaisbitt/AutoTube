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
  if [ -n "${AUTOTUBE_RAILWAY_TOKEN:-}" ]; then echo "$AUTOTUBE_RAILWAY_TOKEN"; return; fi
  if [ -f "${HOME}/.railway/config.json" ] && command -v jq >/dev/null 2>&1; then
    jq -r '.user.token // empty' "${HOME}/.railway/config.json"
    return
  fi
  echo ""
}

echo "Secret check (lengths only):"
for v in RAILWAY_TOKEN RAILWAY_API_TOKEN Railway AUTOTUBE_RAILWAY_TOKEN; do
  eval "len=\${#${v}}"
  echo "  $v=$len"
done
echo "  (worker: ${RAILWAY_SERVICE_NAME:-unknown} @ ${RAILWAY_PROJECT_NAME:-unknown})"

TOKEN="$(resolve_token)"
if [ -z "$TOKEN" ]; then
  echo ""
  echo "ERROR: RAILWAY_TOKEN is not in this shell."
  echo "  Cursor Dashboard secrets often do NOT inject into self-hosted Railway workers."
  echo "  Fix: Railway → cursor-self-hosted-worker → cursor-worker → Variables → RAILWAY_TOKEN"
  echo "       Then restart cursor-worker and start a NEW agent session."
  echo "  See: docs/RAILWAY_WORKER_SECRETS.md"
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
