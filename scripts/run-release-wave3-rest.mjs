#!/usr/bin/env node
/** Release×6 slices 6–23 (wave-3 continuation). */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const steps = [
  ['release 6-11', ['run', 'eval:unseen', '--', '--set', 'release', '--offset', '6', '--max', '6']],
  ['release 12-17', ['run', 'eval:unseen', '--', '--set', 'release', '--offset', '12', '--max', '6']],
  ['release 18-23', ['run', 'eval:unseen', '--', '--set', 'release', '--offset', '18', '--max', '6']],
];

for (const [label, args] of steps) {
  console.log(`\n${'='.repeat(60)}\n▶ ${label}\n${'='.repeat(60)}`);
  const r = spawnSync('npm', args, { cwd: ROOT, stdio: 'inherit', env: process.env });
  if (r.status !== 0) {
    console.error(`Stopped after ${label}`);
    process.exit(r.status || 1);
  }
}
console.log('\n✅ Wave-3 release slices 6–23 complete');
