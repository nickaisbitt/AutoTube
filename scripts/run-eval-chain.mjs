#!/usr/bin/env node
/**
 * Sequential cold-eval chain: dev×2 sensor then release×24 (4×6 slices).
 * Usage: node scripts/run-eval-chain.mjs
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const steps = [
  ['dev×2 sensor', ['run', 'eval:unseen', '--', '--set', 'dev', '--max', '2']],
  ['release 0-5', ['run', 'eval:unseen', '--', '--set', 'release', '--offset', '0', '--max', '6']],
  ['release 6-11', ['run', 'eval:unseen', '--', '--set', 'release', '--offset', '6', '--max', '6']],
  ['release 12-17', ['run', 'eval:unseen', '--', '--set', 'release', '--offset', '12', '--max', '6']],
  ['release 18-23', ['run', 'eval:unseen', '--', '--set', 'release', '--offset', '18', '--max', '6']],
];

for (const [label, args] of steps) {
  const started = new Date().toISOString();
  console.log(`\n${'='.repeat(60)}\n▶ ${label} @ ${started}\n${'='.repeat(60)}`);
  const r = spawnSync('npm', args, { cwd: ROOT, stdio: 'inherit', env: process.env });
  console.log(`\n■ ${label} exit=${r.status ?? 'null'} @ ${new Date().toISOString()}`);
  if (r.status !== 0) {
    console.error(`Chain stopped after ${label} (exit ${r.status})`);
    process.exit(r.status || 1);
  }
}

console.log('\n✅ Eval chain complete');
const agg = spawnSync('node', ['scripts/aggregate-eval-summaries.mjs', 'eval-release'], {
  cwd: ROOT,
  stdio: 'inherit',
});
const retry = spawnSync(
  'node',
  [
    'scripts/retry-eval-failures.mjs',
    '--dirs=eval-dev-2026-07-16T12-19-47-651Z,eval-release-2026-07-16T12-35-01-109Z,eval-release-2026-07-16T13-20-44-286Z,eval-release-2026-07-16T14-28-14-216Z,eval-release-2026-07-16T15-52-59-278Z',
  ],
  { cwd: ROOT, stdio: 'inherit' },
);
if (retry.status === 0) {
  spawnSync('node', ['scripts/aggregate-eval-summaries.mjs', 'eval-'], {
    cwd: ROOT,
    stdio: 'inherit',
  });
}
process.exit(agg.status || retry.status || 0);
