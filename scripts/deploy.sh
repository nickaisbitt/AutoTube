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
  mkdir -p "$DEPLOY_DIR/dist"
  rsync -av "$ROOT/dist/" "$DEPLOY_DIR/dist/"
fi

# Sync server.mjs
cp "$ROOT/server.mjs" "$DEPLOY_DIR/"

# Sync root package files so Railway build context has deps + scripts
cp "$ROOT/package.json" "$DEPLOY_DIR/"
cp "$ROOT/package-lock.json" "$DEPLOY_DIR/" 2>/dev/null || true

# Ensure dummy build script so Nixpacks does not attempt a full vite build
# (we pre-populate dist/ from the local build; root package.json has real "vite build")
node -e '
  const fs = require("fs");
  const pjPath = "package.json";
  const pj = JSON.parse(fs.readFileSync(pjPath, "utf8"));
  pj.scripts = pj.scripts || {};
  pj.scripts.build = "echo '\''pre-built dist/ from root; skipping'\'' && exit 0";
  fs.writeFileSync(pjPath, JSON.stringify(pj, null, 2) + "\n");
  console.log("Patched deploy/package.json build to dummy for Railway");
' || echo "WARN: could not patch dummy build script"

# Sync public/ (audio, static assets)
if [ -d "$ROOT/public" ]; then
  echo "Syncing public/..."
  rsync -av --exclude='node_modules/' "$ROOT/public/" "$DEPLOY_DIR/public/"
fi

# Sync config files for Railway
cp "$ROOT/railway.toml" "$DEPLOY_DIR/"
cp "$ROOT/nixpacks.toml" "$DEPLOY_DIR/"

# Deploy
echo "Deploying to Railway..."
cd "$DEPLOY_DIR"
npx @railway/cli up || echo "railway up failed (likely missing RAILWAY_TOKEN or login — run 'npx @railway/cli login' and 'npx @railway/cli link' first, or export RAILWAY_TOKEN)"
echo ""
echo "Deployed (or attempted)! Check: https://autotube-production.up.railway.app/api/health"

