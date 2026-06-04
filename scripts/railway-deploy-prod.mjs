#!/usr/bin/env node
/**
 * One-shot production deploy: V2 builder, single deploy, wait for live health.
 * Usage: npm run deploy:railway
 *   RAILWAY_USE_DOCKERFILE=1  — switch to deploy/Dockerfile builder before deploy
 */
import { spawnSync } from 'node:child_process';
import { loadRailwayToken, ensureRailwayApiTokenEnv } from './lib/railway-token.mjs';
import { AUTOTUBE_PROJECT_ID } from './lib/railway-autotube-target.mjs';
import {
  AUTOTUBE_SERVICE_ID,
  AUTOTUBE_ENVIRONMENT_ID,
} from './lib/railway-autotube-ids.mjs';
import { railwayGql } from './lib/railway-gql.mjs';

ensureRailwayApiTokenEnv();

function runNpm(script) {
  console.log(`\n> npm run ${script}\n`);
  const r = spawnSync('npm', ['run', script], {
    stdio: 'inherit',
    env: process.env,
    cwd: process.cwd(),
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

async function patchDockerfileBuilder(token) {
  const env = await railwayGql(
    token,
    `query($id: String!) { environment(id: $id) { config } }`,
    { id: AUTOTUBE_ENVIRONMENT_ID },
  );
  const svc = env.environment?.config?.services?.[AUTOTUBE_SERVICE_ID];
  if (!svc) throw new Error('autotube service not in environment config');

  const next = structuredClone(svc);
  next.build = {
    ...next.build,
    builder: 'DOCKERFILE',
    dockerfilePath: 'deploy/Dockerfile',
    buildEnvironment: 'V2',
    buildCommand: null,
  };

  await railwayGql(
    token,
    `mutation($environmentId: String!, $patch: EnvironmentConfig, $commitMessage: String) {
      environmentPatchCommit(environmentId: $environmentId, patch: $patch, commitMessage: $commitMessage)
    }`,
    {
      environmentId: AUTOTUBE_ENVIRONMENT_ID,
      patch: { services: { [AUTOTUBE_SERVICE_ID]: next } },
      commitMessage: 'Use deploy/Dockerfile (V2) for autotube',
    },
  );
  console.log('Builder set to DOCKERFILE deploy/Dockerfile (V2)');
}

async function triggerDeploy(token) {
  const id = await railwayGql(
    token,
    `mutation($serviceId: String!, $environmentId: String!) {
      serviceInstanceDeployV2(serviceId: $serviceId, environmentId: $environmentId)
    }`,
    { serviceId: AUTOTUBE_SERVICE_ID, environmentId: AUTOTUBE_ENVIRONMENT_ID },
  );
  const deploymentId = id.serviceInstanceDeployV2;
  console.log(`Triggered deploy: ${deploymentId}`);
  return deploymentId;
}

async function main() {
  const token = loadRailwayToken();
  if (!token) {
    console.error('Set RAILWAY_API_TOKEN or Railway in .env.local');
    process.exit(1);
  }

  if (process.env.RAILWAY_USE_DOCKERFILE === '1') {
    await patchDockerfileBuilder(token);
  } else {
    runNpm('railway:disable-metal');
  }

  runNpm('railway:sync-env');

  // Wait for Railway to register any auto-triggered deployments from config patches
  await new Promise((r) => setTimeout(r, 5000));

  // Cancel all stale builds (including those auto-triggered by config patches)
  runNpm('railway:cancel-stale-builds');

  await triggerDeploy(token);

  runNpm('railway:deploy:wait');
  runNpm('deploy:status');
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
