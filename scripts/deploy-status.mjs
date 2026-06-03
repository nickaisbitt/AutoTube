#!/usr/bin/env node
/**
 * One command: local git vs prod health + Railway token + numbered next steps.
 */
import { spawnSync } from 'node:child_process';
import { loadRailwayToken } from './lib/railway-token.mjs';

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

const localSha = git('rev-parse HEAD');
const localShort = git('rev-parse --short HEAD');
const token = loadRailwayToken();
const health = await fetchHealth();

console.log('\n=== AutoTube deploy status ===\n');
console.log(`Local branch: ${git('branch --show-current') ?? '?'}`);
console.log(`Local commit: ${localShort ?? '?'} (${localSha ?? '?'})`);
console.log(`Railway API token in shell: ${token ? 'YES' : 'NO'} (npm run env:debug-railway)`);
console.log(`Prod health URL: ${HEALTH_URL}\n`);

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
  console.log(`${n}. Add Railway deploy token to THIS agent (pick one):`);
  console.log('   a) Cursor → Cloud Agents → environment railway-AutoTube → secret Railway or RAILWAY_API_TOKEN');
  console.log('   b) Railway → cursor-self-hosted-worker → cursor-worker → Variables → RAILWAY_TOKEN');
  console.log('   c) Restart agent / redeploy worker, then npm run env:debug-railway must show SET');
  n++;
}
if (!health.deploy?.sourceConnected) {
  console.log(`${n}. Connect GitHub once: Railway → AutoTube-Deploy → autotube → Connect Repo`);
  console.log('   → nickaisbitt/AutoTube, branch master, root directory empty (.)');
  console.log(`   Or when token works: npm run railway:connect`);
  n++;
}
if (health.uptime > 3600 && !health.deploy?.gitCommit) {
  console.log(`${n}. After connect: git push origin master and watch Railway → Deployments`);
  n++;
}
console.log(`${n}. Verify: curl ${HEALTH_URL} — uptime should drop after new deploy; deploy.gitCommit should match local`);
n++;
console.log(`${n}. Video quality: OPENROUTER_API_KEY=... npm run loop:video -- --until-score 9.3`);
console.log('');
