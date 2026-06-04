#!/usr/bin/env node
/**
 * Sync production env vars to Railway autotube service from .env.local
 * Usage: npm run railway:sync-env
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadRailwayToken } from './lib/railway-token.mjs';
import {
  AUTOTUBE_PROJECT_ID,
} from './lib/railway-autotube-target.mjs';

const SERVICE_ID = process.env.RAILWAY_SERVICE_ID || '5cf09f78-9182-4e95-8659-a999dc97e246';
const ENV_ID = process.env.RAILWAY_ENVIRONMENT_ID || 'decad258-accb-49f1-a0e0-679568c883f6';
const GRAPHQL = 'https://backboard.railway.app/graphql/v2';
const PROD_URL = 'https://autotube-production.up.railway.app';

function readEnvLocal(cwd = process.cwd()) {
  const file = path.join(cwd, '.env.local');
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 1) continue;
    let k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

function buildRailwayVars(local) {
  const openRouter =
    local.OPENROUTER_API_KEY?.trim() ||
    local.VITE_OPENROUTER_KEY?.trim() ||
    '';
  const vars = {
    TRUST_PROXY: 'true',
    ALLOWED_ORIGINS: PROD_URL,
    AUTOTUBE_FORCE_CPU: '1',
    NODE_ENV: 'production',
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1',
    CHROME_BIN: '/usr/bin/chromium',
    NODE_OPTIONS: '--max-old-space-size=3072',
    // Keep small — large apt sets (chromium + dev headers) blow snapshot upload past heartbeat timeout
    RAILPACK_DEPLOY_APT_PACKAGES: 'ffmpeg python3 python3-pip',
    RAILPACK_BUILD_APT_PACKAGES: 'pkg-config libcairo2-dev libjpeg-dev python3-pip',
  };
  if (openRouter) {
    vars.OPENROUTER_API_KEY = openRouter;
    vars.VITE_OPENROUTER_KEY = openRouter;
  }
  if (local.VITE_SERPER_KEY?.trim()) vars.VITE_SERPER_KEY = local.VITE_SERPER_KEY.trim();
  if (local.KOKORO_SERVER_URL?.trim()) vars.KOKORO_SERVER_URL = local.KOKORO_SERVER_URL.trim();
  return vars;
}

async function gql(token, query, variables = {}) {
  const res = await fetch(GRAPHQL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (!res.ok || json.errors?.length) {
    throw new Error(json.errors?.map((e) => e.message).join('; ') || res.statusText);
  }
  return json.data;
}

async function upsertVar(token, projectId, environmentId, serviceId, name, value) {
  const mutation = `
    mutation($input: VariableUpsertInput!) {
      variableUpsert(input: $input)
    }
  `;
  await gql(token, mutation, {
    input: {
      projectId,
      environmentId,
      serviceId,
      name,
      value,
    },
  });
  console.log(`  ✓ ${name}`);
}

async function main() {
  const token = loadRailwayToken();
  if (!token) {
    console.error('No Railway token — set RAILWAY_API_TOKEN in .env.local');
    process.exit(1);
  }
  const local = readEnvLocal();
  const vars = buildRailwayVars(local);
  console.log(`Syncing ${Object.keys(vars).length} vars to AutoTube-Deploy / autotube…`);
  for (const [name, value] of Object.entries(vars)) {
    await upsertVar(token, AUTOTUBE_PROJECT_ID, ENV_ID, SERVICE_ID, name, value);
  }
  console.log('Done. Redeploy may be required for some vars to apply.');
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
