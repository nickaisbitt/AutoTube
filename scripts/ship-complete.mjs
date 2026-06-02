#!/usr/bin/env node
/**
 * Full ship verification: finalize artifacts → strict R7 → smoke E2E.
 */
import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();

function run(cmd, args, env = {}) {
  console.log(`\n▶ ${cmd} ${args.join(' ')}\n`);
  const r = spawnSync(cmd, args, {
    cwd: ROOT,
    env: { ...process.env, ...env },
    stdio: 'inherit',
    shell: false,
  });
  if (r.status !== 0) {
    console.error(`\n❌ Failed: ${cmd} ${args.join(' ')} (exit ${r.status})`);
    process.exit(r.status ?? 1);
  }
}

const canonical = join(ROOT, 'test-recordings', 'FINAL-VIDEO-final.mp4');
if (!existsSync(canonical)) {
  console.log('No FINAL-VIDEO-final.mp4 — running long fixture render first…');
  run('npm', ['run', 'render:fixture:full']);
}

run('node', ['scripts/finalize-ship-artifacts.mjs']);
run('npm', ['run', 'squad:gate']);
run('npm', ['run', 'test:e2e:smoke']);
run('npm', ['run', 'test:unit']);

console.log('\n═══════════════════════════════════════════════════════════');
console.log(' ✅ SHIP COMPLETE — all gates passed');
console.log(` 📹 Final MP4: ${canonical}`);
console.log('═══════════════════════════════════════════════════════════\n');
