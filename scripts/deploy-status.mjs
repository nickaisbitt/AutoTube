#!/usr/bin/env node
/**
 * One command: local git vs prod health + Railway build env + numbered next steps.
 */
import { spawnSync } from 'node:child_process';
import { loadRailwayToken } from './lib/railway-token.mjs';
import { railwayGql } from './lib/railway-gql.mjs';
import {
  AUTOTUBE_SERVICE_ID,
  AUTOTUBE_ENVIRONMENT_ID,
} from './lib/railway-autotube-ids.mjs';
import { AUTOTUBE_PROJECT_ID } from './lib/railway-autotube-target.mjs';

const HEALTH_URL =
  process.env.AUTOTUBE_HEALTH_URL ||
  'https://autotube-production.up.railway.app/api/health';

function git(cmd) {
  const r = spawnSync('git', cmd.split(' '), { encoding: 'utf8', cwd: process.cwd() });
  return r.status === 0 ? (r.stdout || '').trim() : null;
}

async function fetchHealth() {
  try {
    const res = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    return await res.json();
  } catch (e) {
    return { error: String(e?.message || e) };
  }
}

async function fetchRailwayBuildConfig(token) {
  try {
    const data = await railwayGql(
      token,
      `query($id: String!) { environment(id: $id) { config } }`,
      { id: AUTOTUBE_ENVIRONMENT_ID },
    );
    return data.environment?.config?.services?.[AUTOTUBE_SERVICE_ID]?.build ?? null;
  } catch {
    return null;
  }
}

async function fetchLatestDeploy(token) {
  try {
    const data = await railwayGql(
      token,
      `query($input: DeploymentListInput!, $first: Int) {
        deployments(input: $input, first: $first) {
          edges { node { id status meta } }
        }
      }`,
      {
        input: {
          projectId: AUTOTUBE_PROJECT_ID,
          environmentId: AUTOTUBE_ENVIRONMENT_ID,
          serviceId: AUTOTUBE_SERVICE_ID,
        },
        first: 1,
      },
    );
    return data.deployments?.edges?.[0]?.node ?? null;
  } catch {
    return null;
  }
}

const localSha = git('rev-parse HEAD');
const localShort = git('rev-parse --short HEAD');
const token = loadRailwayToken();
const health = await fetchHealth();
const buildCfg = token ? await fetchRailwayBuildConfig(token) : null;
const latestDeploy = token ? await fetchLatestDeploy(token) : null;

console.log('\n=== AutoTube deploy status ===\n');
console.log(`Local branch: ${git('branch --show-current') ?? '?'}`);
console.log(`Local commit: ${localShort ?? '?'} (${localSha ?? '?'})`);
console.log(`Railway API token in shell: ${token ? 'YES' : 'NO'} (npm run env:debug-railway)`);
console.log(`Prod health URL: ${HEALTH_URL}\n`);

if (buildCfg) {
  const env = buildCfg.buildEnvironment ?? '(default)';
  const metal = env === 'V3' ? 'ON (V3 — snapshot hangs likely)' : env === 'V2' ? 'off (V2)' : env;
  console.log(`Railway builder: ${buildCfg.builder ?? '—'}`);
  console.log(`Railway Metal build: ${metal}`);
  console.log(`Railway buildCommand: ${buildCfg.buildCommand ?? '(railway.toml default)'}`);
  if (buildCfg.dockerfilePath) console.log(`Railway dockerfilePath: ${buildCfg.dockerfilePath}`);
  console.log('');
}

if (latestDeploy) {
  const m = latestDeploy.meta?.serviceManifest?.build;
  console.log(
    `Latest deploy: ${latestDeploy.status} (${latestDeploy.id.slice(0, 8)}) commit=${latestDeploy.meta?.commitHash?.slice(0, 7) ?? '—'} env=${m?.buildEnvironment ?? '—'}`,
  );
  console.log('');
}

if (health.error) {
  console.log(`Prod: ERROR — ${health.error}`);
} else {
  const uptimeH = (health.uptime / 3600).toFixed(1);
  const deploy = health.deploy ?? {};
  console.log(`Prod status: ${health.status}`);
  console.log(`Prod uptime: ${uptimeH}h (${Math.round(health.uptime)}s)`);
  console.log(`Prod git commit: ${deploy.gitCommit ?? '(not reported — old deploy or not from GitHub)'}`);
  console.log(`Prod git branch: ${deploy.gitBranch ?? '—'}`);
  console.log(`GitHub source connected: ${deploy.sourceConnected ? 'yes' : 'no / unknown'}`);

  if (localSha && deploy.gitCommit) {
    const match =
      deploy.gitCommit.startsWith(localSha) || localSha.startsWith(deploy.gitCommit);
    console.log(`Local matches prod: ${match ? 'YES' : 'NO — push master then wait for Railway deploy'}`);
  } else if (health.uptime > 86_400) {
    console.log('Prod container is old (>24h uptime) — likely not redeployed after recent pushes.');
  }
}

console.log('\n--- Numbered next steps ---\n');
let n = 1;
if (!token) {
  console.log(`${n}. Add RAILWAY_API_TOKEN to .env.local, then: npm run deploy:railway`);
  n++;
}
if (buildCfg?.buildEnvironment === 'V3') {
  console.log(`${n}. Disable Metal: npm run railway:disable-metal`);
  n++;
}
if (health.uptime > 3600 && !health.deploy?.gitCommit) {
  console.log(`${n}. Deploy: npm run deploy:railway`);
  n++;
} else if (localSha && health.deploy?.gitCommit) {
  const match =
    health.deploy.gitCommit.startsWith(localSha) || localSha.startsWith(health.deploy.gitCommit);
  if (!match) {
    console.log(`${n}. Deploy latest: npm run deploy:railway`);
    n++;
  }
}
console.log(`${n}. Verify: curl ${HEALTH_URL} — uptime <15m and deploy.gitCommit matches local`);
n++;
console.log(`${n}. Smoke: npm run railway:smoke`);
n++;
console.log(`${n}. Video quality: OPENROUTER_API_KEY=... npm run loop:video -- --until-score 9.3`);
console.log('');
