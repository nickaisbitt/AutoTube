#!/usr/bin/env node
/**
 * Cancel duplicate BUILDING/QUEUED deployments (keep newest active).
 * Usage: npm run railway:cancel-stale-builds
 */
import { loadRailwayToken } from './lib/railway-token.mjs';
import { AUTOTUBE_PROJECT_ID } from './lib/railway-autotube-target.mjs';
import { AUTOTUBE_SERVICE_ID, AUTOTUBE_ENVIRONMENT_ID } from './lib/railway-autotube-ids.mjs';
import { railwayGql } from './lib/railway-gql.mjs';

const ACTIVE = new Set(['BUILDING', 'QUEUED', 'INITIALIZING', 'DEPLOYING']);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const token = loadRailwayToken();
  if (!token) {
    console.error('No Railway token');
    process.exit(1);
  }

  const data = await railwayGql(
    token,
    `query($input: DeploymentListInput!, $first: Int) {
      deployments(input: $input, first: $first) {
        edges { node { id status createdAt } }
      }
    }`,
    {
      input: {
        projectId: AUTOTUBE_PROJECT_ID,
        environmentId: AUTOTUBE_ENVIRONMENT_ID,
        serviceId: AUTOTUBE_SERVICE_ID,
      },
      first: 20,
    },
  );

  const nodes = (data.deployments?.edges ?? []).map((e) => e.node);
  const active = nodes.filter((n) => ACTIVE.has(n.status));
  if (active.length <= 1) {
    console.log(`Nothing to cancel (${active.length} active)`);
    return;
  }

  const [keep, ...stale] = active;
  console.log(`Keeping ${keep.id.slice(0, 8)} ${keep.status} (${keep.createdAt})`);

  for (const d of stale) {
    const ok = await railwayGql(
      token,
      `mutation($id: String!) { deploymentCancel(id: $id) }`,
      { id: d.id },
    );
    console.log(`Cancel ${d.status} ${d.id.slice(0, 8)} → ${ok.deploymentCancel}`);
    await sleep(400);
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
