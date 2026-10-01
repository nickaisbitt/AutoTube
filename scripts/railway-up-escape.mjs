#!/usr/bin/env node
/**
 * Local build → Railway upload (bypasses builder snapshot path).
 * Usage: npm run railway:up
 * Requires Railway CLI installed and linked to AutoTube-Deploy / autotube.
 */
import { spawnSync } from 'node:child_process';

const which = spawnSync('which', ['railway'], { encoding: 'utf8' });
if (which.status !== 0) {
  console.error('Railway CLI not found. Install: npm i -g @railway/cli');
  console.error('Then: railway login && railway link');
  process.exit(1);
}

console.log('Uploading local tree via `railway up` (escape hatch for snapshot failures)…\n');
const r = spawnSync('railway', ['up', '--service', 'autotube'], {
  stdio: 'inherit',
  env: process.env,
  cwd: process.cwd(),
});
process.exit(r.status ?? 1);
