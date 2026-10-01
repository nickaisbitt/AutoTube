#!/usr/bin/env node
/**
 * Full Railway deploy audit: git vs prod vs platform config.
 * Usage: npm run railway:audit
 */
import { spawnSync } from 'node:child_process';
import { loadRailwayToken, ensureRailwayApiTokenEnv } from './lib/railway-token.mjs';
import { railwayGql, fetchBuildLogTail } from './lib/railway-gql.mjs';
import {
  AUTOTUBE_SERVICE_ID,
  AUTOTUBE_ENVIRONMENT_ID,
} from './lib/railway-autotube-ids.mjs';
import { AUTOTUBE_PROJECT_ID, AUTOTUBE_PROJECT_NAME } from './lib/railway-autotube-target.mjs';
import { readProdBuildConfig } from './lib/railway-prod-build-config.mjs';
import {
  deployMatchesLocal,
  imageTagFromDeploy,
  prodLooksLive,
} from './lib/railway-deploy-evidence.mjs';

const HEALTH_URL =
  process.env.AUTOTUBE_HEALTH_URL ||
  'https://autotube-production.up.railway.app/api/health';

const ACTIVE = new Set(['BUILDING', 'QUEUED', 'INITIALIZING', 'DEPLOYING']);

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

ensureRailwayApiTokenEnv();
const token = loadRailwayToken();
const localSha = git('rev-parse HEAD');
const localShort = git('rev-parse --short HEAD');
const health = await fetchHealth();

console.log('\n=== Railway deploy audit ===\n');
console.log(`Project: ${AUTOTUBE_PROJECT_NAME} (${AUTOTUBE_PROJECT_ID})`);
console.log(`Service: autotube (${AUTOTUBE_SERVICE_ID})`);
console.log(`Local: ${git('branch --show-current') ?? '?'} @ ${localShort} (${localSha})`);
console.log(`Token: ${token ? 'YES' : 'NO'}\n`);

if (!token) {
  console.log('BLOCKER: set RAILWAY_API_TOKEN in .env.local');
  process.exit(1);
}

const build = await readProdBuildConfig(token);
console.log('Railway builder:', build?.builder ?? '—');
console.log('Metal (buildEnvironment):', build?.buildEnvironment === 'V3' ? 'V3 ON' : `${build?.buildEnvironment ?? '—'} (V2 = off)`);
console.log('buildCommand:', build?.buildCommand ?? '(default)');
if (build?.dockerfilePath) console.log('dockerfilePath:', build.dockerfilePath);

const depData = await railwayGql(
  token,
  `query($input: DeploymentListInput!, $first: Int) {
    deployments(input: $input, first: $first) {
      edges { node { id status createdAt meta } }
    }
  }`,
  {
    input: {
      projectId: AUTOTUBE_PROJECT_ID,
      environmentId: AUTOTUBE_ENVIRONMENT_ID,
      serviceId: AUTOTUBE_SERVICE_ID,
    },
    first: 5,
  },
);
const deps = depData.deployments?.edges?.map((e) => e.node) ?? [];
const active = deps.filter((d) => ACTIVE.has(d.status));

console.log(`\nActive deploys: ${active.length}`);
for (const d of active) {
  console.log(`  ${d.status} ${d.id.slice(0, 8)} ${d.meta?.commitHash?.slice(0, 7) ?? '—'}`);
}

console.log('\nRecent:');
for (const d of deps.slice(0, 3)) {
  console.log(`  ${d.status} ${d.id.slice(0, 8)} commit=${d.meta?.commitHash?.slice(0, 7) ?? '—'}`);
}

const latestFailed = deps.find((d) => d.status === 'FAILED');
if (latestFailed) {
  const logs = await fetchBuildLogTail(token, latestFailed.id, 8);
  const snap = logs.find((l) => /snapshot/i.test(l));
  if (snap) console.log(`\nLatest FAILED (${latestFailed.id.slice(0, 8)}): ${snap.slice(0, 120)}`);
}

console.log('\n--- Prod health ---\n');
if (health.error) {
  console.log('ERROR:', health.error);
} else {
  const h = (health.uptime / 3600).toFixed(1);
  const deploy = health.deploy ?? {};
  console.log(`status: ${health.status}`);
  console.log(`uptime: ${h}h (${Math.round(health.uptime)}s)`);
  console.log(`gitCommit: ${deploy.gitCommit ?? '(not in container — GHCR deploys use image tag)'}`);
  const latestOk = deps.find((d) => d.status === 'SUCCESS');
  const imgTag = imageTagFromDeploy(latestOk);
  if (imgTag) console.log(`latest image tag: ${imgTag.slice(0, 12)}`);
  if (localSha && (deploy.gitCommit || imgTag)) {
    const match =
      (deploy.gitCommit &&
        (deploy.gitCommit.startsWith(localSha) || localSha.startsWith(deploy.gitCommit))) ||
      deployMatchesLocal(latestOk, localSha);
    console.log(`matches local: ${match ? 'YES' : 'NO'}`);
  }
}

console.log('\n--- Checklist ---\n');
let ok = true;
if (build?.buildEnvironment === 'V3') {
  console.log('✗ buildEnvironment is V3 — run: npm run railway:disable-metal');
  ok = false;
} else {
  console.log('✓ V2 builder environment');
}
if (build?.builder !== 'RAILPACK') {
  console.log(`⚠ builder is ${build?.builder} — intended: RAILPACK (npm run railway:disable-metal)`);
}
if (active.length > 1) {
  console.log(`✗ ${active.length} active deploys — run: npm run railway:cancel-stale-builds`);
  ok = false;
} else if (active.length === 1) {
  console.log('⚠ 1 deploy in progress');
} else {
  console.log('✓ no active deploys');
}
const latestOk = deps.find((d) => d.status === 'SUCCESS');
const liveOnLocal = prodLooksLive({ health, latestDeploy: latestOk, localSha });
if (!liveOnLocal && !health.error) {
  console.log('✗ prod not confirmed on local HEAD (stale uptime or image/commit mismatch)');
  ok = false;
} else if (!health.error) {
  console.log('✓ prod live on local HEAD (git or GHCR image tag)');
}
console.log('\nCanonical deploy (GHCR): gh workflow run ghcr-image.yml && npm run deploy:railway:registry:pull');
console.log('Railpack fallback (snapshot often hangs): npm run deploy:railway');
console.log('Avoid: npm run railway:graphql:connect (causes deploy storms)');
console.log('Tip: disable GitHub auto-deploy in Railway during fix passes\n');

if (process.env.RAILWAY_AUDIT_SAVE === '1') {
  const fs = await import('node:fs');
  const out = `audit-${Date.now()}.txt`;
  fs.writeFileSync(out, `project=${AUTOTUBE_PROJECT_ID}\nservice=${AUTOTUBE_SERVICE_ID}\nlocal=${localSha}\nbuilder=${build?.builder}\nenv=${build?.buildEnvironment}\nactive=${active.length}\n`);
  console.log(`Saved ${out}`);
}

process.exit(ok && !health.error ? 0 : 1);
