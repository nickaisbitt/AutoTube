#!/usr/bin/env node
/**
 * One-shot production deploy: single config patch, one trigger, wait for live health.
 * Usage: npm run deploy:railway
 *   RAILWAY_SYNC_ENV=1     — batch env vars into one environmentPatchCommit
 *   RAILWAY_USE_DOCKERFILE=1 — use deploy/Dockerfile (emergency only; same snapshot path)
 */
import { spawnSync } from 'node:child_process';
import { loadRailwayToken, ensureRailwayApiTokenEnv } from './lib/railway-token.mjs';
import {
  AUTOTUBE_SERVICE_ID,
  AUTOTUBE_ENVIRONMENT_ID,
} from './lib/railway-autotube-ids.mjs';
import { railwayGql } from './lib/railway-gql.mjs';
import {
  applyProdBuildConfig,
  readProdBuildConfig,
} from './lib/railway-prod-build-config.mjs';

ensureRailwayApiTokenEnv();

function runNpm(script, { optional = false } = {}) {
  console.log(`\n> npm run ${script}\n`);
  const r = spawnSync('npm', ['run', script], {
    stdio: 'inherit',
    env: process.env,
    cwd: process.cwd(),
  });
  if (r.status !== 0) {
    if (optional) {
      console.warn(`Warning: ${script} exited ${r.status ?? 1} (continuing)`);
      return false;
    }
    process.exit(r.status ?? 1);
  }
  return true;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function cancelAllActive(token) {
  const data = await railwayGql(
    token,
    `query($input: DeploymentListInput!, $first: Int) {
      deployments(input: $input, first: $first) {
        edges { node { id status createdAt } }
      }
    }`,
    {
      input: {
        projectId: process.env.AUTOTUBE_RAILWAY_PROJECT_ID || '283b075f-eb25-4a60-8468-a45d77e068bc',
        environmentId: AUTOTUBE_ENVIRONMENT_ID,
        serviceId: AUTOTUBE_SERVICE_ID,
      },
      first: 20,
    },
  );
  const active = (data.deployments?.edges ?? [])
    .map((e) => e.node)
    .filter((n) => ['BUILDING', 'QUEUED', 'INITIALIZING', 'DEPLOYING'].includes(n.status));
  for (const d of active) {
    const ok = await railwayGql(
      token,
      `mutation($id: String!) { deploymentCancel(id: $id) }`,
      { id: d.id },
    );
    console.log(`Canceled ${d.status} ${d.id.slice(0, 8)} → ${ok.deploymentCancel}`);
    await sleep(400);
  }
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

  const useDocker = process.env.RAILWAY_USE_DOCKERFILE === '1';
  const syncEnv = process.env.RAILWAY_SYNC_ENV === '1';
  const current = await readProdBuildConfig(token);
  const wantRailpack = !useDocker;
  const needsPatch =
    current?.buildEnvironment !== 'V2' ||
    (wantRailpack &&
      (current?.builder !== 'RAILPACK' || current?.buildCommand !== 'npm run build:railway')) ||
    (!wantRailpack && current?.builder !== 'DOCKERFILE') ||
    syncEnv;

  if (needsPatch) {
    const build = await applyProdBuildConfig(token, { useDockerfile: useDocker, syncEnv });
    console.log('Build config:', build);
    console.log('Waiting 8s for Railway to register patch-triggered deploys…');
    await sleep(8000);
    await cancelAllActive(token);
    await sleep(2000);
  } else {
    console.log('Build config already V2 Railpack — skipping patch');
    await cancelAllActive(token);
  }

  const deploymentId = await triggerDeploy(token);

  const waitOk = runNpm('railway:deploy:wait');
  runNpm('deploy:status');
  runNpm('railway:smoke', { optional: true });

  if (!waitOk) {
    console.log('\nDeploy did not succeed — generating support bundle…');
    runNpm('railway:support-bundle', { optional: true });
    process.exit(1);
  }

  console.log(`\nDeploy ${deploymentId} finished. Verify deploy.gitCommit in health.`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
