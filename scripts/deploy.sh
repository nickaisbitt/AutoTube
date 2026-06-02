#!/bin/bash
# Deploy AutoTube to Railway
# Usage: ./scripts/deploy.sh

set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY_DIR="$ROOT/deploy"

echo "Syncing server code..."
# Sync server code into deploy/ (no --delete to avoid wiping other dirs)
rsync -av \
  --exclude='__tests__/' \
  --exclude='quality-check/' \
  --exclude='node_modules/' \
  "$ROOT/server/" "$DEPLOY_DIR/server/"

echo "Syncing server-render..."
# Canonical modules may live only under deploy/ — ensure root path exists for local dev
if [ ! -d "$ROOT/server-render" ] && [ -d "$ROOT/deploy/server-render" ]; then
  ln -sf deploy/server-render "$ROOT/server-render"
fi
if [ -d "$ROOT/server-render" ]; then
  rsync -av \
    --exclude='__pycache__/' \
    --exclude='node_modules/' \
    "$ROOT/server-render/" "$DEPLOY_DIR/server-render/"
else
  echo "WARN: server-render/ not found at repo root or deploy/"
fi

# Sync server-render.mjs
cp "$ROOT/server-render.mjs" "$DEPLOY_DIR/"

# Sync monitoring.ts (only src file the server imports)
mkdir -p "$DEPLOY_DIR/src/services"
cp "$ROOT/src/services/monitoring.ts" "$DEPLOY_DIR/src/services/"

# Sync dist/ (carefully - only update, don't delete)
if [ -d "$ROOT/dist" ]; then
  echo "Syncing dist..."
  rsync -av "$ROOT/dist/" "$DEPLOY_DIR/"
fi

# Sync server.mjs
cp "$ROOT/server.mjs" "$DEPLOY_DIR/"

# Sync config files for Railway
cp "$ROOT/railway.toml" "$DEPLOY_DIR/"
cp "$ROOT/nixpacks.toml" "$DEPLOY_DIR/"

# Deploy
echo "Deploying to Railway..."
cd "$DEPLOY_DIR"
railway up
echo ""
echo "Deployed! Check: https://autotube-production.up.railway.app/api/health"

