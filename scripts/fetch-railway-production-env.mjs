#!/usr/bin/env node
/**
 * Fetch AutoTube production service variables from Railway GraphQL and write .env.local.
 *
 * Token: Railway (Cursor secret), RAILWAY_API_TOKEN, RAILWAY_TOKEN, or ~/.config/railway/token
 *
 * Usage:
 *   npm run env:fetch-railway
 *   npm run env:fetch-railway -- --dry-run
 *
 * Never logs secret values. Never commits .env.local.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  loadRailwayToken,
  ensureRailwayApiTokenEnv,
  getRailwayTokenSource,
} from './lib/railway-token.mjs';
import { railwayGql } from './lib/railway-gql.mjs';
import {
  AUTOTUBE_SERVICE_ID,
  AUTOTUBE_ENVIRONMENT_ID,
} from './lib/railway-autotube-ids.mjs';
import { AUTOTUBE_PROJECT_ID } from './lib/railway-autotube-target.mjs';
import { applyEnvLocalToProcess } from './lib/railway-prod-env.mjs';

const dryRun = process.argv.includes('--dry-run');

const PULL_KEYS = [
  'OPENROUTER_API_KEY',
  'VITE_OPENROUTER_KEY',
  'OPENROUTER_KEY',
  'VITE_SERPER_KEY',
  'KOKORO_SERVER_URL',
  'PEXELS_API_KEY',
  'VITE_PEXELS_KEY',
  'PIXABAY_API_KEY',
  'VITE_PIXABAY_KEY',
];

async function getServiceVariables(token, serviceId) {
  const data = await railwayGql(
    token,
    `query Variables($projectId: String!, $environmentId: String!, $serviceId: String!) {
      variables(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId)
    }`,
    {
      projectId: AUTOTUBE_PROJECT_ID,
      environmentId: AUTOTUBE_ENVIRONMENT_ID,
      serviceId,
    },
  );
  return data.variables || {};
}

async function main() {
  ensureRailwayApiTokenEnv();
  const token = loadRailwayToken();
  if (!token) {
    console.error('[env:fetch-railway] Missing Railway token.');
    console.error(
      '[env:fetch-railway] Cursor secret Railway or RAILWAY_API_TOKEN, or Railway → cursor-worker Variables.',
    );
    process.exit(1);
  }

  const source = getRailwayTokenSource();
  process.stdout.write(`[env:fetch-railway] Token source: ${source}\n`);
  process.stdout.write('[env:fetch-railway] Fetching AutoTube production variables…\n');

  const appVars = await getServiceVariables(token, AUTOTUBE_SERVICE_ID);
  const merged = {};

  for (const key of PULL_KEYS) {
    const value = appVars[key];
    if (value != null && String(value).trim()) {
      merged[key] = String(value).trim();
    }
  }

  if (merged.VITE_OPENROUTER_KEY && !merged.OPENROUTER_API_KEY) {
    merged.OPENROUTER_API_KEY = merged.VITE_OPENROUTER_KEY;
  }
  if (merged.OPENROUTER_API_KEY && !merged.VITE_OPENROUTER_KEY) {
    merged.VITE_OPENROUTER_KEY = merged.OPENROUTER_API_KEY;
  }

  merged.RAILWAY_API_TOKEN = token;
  merged.Railway = token;

  const pulled = Object.keys(merged).filter((k) => k !== 'Railway' && k !== 'RAILWAY_API_TOKEN');
  process.stdout.write(`[env:fetch-railway] Pulled keys: ${pulled.join(', ') || '(none)'}\n`);

  if (!merged.OPENROUTER_API_KEY && !merged.VITE_OPENROUTER_KEY) {
    console.error(
      '[env:fetch-railway] OPENROUTER_API_KEY not on AutoTube production service — set it in Railway first.',
    );
    process.exit(1);
  }

  if (dryRun) {
    process.stdout.write('[env:fetch-railway] dry-run — .env.local not modified.\n');
    return;
  }

  const tmpPath = path.join(os.tmpdir(), `autotube-railway-env-${process.pid}.json`);
  fs.writeFileSync(tmpPath, JSON.stringify(merged), { mode: 0o600 });
  const result = spawnSync('node', ['scripts/save-env-local.mjs', tmpPath], {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  fs.unlinkSync(tmpPath);
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  applyEnvLocalToProcess();
  ensureRailwayApiTokenEnv();
  process.stdout.write('[env:fetch-railway] Done. Run: npm run loop:video -- --until-score 9.3\n');
}

main().catch((error) => {
  console.error(`[env:fetch-railway] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
