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
];

export function loadRailwayToken() {
  for (const { env } of TOKEN_ENV_CANDIDATES) {
    const value = process.env[env]?.trim();
    if (value) return value;
  }
  const tokenPath = path.join(os.homedir(), '.config', 'railway', 'token');
  if (fs.existsSync(tokenPath)) {
    return fs.readFileSync(tokenPath, 'utf8').trim();
  }
  return null;
}

export function getRailwayTokenSource() {
  for (const { env, label } of TOKEN_ENV_CANDIDATES) {
    if (process.env[env]?.trim()) return label;
  }
  const tokenPath = path.join(os.homedir(), '.config', 'railway', 'token');
  if (fs.existsSync(tokenPath)) return '~/.config/railway/token';
  return null;
}

export function ensureRailwayApiTokenEnv() {
  if (process.env.RAILWAY_API_TOKEN?.trim()) return;
  const token = loadRailwayToken();
  if (token) process.env.RAILWAY_API_TOKEN = token;
}
