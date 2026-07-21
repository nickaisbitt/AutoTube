#!/usr/bin/env node
/** Cold sensor: dev×2 then release×6 after P0–P3 fixes. */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const steps = [
  ['dev×2', ['run', 'eval:unseen', '--', '--set', 'dev', '--max', '2']],
  ['release 0-5', ['run', 'eval:unseen', '--', '--set', 'release', '--offset', '0', '--max', '6']],
];
for (const [label, args] of steps) {
  console.log(`\n${'='.repeat(60)}\n▶ ${label}\n${'='.repeat(60)}`);
  const r = spawnSync('npm', args, { cwd: ROOT, stdio: 'inherit', env: process.env });
  console.log(`\n■ ${label} exit=${r.status}`);
  if (r.status !== 0) process.exit(r.status || 1);
}
console.log('\n✅ Sensor chain complete');
