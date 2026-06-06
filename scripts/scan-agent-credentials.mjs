#!/usr/bin/env node
/**
 * Exhaustive credential presence scan (never prints secret values).
 * Usage: npm run env:scan-credentials
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TOKEN_ENV_CANDIDATES, loadRailwayToken, ensureRailwayApiTokenEnv } from './lib/railway-token.mjs';
import { readEnvLocal, applyEnvLocalToProcess } from './lib/railway-prod-env.mjs';

const OPENROUTER_KEYS = ['OPENROUTER_API_KEY', 'VITE_OPENROUTER_KEY', 'OPENROUTER_KEY'];

function len(name) {
  const v = process.env[name];
  return v?.trim() ? String(v.length) : 'unset';
}

function scanFile(label, filePath) {
  if (!fs.existsSync(filePath)) return { label, exists: false, keys: [] };
  const text = fs.readFileSync(filePath, 'utf8');
  const keys = [];
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 1) continue;
    keys.push(t.slice(0, eq).trim());
  }
  return { label, exists: true, keys };
}

console.log('\n=== AutoTube credential scan ===\n');
console.log(`Worker: ${process.env.RAILWAY_SERVICE_NAME ?? '(not Railway worker)'}`);
console.log(`Cursor worker: ${process.env.CURSOR_WORKER_NAME ?? '—'}`);
console.log(`Home: ${os.homedir()}\n`);

console.log('Process env (length only):');
for (const { env } of TOKEN_ENV_CANDIDATES) console.log(`  ${env}: ${len(env)}`);
for (const k of OPENROUTER_KEYS) console.log(`  ${k}: ${len(k)}`);
console.log(`  CURSOR_GIT_TOKEN: ${len('CURSOR_GIT_TOKEN')}`);
console.log(`  CURSOR_API_KEY: ${len('CURSOR_API_KEY')}`);

const paths = [
  scanFile('.env.local (cwd)', path.join(process.cwd(), '.env.local')),
  scanFile('~/.config/railway/token', path.join(os.homedir(), '.config', 'railway', 'token')),
  scanFile('~/.config/cursor/auth.json', path.join(os.homedir(), '.config', 'cursor/auth.json')),
];

console.log('\nFiles:');
for (const p of paths) {
  console.log(`  ${p.label}: ${p.exists ? `exists (${p.keys.length} keys)` : 'missing'}`);
  if (p.exists) {
    const interesting = p.keys.filter(
      (k) =>
        TOKEN_ENV_CANDIDATES.some((c) => c.env === k) ||
        OPENROUTER_KEYS.includes(k) ||
        /railway|openrouter/i.test(k),
    );
    if (interesting.length) console.log(`    keys: ${interesting.join(', ')}`);
  }
}

const local = readEnvLocal();
const localOpenRouter = OPENROUTER_KEYS.some((k) => local[k]?.trim());
if (Object.keys(local).length) {
  console.log(`\n.env.local parsed: ${Object.keys(local).length} entries`);
  console.log(`  OpenRouter present: ${localOpenRouter ? 'yes' : 'no'}`);
}

applyEnvLocalToProcess();
ensureRailwayApiTokenEnv();
const railway = loadRailwayToken();
const openRouter = OPENROUTER_KEYS.map((k) => process.env[k]?.trim()).find(Boolean);

console.log('\nResolved after mirror/load:');
console.log(`  Railway API token: ${railway ? 'yes' : 'no'}`);
console.log(`  OpenRouter key: ${openRouter ? 'yes' : 'no'}`);

if (!railway) {
  console.log('\nRailway: not available in this VM — PODOMATOR GitHub secret RAILWAY_API_TOKEN exists; deploy via GHA bootstrap.');
}
if (!openRouter) {
  console.log('OpenRouter: not in this VM — run npm run env:fetch-railway after Railway token is available.');
}

console.log('');
