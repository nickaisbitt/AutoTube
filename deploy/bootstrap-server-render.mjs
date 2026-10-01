#!/usr/bin/env node
/**
 * Railway/Railpack postinstall: link server-render → deploy/server-render.
 * Lives under deploy/ so it is never stripped by .dockerignore scripts/ rules.
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
  console.warn('[bootstrap-server-render] deploy/server-render missing — skip');
  process.exit(0);
}

try {
  symlinkSync(source, target);
  console.log('[bootstrap-server-render] Linked server-render → deploy/server-render');
} catch (err) {
  if (err.code === 'EEXIST') {
    const stat = lstatSync(target);
    if (stat.isSymbolicLink()) process.exit(0);
  }
  console.error('[bootstrap-server-render] Failed:', err.message);
  process.exit(1);
}
