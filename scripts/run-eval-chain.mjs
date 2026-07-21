#!/usr/bin/env node
/**
 * Sequential cold-eval chain: dev×2 sensor then release×24 (4×6 slices).
 * Retries generate failures from THIS chain's output dirs only.
 */
import { spawnSync, execSync } from 'node:child_process';
import { readdirSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const chainStartedAt = Date.now();

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

/** Dirs created during this chain run (mtime after chain start). */
function chainDirs(prefix) {
  const root = join(ROOT, 'test-recordings');
  return readdirSync(root)
    .filter((d) => d.startsWith(prefix))
    .map((d) => join(root, d))
    .filter((p) => {
      try {
        return statSync(p).isDirectory() && statSync(p).mtimeMs >= chainStartedAt - 60_000;
      } catch {
        return false;
      }
    })
    .map((p) => p.split('/').pop())
    .sort();
}

const dirs = [...chainDirs('eval-dev-'), ...chainDirs('eval-release-')];
console.log(`↻ Retrying failures from chain dirs: ${dirs.join(', ') || '(none)'}`);
if (dirs.length) {
  spawnSync(
    'node',
    ['scripts/retry-eval-failures.mjs', `--dirs=${dirs.join(',')}`],
    { cwd: ROOT, stdio: 'inherit' },
  );
}

spawnSync('node', ['scripts/aggregate-eval-summaries.mjs', 'eval-release'], {
  cwd: ROOT,
  stdio: 'inherit',
});

try {
  execSync('node scripts/aggregate-wave2-merged.mjs', { cwd: ROOT, stdio: 'inherit' });
} catch {
  /* optional */
}
process.exit(0);
