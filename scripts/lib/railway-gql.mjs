import { AUTOTUBE_GRAPHQL } from './railway-autotube-ids.mjs';

export async function railwayGql(token, query, variables = {}) {
  const res = await fetch(AUTOTUBE_GRAPHQL, {
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

export async function fetchBuildLogTail(token, deploymentId, limit = 12) {
  const data = await railwayGql(
    token,
    `query($d: String!, $limit: Int) {
      buildLogs(deploymentId: $d, limit: $limit) {
        ... on Log { message }
      }
    }`,
    { d: deploymentId, limit },
  );
  return (data.buildLogs ?? []).map((l) => l.message ?? '').filter(Boolean);
}
