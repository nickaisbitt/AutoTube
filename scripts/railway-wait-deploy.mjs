#!/usr/bin/env node
/**
 * Poll latest Railway deployment until SUCCESS / FAILED / timeout.
 * Usage: npm run railway:deploy:wait
 */
import { loadRailwayToken } from './lib/railway-token.mjs';
import {
  AUTOTUBE_PROJECT_ID,
} from './lib/railway-autotube-target.mjs';

const SERVICE_ID = '5cf09f78-9182-4e95-8659-a999dc97e246';
const ENV_ID = 'decad258-accb-49f1-a0e0-679568c883f6';
const HEALTH_URL =
  process.env.AUTOTUBE_HEALTH_URL ||
  'https://autotube-production.up.railway.app/api/health';
const MAX_MIN = Number(process.env.RAILWAY_WAIT_MAX_MIN || 25);

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

async function latestDeployment(token) {
  const data = await gql(
    token,
    `query($input: DeploymentListInput!, $first: Int) {
      deployments(input: $input, first: $first) {
        edges { node { id status createdAt meta } }
      }
    }`,
    {
      input: {
        projectId: AUTOTUBE_PROJECT_ID,
        environmentId: ENV_ID,
        serviceId: SERVICE_ID,
      },
      first: 1,
    },
  );
  return data.deployments?.edges?.[0]?.node ?? null;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const token = loadRailwayToken();
  if (!token) {
    console.error('No Railway token');
    process.exit(1);
  }
  const startUptime = (await (await fetch(HEALTH_URL)).json()).uptime;
  console.log(`Waiting for deploy (max ${MAX_MIN} min). Old uptime=${Math.round(startUptime)}s`);

  const deadline = Date.now() + MAX_MIN * 60_000;
  let n = 0;
  while (Date.now() < deadline) {
    n++;
    const d = await latestDeployment(token);
    const hash = d?.meta?.commitHash?.slice(0, 7) ?? '—';
    console.log(`[${n}] ${d?.status ?? '?'} commit=${hash} id=${d?.id?.slice(0, 8) ?? '—'}`);

    if (d?.status === 'SUCCESS') {
      const h = await (await fetch(HEALTH_URL)).json();
      const fresh = h.uptime < startUptime * 0.5 || h.deploy?.gitCommit;
      console.log(`Health uptime=${Math.round(h.uptime)}s commit=${h.deploy?.gitCommit?.slice(0, 7) ?? '—'}`);
      if (fresh) {
        console.log('SUCCESS: new deployment is live');
        process.exit(0);
      }
    }
    if (['FAILED', 'CRASHED', 'REMOVED'].includes(d?.status)) {
      console.error(`Deploy ended: ${d.status}`);
      process.exit(1);
    }
    await sleep(30_000);
  }
  console.error('Timeout waiting for deploy');
  process.exit(1);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
