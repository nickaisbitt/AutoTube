#!/usr/bin/env node
/**
 * Ensures server-render/ exists at repo root (symlink to deploy/server-render).
 * server-render.mjs imports ./server-render/*.mjs — without this path, server renders fail.
 */
import { existsSync, symlinkSync, lstatSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(root, 'server-render');
const source = join(root, 'deploy', 'server-render');

if (existsSync(target)) {
  process.exit(0);
}

if (!existsSync(source)) {
  console.warn('[ensure-server-render] deploy/server-render missing — skip symlink');
  process.exit(0);
}

try {
  symlinkSync(source, target);
  console.log('[ensure-server-render] Linked server-render → deploy/server-render');
} catch (err) {
  if (err.code === 'EEXIST') {
    const stat = lstatSync(target);
    if (stat.isSymbolicLink()) process.exit(0);
  }
  console.error('[ensure-server-render] Failed:', err.message);
  process.exit(1);
}
