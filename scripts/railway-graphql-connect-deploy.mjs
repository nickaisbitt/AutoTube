#!/usr/bin/env node
/**
 * Connect autotube → GitHub and trigger deploy (no Railway CLI).
 * Usage: RAILWAY_API_TOKEN=... npm run railway:graphql:connect
 */
import { loadRailwayToken, ensureRailwayApiTokenEnv } from './lib/railway-token.mjs';
import {
  AUTOTUBE_PROJECT_ID,
  AUTOTUBE_PROJECT_NAME,
} from './lib/railway-autotube-target.mjs';

ensureRailwayApiTokenEnv();
const token = loadRailwayToken();
if (!token) {
  console.error('Set RAILWAY_API_TOKEN or Railway in env');
  process.exit(1);
}

const GRAPHQL =
  process.env.RAILWAY_GRAPHQL_ENDPOINT || 'https://backboard.railway.app/graphql/v2';
const REPO = process.env.RAILWAY_REPO || 'nickaisbitt/AutoTube';
const BRANCH = process.env.RAILWAY_BRANCH || 'master';
const SERVICE_NAME = process.env.RAILWAY_SERVICE || 'autotube';
const HEALTH_URL =
  process.env.AUTOTUBE_HEALTH_URL ||
  'https://autotube-production.up.railway.app/api/health';

async function gql(query, variables = {}) {
  const res = await fetch(GRAPHQL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(120_000),
  });
  const json = await res.json();
  if (!res.ok || json.errors?.length) {
    throw new Error(json.errors?.map((e) => e.message).join('; ') || res.statusText);
  }
  return json.data;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

console.log(`Project: ${AUTOTUBE_PROJECT_NAME} (${AUTOTUBE_PROJECT_ID})`);

const projectData = await gql(
  `query($id: String!) {
    project(id: $id) {
      id name
      environments { edges { node { id name } } }
      services { edges { node { id name } } }
    }
  }`,
  { id: AUTOTUBE_PROJECT_ID },
);

const project = projectData.project;
if (!project) throw new Error('Project not found');

const services = project.services?.edges?.map((e) => e.node) ?? [];
const service = services.find((s) => s.name === SERVICE_NAME) ?? services[0];
if (!service) throw new Error('No service found');

const envs = project.environments?.edges?.map((e) => e.node) ?? [];
const environment =
  envs.find((e) => e.name === 'production') ?? envs[0];
if (!environment) throw new Error('No environment found');

console.log(`Service: ${service.name} (${service.id})`);
console.log(`Environment: ${environment.name} (${environment.id})`);

const connect = await gql(
  `mutation($id: String!, $input: ServiceConnectInput!) {
    serviceConnect(id: $id, input: $input) { id }
  }`,
  { id: service.id, input: { repo: REPO, branch: BRANCH } },
);

console.log(`SUCCESS: serviceConnect — linked ${REPO} @ ${BRANCH} (${connect.serviceConnect.id})`);

let deploymentId = null;
try {
  const deploy = await gql(
    `mutation($serviceId: String!, $environmentId: String!) {
      serviceInstanceDeployV2(serviceId: $serviceId, environmentId: $environmentId)
    }`,
    { serviceId: service.id, environmentId: environment.id },
  );
  deploymentId = deploy.serviceInstanceDeployV2;
  console.log(`SUCCESS: serviceInstanceDeployV2 — deployment ${deploymentId}`);
} catch (e1) {
  console.warn(`serviceInstanceDeployV2 failed: ${e1.message}`);
  try {
    const deploy = await gql(
      `mutation($serviceId: String!, $environmentId: String!) {
        serviceInstanceDeploy(
          serviceId: $serviceId
          environmentId: $environmentId
          latestCommit: true
        ) { id }
      }`,
      { serviceId: service.id, environmentId: environment.id },
    );
    deploymentId = deploy.serviceInstanceDeploy?.id;
    console.log(`SUCCESS: serviceInstanceDeploy(latestCommit) — ${deploymentId}`);
  } catch (e2) {
    console.warn(`Deploy mutation failed: ${e2.message}`);
  }
}

console.log('\nPolling health (up to 5 min)...');
const startUptime = (await (await fetch(HEALTH_URL)).json()).uptime;
for (let i = 0; i < 30; i++) {
  await sleep(10_000);
  const h = await (await fetch(HEALTH_URL)).json();
  const fresh = h.uptime < startUptime * 0.5 || h.deploy?.sourceConnected;
  console.log(
    `  [${i + 1}] uptime=${Math.round(h.uptime)}s commit=${h.deploy?.gitCommit?.slice(0, 7) ?? '—'} connected=${h.deploy?.sourceConnected ?? '—'}`,
  );
  if (fresh) {
    console.log(`SUCCESS: health — ${HEALTH_URL}`);
    process.exit(0);
  }
}

console.log('Deploy triggered; health still shows old container — check Railway → Deployments');
process.exit(deploymentId ? 0 : 1);
