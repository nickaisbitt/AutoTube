#!/bin/bash
# Deploy AutoTube to Railway
# Usage: ./scripts/deploy.sh

set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY_DIR="$ROOT/deploy"

# Sync server code into deploy/
rsync -av --delete \
  --exclude='__tests__/' \
  --exclude='quality-check/' \
  --exclude='node_modules/' \
  "$ROOT/server/" "$DEPLOY_DIR/server/"

# Sync monitoring.ts (only src file the server imports)
mkdir -p "$DEPLOY_DIR/src/services"
cp "$ROOT/src/services/monitoring.ts" "$DEPLOY_DIR/src/services/"

# Sync dist/ if it exists and is newer
if [ -d "$ROOT/dist" ]; then
  rsync -av --delete "$ROOT/dist/" "$DEPLOY_DIR/"
fi

# Deploy
cd "$DEPLOY_DIR"
railway up
echo ""
echo "Deployed! Check: https://autotube-app-production.up.railway.app/api/health"
