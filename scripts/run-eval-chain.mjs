#!/usr/bin/env node
/**
 * Sequential cold-eval chain: dev×2 sensor then release×24 (4×6 slices).
 * Retries generate failures from THIS chain's output dirs only — the retry
 * pass is salvage/diagnostics and DOES NOT count toward release bars.
 *
 * Exit code is non-zero when either a step crashes OR the first-pass release
 * aggregate misses the release bars (generate success, upload-ready, critical
 * rate, raw median — see evalReleaseBars / eval/COLD-EVAL-WAVE4.md).
 *
 * HONESTY: keep-best polish, floored watcher scores, and known-topic stretches
 * are NOT cold proof. Bars are checked against this chain's first-pass release
 * slices only (never historical dirs, never the retry pass).
 */
import { spawnSync, execSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { evalReleaseBars, checkReleaseBars } from './lib/eval-flags.mjs';

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

console.log('\n✅ Eval chain steps complete');

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

// Release bars are checked against THIS chain's first-pass release slices only.
const releaseDirs = chainDirs('eval-release-');
if (!releaseDirs.length) {
  console.error('❌ No release eval dirs produced by this chain — cannot verify release bars');
  process.exit(1);
}
const aggRun = spawnSync(
  'node',
  ['scripts/aggregate-eval-summaries.mjs', `--dirs=${releaseDirs.join(',')}`],
  { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
);
if (aggRun.status !== 0 || !aggRun.stdout) {
  console.error(`❌ Aggregate failed (exit ${aggRun.status ?? 'null'}) — cannot verify release bars`);
  process.exit(1);
}
process.stdout.write(aggRun.stdout);
let agg;
try {
  agg = JSON.parse(aggRun.stdout);
} catch (e) {
  console.error(`❌ Aggregate output was not JSON (${e.message}) — cannot verify release bars`);
  process.exit(1);
}

try {
  execSync('node scripts/aggregate-wave2-merged.mjs', { cwd: ROOT, stdio: 'inherit' });
} catch {
  /* optional */
}

const bars = evalReleaseBars();
const check = checkReleaseBars(agg, bars);
if (!check.ok) {
  console.error(`\n❌ Release bars FAILED (first-pass release aggregate, ${releaseDirs.length} slices):`);
  for (const f of check.failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(
  `\n✅ Release bars passed: generate ${(agg.generateSuccessRate * 100).toFixed(1)}% ≥ ${bars.minGenerateSuccessRate * 100}%, upload-ready ${(agg.uploadReadyRate * 100).toFixed(1)}% ≥ ${bars.minUploadReadyRate * 100}%, critical ${(agg.criticalRate * 100).toFixed(1)}% ≤ ${bars.maxCriticalRate * 100}%, raw median ${agg.raw.median} ≥ ${bars.minRawMedian}`,
);
process.exit(0);
