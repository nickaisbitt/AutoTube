#!/usr/bin/env node
/**
 * dod:check — fast, script-enforceable Definition-of-Done bars.
 *
 * Enforced here (exit 1 on failure):
 *   1. deploy/server and deploy/server.mjs must be ABSENT — that tree held a
 *      stale, unauthenticated copy of server code (deleted in the audit sweep;
 *      .github/workflows/ci.yml guards the same invariant).
 *   2. deploy/server-render.mjs must match root server-render.mjs
 *      (delegates to scripts/sync-server-render-deploy.mjs --check).
 *   3. --unit flag: additionally runs the vitest suite. Off by default to
 *      keep this command fast; CI runs the full suite separately.
 *
 * NOT enforced here — run these yourself:
 *   - npm run lint                        (tsc --noEmit typecheck)
 *   - npm run railway:completion-check    (needs RAILWAY_API_TOKEN; exit 0 when
 *                                          prod deploy/image matches local HEAD)
 *   - OPENROUTER_API_KEY=... npm run generate:video -- "<real topic>"
 *   - npm run watch:video -- <final.mp4>  (exit 0 only when upload-ready, or
 *                                          --min-score N met with no criticals)
 *   Product quality bars (brutal ≥7, upload-ready YES, 9.3 stretch) are
 *   evaluated by watch:video on real generated output — they cannot be
 *   proven by this script and remain manual-with-keys. See docs/REMAINING_WORK.md.
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const withUnit = process.argv.includes('--unit');

const results = [];
const record = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

// 1. Stale deploy/server tree must stay deleted.
const stalePaths = ['deploy/server', 'deploy/server.mjs'].filter((p) =>
  existsSync(join(root, p)),
);
record(
  'deploy/server absence',
  stalePaths.length === 0,
  stalePaths.length
    ? `${stalePaths.join(', ')} must not exist — delete and re-commit`
    : 'no stale server tree',
);

// 2. server-render sync drift.
const sync = spawnSync(
  process.execPath,
  [join(root, 'scripts', 'sync-server-render-deploy.mjs'), '--check'],
  { cwd: root, stdio: 'pipe', encoding: 'utf8' },
);
const syncOut = `${sync.stdout || ''}${sync.stderr || ''}`.trim();
record(
  'server-render sync --check',
  sync.status === 0,
  syncOut.split('\n').pop() || '',
);

// 3. Optional unit tests.
if (withUnit) {
  const vitest = spawnSync(
    process.execPath,
    [join(root, 'node_modules', 'vitest', 'vitest.mjs'), 'run'],
    { cwd: root, stdio: 'inherit' },
  );
  record('unit tests (--unit)', vitest.status === 0);
} else {
  console.log('⏭️  unit tests skipped (pass --unit to include; CI runs them)');
}

console.log('\nHint: run `npm run lint` (tsc --noEmit) — not part of dod:check.');
console.log('Manual-with-keys bars (docs/REMAINING_WORK.md §C–§D):');
console.log('  - npm run railway:completion-check   (RAILWAY_API_TOKEN)');
console.log('  - npm run generate:video -- "<topic>" (OPENROUTER_API_KEY + dev server + ffmpeg)');
console.log('  - npm run watch:video -- <final.mp4>  (exit 0 ⇔ upload-ready, or --min-score N)');

const failed = results.filter((r) => !r.ok);
if (failed.length) {
  console.error(`\n❌ DoD CHECK FAIL — ${failed.map((f) => f.name).join('; ')}`);
  process.exit(1);
}
console.log('\n✅ DoD CHECK PASS — script-enforceable bars green (product bars remain manual)');
