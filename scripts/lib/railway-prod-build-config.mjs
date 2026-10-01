import {
  AUTOTUBE_SERVICE_ID,
  AUTOTUBE_ENVIRONMENT_ID,
} from './railway-autotube-ids.mjs';
import { railwayGql } from './railway-gql.mjs';
import {
  buildProdRailwayVars,
  readEnvLocal,
  varsForEnvironmentPatch,
} from './railway-prod-env.mjs';

async function readServiceBlock(token) {
  const env = await railwayGql(
    token,
    `query($id: String!) { environment(id: $id) { config } }`,
    { id: AUTOTUBE_ENVIRONMENT_ID },
  );
  const svc = env.environment?.config?.services?.[AUTOTUBE_SERVICE_ID];
  if (!svc) throw new Error('autotube missing from environment config');
  return structuredClone(svc);
}

function buildBlock(svc, { useDockerfile = false, syncEnv = false } = {}) {
  const next = structuredClone(svc);
  if (useDockerfile) {
    next.build = {
      ...next.build,
      builder: 'DOCKERFILE',
      dockerfilePath: 'deploy/Dockerfile',
      buildEnvironment: 'V2',
      buildCommand: null,
    };
  } else {
    next.build = {
      ...next.build,
      builder: 'RAILPACK',
      dockerfilePath: null,
      buildEnvironment: 'V2',
      buildCommand: 'npm run build:railway',
    };
  }
  if (syncEnv) {
    const vars = buildProdRailwayVars(readEnvLocal());
    next.variables = varsForEnvironmentPatch(vars);
  }
  return next;
}

/** One patch: V2 + Railpack + optional env vars (avoids per-step auto-deploy storms). */
export async function applyProdBuildConfig(
  token,
  { useDockerfile = false, syncEnv = false } = {},
) {
  const svc = await readServiceBlock(token);
  const next = buildBlock(svc, { useDockerfile, syncEnv });

  await railwayGql(
    token,
    `mutation($environmentId: String!, $patch: EnvironmentConfig, $commitMessage: String) {
      environmentPatchCommit(environmentId: $environmentId, patch: $patch, commitMessage: $commitMessage)
    }`,
    {
      environmentId: AUTOTUBE_ENVIRONMENT_ID,
      patch: { services: { [AUTOTUBE_SERVICE_ID]: next } },
      commitMessage: useDockerfile
        ? 'autotube: DOCKERFILE V2'
        : syncEnv
          ? 'autotube: RAILPACK V2 + env vars'
          : 'autotube: RAILPACK V2 + build:railway',
    },
  );

  return next.build;
}

export async function readProdBuildConfig(token) {
  const env = await railwayGql(
    token,
    `query($id: String!) { environment(id: $id) { config } }`,
    { id: AUTOTUBE_ENVIRONMENT_ID },
  );
  return env.environment?.config?.services?.[AUTOTUBE_SERVICE_ID]?.build ?? null;
}

export async function readProdServiceConfig(token) {
  return readServiceBlock(token);
}
