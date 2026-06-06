#!/usr/bin/env node
/**
 * Post-deploy smoke: health + static UI + optional tool paths.
 * Usage: npm run railway:smoke
 */
const BASE =
  process.env.AUTOTUBE_HEALTH_URL?.replace(/\/api\/health$/, '') ||
  'https://autotube-production.up.railway.app';

async function check(name, url, expectOk = true) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    const ok = expectOk ? res.ok : res.status < 500;
    console.log(`${ok ? '✓' : '✗'} ${name}: HTTP ${res.status} ${url}`);
    return ok;
  } catch (e) {
    console.log(`✗ ${name}: ${e.message}`);
    return false;
  }
}

const healthRes = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(15_000) });
if (!healthRes.ok) {
  console.error(`Health failed: HTTP ${healthRes.status}`);
  process.exit(1);
}
const health = await healthRes.json();
console.log('Health:', JSON.stringify({ status: health.status, uptime: Math.round(health.uptime), deploy: health.deploy }));

if (
  health.uptime > 86_400 &&
  !health.deploy?.gitCommit &&
  !health.deploy?.deployImage
) {
  console.warn('Warning: uptime >24h with no deploy revision — likely stale container');
}

let ok = true;
ok = (await check('index', `${BASE}/`)) && ok;
ok = (await check('api health', `${BASE}/api/health`)) && ok;

if (!ok) process.exit(1);
console.log('Smoke passed.');
