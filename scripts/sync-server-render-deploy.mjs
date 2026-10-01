#!/usr/bin/env node
/**
 * Keep deploy/server-render.mjs in sync with the canonical root monolith.
 * Production spawn uses root server-render.mjs; this copy is only for legacy
 * paths and drift detection.
 *
 * Usage:
 *   node scripts/sync-server-render-deploy.mjs          # copy root → deploy
 *   node scripts/sync-server-render-deploy.mjs --check  # exit 1 if drifted
 */
import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const canonical = join(root, 'server-render.mjs');
const deployCopy = join(root, 'deploy', 'server-render.mjs');

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

if (!existsSync(canonical)) {
  console.error('[sync-server-render] Missing root server-render.mjs');
  process.exit(1);
}

const checkOnly = process.argv.includes('--check');

if (checkOnly) {
  if (!existsSync(deployCopy)) {
    console.error('[sync-server-render] deploy/server-render.mjs missing — run sync without --check');
    process.exit(1);
  }
  const a = sha256(canonical);
  const b = sha256(deployCopy);
  if (a !== b) {
    console.error(
      '[sync-server-render] DRIFT: deploy/server-render.mjs != root server-render.mjs\n' +
        `  root:   ${a}\n` +
        `  deploy: ${b}\n` +
        '  Fix: node scripts/sync-server-render-deploy.mjs',
    );
    process.exit(1);
  }
  console.log('[sync-server-render] OK — deploy copy matches root');
  process.exit(0);
}

copyFileSync(canonical, deployCopy);
console.log('[sync-server-render] Synced root server-render.mjs → deploy/server-render.mjs');
