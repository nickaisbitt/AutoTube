#!/usr/bin/env node
/**
 * Cancel BUILDING deployments except the newest (frees Railway build queue).
 * Usage: npm run railway:cancel-stale-builds
 */
import { loadRailwayToken } from './lib/railway-token.mjs';
import { AUTOTUBE_PROJECT_ID } from './lib/railway-autotube-target.mjs';

const SERVICE_ID = '5cf09f78-9182-4e95-8659-a999dc97e246';
const ENV_ID = 'decad258-accb-49f1-a0e0-679568c883f6';

async function gql(token, query, variables = {}) {
  const res = await fetch('https://backboard.railway.app/graphql/v2', {
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

async function main() {
  const token = loadRailwayToken();
  if (!token) {
    console.error('No Railway token');
    process.exit(1);
  }

  const data = await gql(
    token,
    `query($input: DeploymentListInput!, $first: Int) {
      deployments(input: $input, first: $first) {
        edges { node { id status createdAt meta { commitHash } } }
      }
    }`,
    {
      input: {
        projectId: AUTOTUBE_PROJECT_ID,
        environmentId: ENV_ID,
        serviceId: SERVICE_ID,
      },
      first: 15,
    },
  );

  const nodes = (data.deployments?.edges ?? []).map((e) => e.node);
  const building = nodes.filter((n) => n.status === 'BUILDING');
  if (building.length <= 1) {
    console.log(`Nothing to cancel (${building.length} BUILDING)`);
    return;
  }

  const [keep, ...stale] = building;
  console.log(`Keeping ${keep.id.slice(0, 8)} (${keep.meta?.commitHash?.slice(0, 7)})`);

  for (const d of stale) {
    const ok = await gql(
      token,
      `mutation($id: String!) { deploymentCancel(id: $id) }`,
      { id: d.id },
    );
    console.log(
      `Cancel ${d.id.slice(0, 8)} ${d.meta?.commitHash?.slice(0, 7)} → ${ok.deploymentCancel}`,
    );
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
