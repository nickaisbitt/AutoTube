#!/usr/bin/env node
/**
 * Disable Metal build environment (V3) for autotube → use V2 via environment patch.
 * Usage: npm run railway:disable-metal
 */
import { loadRailwayToken, ensureRailwayApiTokenEnv } from './lib/railway-token.mjs';
import {
  AUTOTUBE_SERVICE_ID,
  AUTOTUBE_ENVIRONMENT_ID,
} from './lib/railway-autotube-ids.mjs';
import { railwayGql } from './lib/railway-gql.mjs';

ensureRailwayApiTokenEnv();
const token = loadRailwayToken();
if (!token) {
  console.error('Set RAILWAY_API_TOKEN or Railway in env');
  process.exit(1);
}

const SERVICE_ID = process.env.RAILWAY_SERVICE_ID || AUTOTUBE_SERVICE_ID;
const ENVIRONMENT_ID = process.env.RAILWAY_ENVIRONMENT_ID || AUTOTUBE_ENVIRONMENT_ID;

const env = await railwayGql(
  token,
  `query($id: String!) { environment(id: $id) { config } }`,
  { id: ENVIRONMENT_ID },
);
const cfg = env.environment?.config;
const svc = cfg?.services?.[SERVICE_ID];
if (!svc) throw new Error(`Service ${SERVICE_ID} not in environment config`);

const build = svc.build ?? {};
const next = structuredClone(svc);
next.build = {
  ...build,
  builder: build.builder === 'DOCKERFILE' ? 'DOCKERFILE' : build.builder || 'RAILPACK',
  buildEnvironment: 'V2',
  buildCommand:
    build.builder === 'DOCKERFILE' ? null : build.buildCommand || 'npm run build:railway',
};

if (
  build.buildEnvironment === 'V2' &&
  (build.builder === 'DOCKERFILE' || build.buildCommand === 'npm run build:railway')
) {
  console.log('Metal already off (buildEnvironment=V2)', next.build);
  process.exit(0);
}

await railwayGql(
  token,
  `mutation($environmentId: String!, $patch: EnvironmentConfig, $commitMessage: String) {
    environmentPatchCommit(environmentId: $environmentId, patch: $patch, commitMessage: $commitMessage)
  }`,
  {
    environmentId: ENVIRONMENT_ID,
    patch: { services: { [SERVICE_ID]: next } },
    commitMessage: 'Disable Metal build environment (V3→V2) for autotube',
  },
);

const verify = await railwayGql(
  token,
  `query($id: String!) { environment(id: $id) { config } }`,
  { id: ENVIRONMENT_ID },
);
const after = verify.environment.config.services[SERVICE_ID].build;
console.log('Updated build config:', after);
if (after.buildEnvironment !== 'V2') {
  console.error('Patch did not stick — check Railway dashboard');
  process.exit(1);
}
console.log('Done. Redeploy: npm run deploy:railway');
