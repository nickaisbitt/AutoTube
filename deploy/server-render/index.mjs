#!/usr/bin/env node
/**
 * AutoTube Server-Side Video Renderer — entrypoint
 *
 * Spawns the canonical root server-render.mjs (repo root), not the stale
 * deploy/server-render.mjs fork. Modules resolve via the postinstall symlink
 * server-render → deploy/server-render.
 *
 * Usage:
 *   node server-render/index.mjs [project.json] [output.mp4]
 */

import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
// This file lives at deploy/server-render/index.mjs (or via symlink server-render/index.mjs)
const repoRoot = join(__dirname, '..', '..');
const monolith = join(repoRoot, 'server-render.mjs');

if (!existsSync(monolith)) {
  console.error(
    `[server-render] Canonical monolith missing at ${monolith}. ` +
      'Ensure Docker/CI copies root server-render.mjs into the image.',
  );
  process.exit(1);
}

console.log(`[server-render] Spawning canonical monolith: ${monolith}`);

const args = process.argv.slice(2);
const child = spawn('node', [monolith, ...args], {
  cwd: repoRoot,
  stdio: 'inherit',
  env: process.env,
});

child.on('close', (code) => {
  process.exit(code ?? 1);
});
