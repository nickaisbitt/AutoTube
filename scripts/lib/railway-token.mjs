/**
 * Resolve Railway API token — same rules as podomator (scripts/lib/railway-token.mjs).
 * Cursor secrets are often named "Railway" (env key Railway), not only RAILWAY_TOKEN.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** @type {readonly { env: string; label: string }[]} */
export const TOKEN_ENV_CANDIDATES = [
  { env: 'RAILWAY_API_TOKEN', label: 'RAILWAY_API_TOKEN' },
  { env: 'RAILWAY_TOKEN', label: 'RAILWAY_TOKEN' },
  { env: 'Railway', label: 'Railway (Cursor secret)' },
  { env: 'RAILWAY', label: 'RAILWAY' },
  { env: 'AUTOTUBE_RAILWAY_TOKEN', label: 'AUTOTUBE_RAILWAY_TOKEN' },
];

/** @type {string | null} */
let lastTokenSource = null;

function readEnvLocalToken(cwd = process.cwd()) {
  const file = path.join(cwd, '.env.local');
  if (!fs.existsSync(file)) return null;
  const text = fs.readFileSync(file, 'utf8');
  const keys = new Set(TOKEN_ENV_CANDIDATES.map((c) => c.env));
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!keys.has(key)) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (value) return value;
  }
  return null;
}

export function loadRailwayToken() {
  for (const { env, label } of TOKEN_ENV_CANDIDATES) {
    const value = process.env[env]?.trim();
    if (value) {
      lastTokenSource = label;
      return value;
    }
  }
  const fromLocal = readEnvLocalToken();
  if (fromLocal) {
    lastTokenSource = '.env.local';
    return fromLocal;
  }
  const tokenPath = path.join(os.homedir(), '.config', 'railway', 'token');
  if (fs.existsSync(tokenPath)) {
    lastTokenSource = '~/.config/railway/token';
    return fs.readFileSync(tokenPath, 'utf8').trim();
  }
  lastTokenSource = null;
  return null;
}

export function getRailwayTokenSource() {
  loadRailwayToken();
  return lastTokenSource;
}

export function ensureRailwayApiTokenEnv() {
  if (process.env.RAILWAY_API_TOKEN?.trim()) return;
  const token = loadRailwayToken();
  if (token) process.env.RAILWAY_API_TOKEN = token;
}
