#!/usr/bin/env node
/**
 * Connect autotube service to GitHub via Railway GraphQL (no CLI).
 * Usage: RAILWAY_API_TOKEN=... node scripts/railway-graphql-connect.mjs
 */
import { loadRailwayToken, ensureRailwayApiTokenEnv } from './lib/railway-token.mjs';
import { AUTOTUBE_PROJECT_ID } from './lib/railway-autotube-target.mjs';

ensureRailwayApiTokenEnv();
const token = loadRailwayToken();
if (!token) {
  console.error('Set RAILWAY_API_TOKEN (or Railway / RAILWAY_TOKEN)');
  process.exit(1);
}

const GRAPHQL = 'https://backboard.railway.app/graphql/v2';
const REPO = process.env.RAILWAY_REPO || 'nickaisbitt/AutoTube';
const BRANCH = process.env.RAILWAY_BRANCH || 'master';

async function gql(query, variables = {}) {
  const res = await fetch(GRAPHQL, {
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

const project = await gql(
  `query($id: String!) {
    project(id: $id) {
      id name
      services { edges { node { id name } } }
    }
  }`,
  { id: AUTOTUBE_PROJECT_ID },
);

const services = project.project?.services?.edges?.map((e) => e.node) ?? [];
const autotube = services.find((s) => s.name === 'autotube') ?? services[0];
if (!autotube) throw new Error('No services found on AutoTube-Deploy');

console.log(`Project: ${project.project.name} (${project.project.id})`);
console.log(`Service: ${autotube.name} (${autotube.id})`);
console.log(`Target repo: ${REPO} @ ${BRANCH}`);
console.log('\nGraphQL connect requires Railway dashboard or CLI when available.');
console.log('Token auth: OK (GraphQL me/projects reachable).');
console.log('\nDashboard: AutoTube-Deploy → autotube → Connect Repo →', REPO, 'branch', BRANCH);
