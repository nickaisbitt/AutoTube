#!/usr/bin/env node
/**
 * Sync production env vars via single environmentPatchCommit (no per-var deploy storms).
 * Usage: npm run railway:sync-env
 */
import { loadRailwayToken } from './lib/railway-token.mjs';
import { applyProdBuildConfig } from './lib/railway-prod-build-config.mjs';
import { buildProdRailwayVars } from './lib/railway-prod-env.mjs';

async function main() {
  const token = loadRailwayToken();
  if (!token) {
    console.error('No Railway token — set RAILWAY_API_TOKEN in .env.local');
    process.exit(1);
  }
  const vars = buildProdRailwayVars();
  console.log(`Patching ${Object.keys(vars).length} vars in one environmentPatchCommit…`);
  const build = await applyProdBuildConfig(token, { useDockerfile: false, syncEnv: true });
  console.log('Build config:', build);
  console.log('Done. Redeploy: npm run deploy:railway');
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
