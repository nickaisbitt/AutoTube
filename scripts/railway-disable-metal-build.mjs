#!/usr/bin/env node
/**
 * Disable Metal build environment (V3) for autotube → use V2 via environment patch.
 * Usage: npm run railway:disable-metal
 */
import { loadRailwayToken, ensureRailwayApiTokenEnv } from './lib/railway-token.mjs';
import { applyProdBuildConfig, readProdBuildConfig } from './lib/railway-prod-build-config.mjs';

ensureRailwayApiTokenEnv();
const token = loadRailwayToken();
if (!token) {
  console.error('Set RAILWAY_API_TOKEN or Railway in env');
  process.exit(1);
}

const build = await readProdBuildConfig(token);
if (build?.buildEnvironment === 'V2' && build?.buildCommand === 'npm run build:railway') {
  console.log('Metal already off (V2 + build:railway)', build);
  process.exit(0);
}

const after = await applyProdBuildConfig(token, { useDockerfile: false });
console.log('Updated build config:', after);
if (after.buildEnvironment !== 'V2') {
  console.error('Patch did not stick — check Railway dashboard');
  process.exit(1);
}
console.log('Done. Redeploy: npm run deploy:railway');
