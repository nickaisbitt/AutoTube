#!/usr/bin/env node
/**
 * Diagnose Railway token injection (never prints secret values).
 * Same checks as podomator — run in THIS agent to see what it actually has.
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadRailwayToken, getRailwayTokenSource, ensureRailwayApiTokenEnv, TOKEN_ENV_CANDIDATES } from './lib/railway-token.mjs';

console.log('\n=== AutoTube Railway credentials debug ===\n');
console.log(`Worker: ${process.env.RAILWAY_SERVICE_NAME ?? '(not on Railway worker)'}`);
console.log(`Worker project: ${process.env.RAILWAY_PROJECT_NAME ?? '—'} (${process.env.RAILWAY_PROJECT_ID ?? '—'})`);
console.log(`AutoTube deploy target: AutoTube-Deploy / autotube (via CLI when token present)\n`);

console.log('Process env (presence only):');
for (const { env } of TOKEN_ENV_CANDIDATES) {
  const set = Boolean(process.env[env]?.trim());
  console.log(`  ${env}: ${set ? 'SET' : 'unset'}`);
}
import fs from 'node:fs';
import path from 'node:path';
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

console.log(`\n✅ Token present (source: ${source})`);
console.log('Run: npm run railway:connect\n');
