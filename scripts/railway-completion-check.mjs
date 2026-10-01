#!/usr/bin/env node
/**
 * Exit 0 when prod is live on current code (GHCR or Railpack). Used by /loop until done.
 */
import { loadRailwayToken, ensureRailwayApiTokenEnv } from './lib/railway-token.mjs';
import { applyEnvLocalToProcess } from './lib/railway-prod-env.mjs';
import { railwayGql } from './lib/railway-gql.mjs';
import {
  AUTOTUBE_SERVICE_ID,
  AUTOTUBE_ENVIRONMENT_ID,
} from './lib/railway-autotube-ids.mjs';
import { AUTOTUBE_PROJECT_ID } from './lib/railway-autotube-target.mjs';
import {
  gitHead,
  deployMatchesLocal,
  imageTagFromDeploy,
  prodLooksLive,
} from './lib/railway-deploy-evidence.mjs';

const HEALTH_URL =
  process.env.AUTOTUBE_HEALTH_URL ||
  'https://autotube-production.up.railway.app/api/health';

applyEnvLocalToProcess();
ensureRailwayApiTokenEnv();

const localSha = gitHead();
let health = { error: 'no fetch' };
try {
  const res = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(15_000) });
  health = res.ok ? await res.json() : { error: `HTTP ${res.status}` };
} catch (e) {
  health = { error: String(e?.message || e) };
}

const token = loadRailwayToken();
let latestDeploy = null;
if (token) {
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
      first: 3,
    },
  );
  latestDeploy = data.deployments?.edges?.[0]?.node ?? null;
}

const live = prodLooksLive({ health, latestDeploy, localSha });
const imageTag = imageTagFromDeploy(latestDeploy);
const imageMatch = deployMatchesLocal(latestDeploy, localSha);

const checks = {
  healthOk: health.status === 'ok',
  deploySuccess: latestDeploy?.status === 'SUCCESS',
  uptimeHours: ((health.uptime ?? 0) / 3600).toFixed(2),
  localSha: localSha?.slice(0, 12),
  imageTag: imageTag?.slice(0, 12) || null,
  imageMatch,
  gitCommit: health.deploy?.gitCommit?.slice(0, 12) || null,
  live,
};

console.log(JSON.stringify(checks, null, 2));

if (!live) {
  console.error('\nNOT COMPLETE — prod not confirmed on local HEAD');
  if (!checks.healthOk) console.error('  - health not ok');
  if (!checks.deploySuccess) console.error('  - latest deploy not SUCCESS');
  if (checks.deploySuccess && !imageMatch && !checks.gitCommit) {
    console.error('  - no gitCommit/image tag match (GHCR or Railpack)');
  }
  if ((health.uptime ?? 0) > 86_400) console.error('  - uptime >24h');
  process.exit(1);
}

console.log('\nCOMPLETE: prod live on current code');
if (latestDeploy?.meta?.image) {
  console.log(`  via GHCR: ${latestDeploy.meta.image}`);
}
process.exit(0);
