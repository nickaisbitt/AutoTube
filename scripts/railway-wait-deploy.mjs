#!/usr/bin/env node
/**
 * Poll latest Railway deployment until SUCCESS / FAILED / timeout.
 * Detects V3 regression, snapshot stalls, and REMOVED while a newer deploy is active.
 * Usage: npm run railway:deploy:wait
 */
import { loadRailwayToken } from './lib/railway-token.mjs';
import { AUTOTUBE_PROJECT_ID } from './lib/railway-autotube-target.mjs';
import {
  AUTOTUBE_SERVICE_ID,
  AUTOTUBE_ENVIRONMENT_ID,
} from './lib/railway-autotube-ids.mjs';
import { railwayGql, fetchBuildLogTail } from './lib/railway-gql.mjs';

const HEALTH_URL =
  process.env.AUTOTUBE_HEALTH_URL ||
  'https://autotube-production.up.railway.app/api/health';
const MAX_MIN = Number(process.env.RAILWAY_WAIT_MAX_MIN || 25);
const POLL_MS = Number(process.env.RAILWAY_WAIT_POLL_MS || 30_000);
const SNAPSHOT_STALL_MIN = Number(process.env.RAILWAY_SNAPSHOT_STALL_MIN || 25);

async function listDeployments(token, first = 5) {
  const data = await railwayGql(
    token,
    `query($input: DeploymentListInput!, $first: Int) {
      deployments(input: $input, first: $first) {
        edges { node { id status createdAt meta } }
      }
    }`,
    {
      input: {
        projectId: AUTOTUBE_PROJECT_ID,
        environmentId: AUTOTUBE_ENVIRONMENT_ID,
        serviceId: AUTOTUBE_SERVICE_ID,
      },
      first,
    },
  );
  return data.deployments?.edges?.map((e) => e.node) ?? [];
}

function activeDeploy(deployments) {
  return (
    deployments.find((d) =>
      ['BUILDING', 'DEPLOYING', 'INITIALIZING', 'QUEUED'].includes(d.status),
    ) ??
    deployments[0] ??
    null
  );
}

function buildEnv(d) {
  return d?.meta?.serviceManifest?.build?.buildEnvironment ?? '—';
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

  const startHealth = await (await fetch(HEALTH_URL)).json();
  const startUptime = startHealth.uptime ?? 0;
  const localCommit = process.env.RAILWAY_EXPECT_COMMIT?.trim();
  console.log(
    `Waiting for deploy (max ${MAX_MIN} min, snapshot stall ${SNAPSHOT_STALL_MIN} min). Old uptime=${Math.round(startUptime)}s`,
  );

  const deadline = Date.now() + MAX_MIN * 60_000;
  let n = 0;
  let lastStatus = '';
  let lastLogKey = '';
  let buildingSince = null;
  let lastLogChangeAt = Date.now();

  while (Date.now() < deadline) {
    n++;
    const deployments = await listDeployments(token, 8);
    const d = activeDeploy(deployments);
    const hash = d?.meta?.commitHash?.slice(0, 7) ?? '—';
    const env = buildEnv(d);
    const idShort = d?.id?.slice(0, 8) ?? '—';

    if (d?.status !== lastStatus) {
      console.log(`[${n}] ${d?.status ?? '?'} commit=${hash} env=${env} id=${idShort}`);
      lastStatus = d?.status ?? '';
      if (d?.status === 'BUILDING' && !buildingSince) buildingSince = Date.now();
      if (d?.status !== 'BUILDING') buildingSince = null;
    } else {
      console.log(`[${n}] ${d?.status ?? '?'} commit=${hash} env=${env} id=${idShort}`);
    }

    if (env === 'V3') {
      console.error('buildEnvironment=V3 (Metal). Run: npm run railway:disable-metal');
      process.exit(2);
    }

    if (d?.id && ['BUILDING', 'DEPLOYING', 'QUEUED'].includes(d.status)) {
      const logs = await fetchBuildLogTail(token, d.id, 15);
      const tail = logs.slice(-3).join(' | ');
      const logKey = logs.at(-1) ?? '';
      if (logKey !== lastLogKey) {
        lastLogKey = logKey;
        lastLogChangeAt = Date.now();
        if (tail) console.log(`  logs: ${tail.slice(0, 280)}`);
      }

      const stallMs = Date.now() - lastLogChangeAt;
      const onSnapshot =
        /uploading snapshot|fetching snapshot/i.test(logKey) ||
        /uploading snapshot|fetching snapshot/i.test(logs.at(-2) ?? '');
      if (
        d.status === 'BUILDING' &&
        buildingSince &&
        Date.now() - buildingSince > SNAPSHOT_STALL_MIN * 60_000 &&
        onSnapshot &&
        stallMs > 20 * 60_000
      ) {
        console.error(
          `Stuck on snapshot upload >${SNAPSHOT_STALL_MIN} min. Cancel and retry: npm run railway:cancel-stale-builds && npm run deploy:railway`,
        );
        console.error('Or: RAILWAY_USE_DOCKERFILE=1 npm run deploy:railway');
        process.exit(2);
      }
    }

    if (d?.status === 'SUCCESS') {
      const h = await (await fetch(HEALTH_URL)).json();
      const commit = h.deploy?.gitCommit ?? '';
      const uptime = h.uptime ?? 0;
      const freshUptime = uptime < Math.min(startUptime * 0.5, 900);
      const commitOk =
        !localCommit ||
        commit.startsWith(localCommit) ||
        localCommit.startsWith(commit.slice(0, 12));
      console.log(
        `Health uptime=${Math.round(uptime)}s commit=${commit.slice(0, 12) || '—'}`,
      );
      if (freshUptime && (commit || uptime < 300)) {
        console.log('SUCCESS: new deployment is live');
        process.exit(0);
      }
      console.log('Railway SUCCESS but health not fresh yet — waiting…');
    }

    if (d?.status === 'FAILED' || d?.status === 'CRASHED') {
      console.error(`Deploy ${d.status}. Check Railway build logs for ${idShort}`);
      process.exit(1);
    }

    if (d?.status === 'REMOVED') {
      const newer = deployments.find(
        (x) =>
          x.id !== d.id &&
          ['BUILDING', 'DEPLOYING', 'QUEUED', 'SUCCESS'].includes(x.status),
      );
      if (newer) {
        console.log(`Deploy removed; newer active: ${newer.id.slice(0, 8)} ${newer.status}`);
      } else {
        console.error('Deploy ended: REMOVED (no newer active deploy)');
        process.exit(1);
      }
    }

    await sleep(POLL_MS);
  }

  console.error('Timeout waiting for deploy');
  process.exit(1);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
