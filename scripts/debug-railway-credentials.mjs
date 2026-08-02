#!/usr/bin/env node
/**
 * Diagnose Railway token injection (never prints secret values).
 * Same checks as podomator — run in THIS agent to see what it actually has.
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadRailwayToken, getRailwayTokenSource, ensureRailwayApiTokenEnv, TOKEN_ENV_CANDIDATES } from './lib/railway-token.mjs';
import { getAutotubeRailwayTarget } from './lib/railway-autotube-target.mjs';

console.log('\n=== AutoTube Railway credentials debug ===\n');
console.log(`Worker: ${process.env.RAILWAY_SERVICE_NAME ?? '(not on Railway worker)'}`);
console.log(`Worker project: ${process.env.RAILWAY_PROJECT_NAME ?? '—'} (${process.env.RAILWAY_PROJECT_ID ?? '—'})`);
const target = getAutotubeRailwayTarget();
console.log(
  `AutoTube deploy target: ${target.projectId ?? target.projectName} / ${target.environment} / ${target.service}`,
);
console.log(`Ignore worker Railway env: ${target.ignoreWorkerRailwayEnv}\n`);

console.log('Process env (presence only):');
for (const { env } of TOKEN_ENV_CANDIDATES) {
  const set = Boolean(process.env[env]?.trim());
  console.log(`  ${env}: ${set ? 'SET' : 'unset'}`);
}
const envLocal = path.join(process.cwd(), '.env.local');
console.log(`  .env.local: ${fs.existsSync(envLocal) ? 'file exists' : 'missing'}`);
console.log(`  ~/.config/railway/token: ${fs.existsSync(path.join(process.env.HOME || '', '.config', 'railway', 'token')) ? 'exists' : 'missing'}`);
console.log('\nNote: Podomator in THIS same VM also shows unset unless one of the above has a token.');

ensureRailwayApiTokenEnv();
const token = loadRailwayToken();
const source = getRailwayTokenSource();

if (!token) {
  console.log('\n❌ No Railway API token in THIS agent process.');
  console.log('If other repos work for you, compare:');
  console.log('  1. Same agent session? (secrets inject at VM boot — restart agent after adding secret)');
  console.log('  2. Secret name in Cursor → Railway or RAILWAY_API_TOKEN or AUTOTUBE_RAILWAY_TOKEN');
  console.log('  3. Run `npm run env:debug-railway` in podomator in the SAME session — if also unset, token is not in this VM');
  console.log('\nSee docs/RAILWAY_WORKER_SECRETS.md\n');
  process.exit(1);
}

const onWorker = Boolean(process.env.RAILWAY_SERVICE_NAME || process.env.RAILWAY_PROJECT_ID);
const autotubeTokenSet = Boolean(process.env.AUTOTUBE_RAILWAY_TOKEN?.trim());
const likelyServiceCredential =
  onWorker &&
  !autotubeTokenSet &&
  (source === 'RAILWAY_API_TOKEN' || source === 'RAILWAY_TOKEN');

console.log(`\n✅ Token present (source: ${source})`);
if (likelyServiceCredential) {
  console.log('\n⚠️  Likely Railway *runtime/service* credential (worker project), not a personal/team API token.');
  console.log('  backboard GraphQL (railway:completion-check / deploy) will return Not Authorized.');
  console.log('  Fix (human):');
  console.log('    1. Create a Personal or Team token at https://railway.app/account/tokens');
  console.log('    2. Set AUTOTUBE_RAILWAY_TOKEN=<token> in .env.local (preferred; do not overwrite the worker RAILWAY_API_TOKEN)');
  console.log('    3. Re-run: npm run env:debug-railway && npm run railway:completion-check');
  console.log('  Or inject AUTOTUBE_RAILWAY_TOKEN as a Cursor Environment secret on railway-AutoTube and restart the agent.\n');
  process.exit(2);
}
console.log('Run: npm run railway:connect\n');
