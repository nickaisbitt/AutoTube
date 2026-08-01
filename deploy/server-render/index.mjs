#!/usr/bin/env node
/**
 * AutoTube Server-Side Video Renderer — entrypoint
 *
 * Spawns the canonical root server-render.mjs (repo root), not the stale
 * deploy/server-render.mjs fork. Modules resolve via the postinstall symlink
 * server-render → deploy/server-render.
 *
 * Spawn contract (must match server/routes/serverRender.ts):
 *   - Project JSON: AUTOTUBE_PROJECT_PATH env var (absolute path).
 *   - argv[2]: output .mp4 path (optional; the monolith picks a default).
 *
 * Usage:
 *   AUTOTUBE_PROJECT_PATH=/tmp/autotube-project.json node server-render/index.mjs [output.mp4]
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

// Refuse the legacy [project.json, output.mp4] order: argv[2] is the output
// path, so a project file in that position would be overwritten by ffmpeg.
if (args[0] && /\.json$/i.test(args[0])) {
  console.error(
    `[server-render] Refusing to treat "${args[0]}" as the output path. ` +
      'Pass the project JSON via AUTOTUBE_PROJECT_PATH; argv[2] is the output .mp4 path.',
  );
  process.exit(1);
}

const child = spawn('node', [monolith, ...args], {
  cwd: repoRoot,
  stdio: 'inherit',
  env: process.env,
});

child.on('close', (code) => {
  process.exit(code ?? 1);
});
