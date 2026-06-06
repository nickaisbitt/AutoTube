#!/usr/bin/env node
/**
 * Merge credentials from all known worker locations into gitignored .env.local.
 * Never prints secret values.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { readEnvLocal } from './lib/railway-prod-env.mjs';
import { TOKEN_ENV_CANDIDATES } from './lib/railway-token.mjs';

const ROOT = process.cwd();
const SOURCES = [
  '/home/node/autotube.env.local',
  path.join(ROOT, '../podomator/.env.local'),
  path.join(ROOT, '../audra-voice-api/.env.local'),
  path.join(ROOT, '../polymarketapp/.env.local'),
];

const PULL_KEYS = new Set([
  ...TOKEN_ENV_CANDIDATES.map((c) => c.env),
  'OPENROUTER_API_KEY',
  'VITE_OPENROUTER_KEY',
  'OPENROUTER_KEY',
  'VITE_SERPER_KEY',
  'KOKORO_SERVER_URL',
]);

function parseFile(file) {
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 1) continue;
    const k = t.slice(0, eq).trim();
    if (!PULL_KEYS.has(k)) continue;
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (v) out[k] = v;
  }
  return out;
}

const merged = { ...readEnvLocal(ROOT) };
for (const src of SOURCES) {
  Object.assign(merged, parseFile(src));
}

if (merged.VITE_OPENROUTER_KEY && !merged.OPENROUTER_API_KEY) {
  merged.OPENROUTER_API_KEY = merged.VITE_OPENROUTER_KEY;
}
if (merged.OPENROUTER_API_KEY && !merged.VITE_OPENROUTER_KEY) {
  merged.VITE_OPENROUTER_KEY = merged.OPENROUTER_API_KEY;
}
if (merged.Railway && !merged.RAILWAY_API_TOKEN) {
  merged.RAILWAY_API_TOKEN = merged.Railway;
  merged.RAILWAY_TOKEN = merged.Railway;
}
if (merged.RAILWAY_API_TOKEN && !merged.Railway) {
  merged.Railway = merged.RAILWAY_API_TOKEN;
}

const pulled = Object.keys(merged);
if (!merged.RAILWAY_API_TOKEN && !merged.Railway) {
  console.error('[sync-worker-env] No Railway token in any worker source.');
  process.exit(1);
}

const tmp = path.join('/tmp', `autotube-sync-env-${process.pid}.json`);
fs.writeFileSync(tmp, JSON.stringify(merged), { mode: 0o600 });
const r = spawnSync('node', ['scripts/save-env-local.mjs', tmp], { cwd: ROOT, stdio: 'inherit' });
fs.unlinkSync(tmp);
process.exit(r.status ?? 1);
