import {
  AUTOTUBE_SERVICE_ID,
  AUTOTUBE_ENVIRONMENT_ID,
} from './railway-autotube-ids.mjs';
import { railwayGql } from './railway-gql.mjs';

/** One patch: V2 + Railpack + build:railway (avoids per-step auto-deploy storms). */
export async function applyProdBuildConfig(token, { useDockerfile = false } = {}) {
  const env = await railwayGql(
    token,
    `query($id: String!) { environment(id: $id) { config } }`,
    { id: AUTOTUBE_ENVIRONMENT_ID },
  );
  const svc = env.environment?.config?.services?.[AUTOTUBE_SERVICE_ID];
  if (!svc) throw new Error('autotube missing from environment config');

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
