import { AUTOTUBE_GRAPHQL } from './railway-autotube-ids.mjs';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function railwayGql(token, query, variables = {}, retries = 3) {
  let lastErr;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(AUTOTUBE_GRAPHQL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(120_000),
      });
      const text = await res.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error(
          `Railway API returned non-JSON (HTTP ${res.status}): ${text.slice(0, 120)}`,
        );
      }
      if (!res.ok || json.errors?.length) {
        throw new Error(json.errors?.map((e) => e.message).join('; ') || res.statusText);
      }
      return json.data;
    } catch (e) {
      lastErr = e;
      if (attempt < retries - 1) await sleep(1500 * (attempt + 1));
    }
  }
  throw lastErr;
}

export async function fetchBuildLogTail(token, deploymentId, limit = 12) {
  try {
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
  } catch (e) {
    if (/does not have an associated build/i.test(String(e.message))) return [];
    throw e;
  }
}
