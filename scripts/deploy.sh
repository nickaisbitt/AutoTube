#!/bin/bash
# OPTIONAL manual Railway deploy (sync deploy/ + railway up).
# Normal production path: git push master → Railway GitHub autodeploy from repo root.
# Usage: RAILWAY_TOKEN=... ./scripts/deploy.sh

set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY_DIR="$ROOT/deploy"

# Portable sync helper (rsync if present, else cp -r + cleanup). Keeps deploy/ robust in all envs (incl. minimal cloud agents without rsync).
sync_dir() {
  local src="$1" dst="$2"
  mkdir -p "$dst"
  if command -v rsync >/dev/null 2>&1; then
    rsync -av --exclude='__tests__/' --exclude='node_modules/' --exclude='__pycache__/' "$src" "$dst"
  else
    echo "rsync not found; using cp -r fallback for $src -> $dst"
    # copy contents into dst (not the dir itself)
    cp -r "$src." "$dst" 2>/dev/null || cp -r "$src"* "$dst" 2>/dev/null || cp -a "$src"/* "$dst"/ 2>/dev/null || true
    # cleanup excludes in dest
    rm -rf "$dst/__tests__" "$dst/node_modules" "$dst/__pycache__" 2>/dev/null || true
    find "$dst" -type d -name '__pycache__' -prune -exec rm -rf {} + 2>/dev/null || true
  fi
}

echo "Syncing server code..."
# Sync server code into deploy/ (no --delete to avoid wiping other dirs)
sync_dir "$ROOT/server/" "$DEPLOY_DIR/server/"

echo "Syncing server-render..."
# Canonical modules may live only under deploy/ — ensure root path exists for local dev
if [ ! -d "$ROOT/server-render" ] && [ -d "$ROOT/deploy/server-render" ]; then
  ln -sf deploy/server-render "$ROOT/server-render"
fi
if [ -d "$ROOT/server-render" ]; then
  sync_dir "$ROOT/server-render/" "$DEPLOY_DIR/server-render/"
else
  echo "WARN: server-render/ not found at repo root or deploy/"
fi

# Keep deploy copy in sync for legacy paths; production API uses root monolith.
# Canonical file must also be present at repo root for Docker COPY.
node "$ROOT/scripts/sync-server-render-deploy.mjs"

# Sync monitoring.ts (only src file the server imports)
mkdir -p "$DEPLOY_DIR/src/services"
cp "$ROOT/src/services/monitoring.ts" "$DEPLOY_DIR/src/services/"

# Sync dist/ (carefully - only update, don't delete)
if [ -d "$ROOT/dist" ]; then
  echo "Syncing dist..."
  mkdir -p "$DEPLOY_DIR/dist"
  if command -v rsync >/dev/null 2>&1; then
    rsync -av "$ROOT/dist/" "$DEPLOY_DIR/dist/"
  else
    echo "rsync not found; using cp -r fallback for dist/"
    cp -r "$ROOT/dist/." "$DEPLOY_DIR/dist/" 2>/dev/null || cp -a "$ROOT/dist"/* "$DEPLOY_DIR/dist"/ 2>/dev/null || true
  fi
fi

# Sync server.mjs
cp "$ROOT/server.mjs" "$DEPLOY_DIR/"

# Sync root package files so Railway build context has deps + scripts
cp "$ROOT/package.json" "$DEPLOY_DIR/"
cp "$ROOT/package-lock.json" "$DEPLOY_DIR/" 2>/dev/null || true

# Sync public/ (audio, static assets)
if [ -d "$ROOT/public" ]; then
  echo "Syncing public/..."
  mkdir -p "$DEPLOY_DIR/public"
  if command -v rsync >/dev/null 2>&1; then
    rsync -av --exclude='node_modules/' "$ROOT/public/" "$DEPLOY_DIR/public/"
  else
    echo "rsync not found; using cp -r fallback for public/"
    cp -r "$ROOT/public/." "$DEPLOY_DIR/public/" 2>/dev/null || cp -a "$ROOT/public"/* "$DEPLOY_DIR/public"/ 2>/dev/null || true
    rm -rf "$DEPLOY_DIR/public/node_modules" 2>/dev/null || true
  fi
fi

# Sync config files for Railway
cp "$ROOT/railway.toml" "$DEPLOY_DIR/"
cp "$ROOT/nixpacks.toml" "$DEPLOY_DIR/"

# Deploy
echo "Deploying to Railway..."
cd "$DEPLOY_DIR"

# Ensure dummy build script so Nixpacks does not attempt a full vite build
# (we pre-populate dist/ from the local build; root package.json has real "vite build")
# Run AFTER cd so relative package.json is the one in the Railway build context.
node -e '
  const fs = require("fs");
  const pjPath = "package.json";
  const pj = JSON.parse(fs.readFileSync(pjPath, "utf8"));
  pj.scripts = pj.scripts || {};
  pj.scripts.build = "echo '\''pre-built dist/ from root; skipping'\'' && exit 0";
  fs.writeFileSync(pjPath, JSON.stringify(pj, null, 2) + "\n");
  console.log("Patched deploy/package.json build to dummy for Railway");
' || echo "WARN: could not patch dummy build script"

if [ -n "${RAILWAY_TOKEN:-}" ]; then
  :
elif [ -n "${RAILWAY_API_TOKEN:-}" ]; then
  export RAILWAY_TOKEN="$RAILWAY_API_TOKEN"
elif [ -n "${Railway:-}" ]; then
  export RAILWAY_TOKEN="$Railway"
else
  echo "ERROR: RAILWAY_TOKEN is not set (also checked RAILWAY_API_TOKEN, Railway)."
  echo "Add in Cursor Cloud Agent secrets or GitHub Actions secrets, then export before deploy."
  exit 1
fi
export RAILWAY_TOKEN
npx @railway/cli up
echo ""
echo "Deployed! Check: https://autotube-production.up.railway.app/api/health"

