#!/usr/bin/env node
/**
 * Build image locally, push to GHCR, deploy on Railway (bypasses Railpack snapshot).
 * Usage: npm run deploy:railway:registry
 */
import { spawnSync } from 'node:child_process';
import { loadRailwayToken, ensureRailwayApiTokenEnv } from './lib/railway-token.mjs';
import { railwayGql } from './lib/railway-gql.mjs';
import {
  AUTOTUBE_SERVICE_ID,
  AUTOTUBE_ENVIRONMENT_ID,
} from './lib/railway-autotube-ids.mjs';

ensureRailwayApiTokenEnv();

function run(cmd, args, opts = {}) {
  console.log(`\n> ${cmd} ${args.join(' ')}\n`);
  const r = spawnSync(cmd, args, { stdio: 'inherit', env: process.env, ...opts });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

function gitShort() {
  const r = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : 'latest';
}

function gitFull() {
  const r = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : 'latest';
}

const tag = process.env.RAILWAY_IMAGE_TAG || gitShort();
const image =
  process.env.RAILWAY_IMAGE ||
  `ghcr.io/nickaisbitt/autotube:${process.env.RAILWAY_IMAGE_USE_SHA === '1' ? gitFull() : tag}`;
const platform = process.env.DOCKER_PLATFORM || 'linux/amd64';
const skipBuild = process.env.RAILWAY_SKIP_BUILD === '1';

if (!skipBuild) {
  const ghToken = spawnSync('gh', ['auth', 'token'], { encoding: 'utf8' });
  if (ghToken.status !== 0 || !ghToken.stdout.trim()) {
    console.error('gh auth token failed — run: gh auth login');
    process.exit(1);
  }

  run('sh', ['-c', 'gh auth token | docker login ghcr.io -u nickaisbitt --password-stdin']);

  run('docker', [
    'build',
    '--platform',
    platform,
    '-f',
    'deploy/Dockerfile',
    '-t',
    image,
    '.',
  ]);

  run('docker', ['push', image]);
} else {
  console.log(`Skipping local build — using existing image ${image}`);
}

const token = loadRailwayToken();
if (!token) {
  console.error('Set Railway (Cursor secret) or RAILWAY_API_TOKEN — npm run env:debug-railway');
  process.exit(1);
}

console.log(`\nUpdating Railway source image → ${image}`);
await railwayGql(
  token,
  `mutation($environmentId: String!, $serviceId: String!, $input: ServiceInstanceUpdateInput!) {
    serviceInstanceUpdate(environmentId: $environmentId, serviceId: $serviceId, input: $input)
  }`,
  {
    environmentId: AUTOTUBE_ENVIRONMENT_ID,
    serviceId: AUTOTUBE_SERVICE_ID,
    input: { source: { image } },
  },
);

const dep = await railwayGql(
  token,
  `mutation($serviceId: String!, $environmentId: String!) {
    serviceInstanceDeployV2(serviceId: $serviceId, environmentId: $environmentId)
  }`,
  { serviceId: AUTOTUBE_SERVICE_ID, environmentId: AUTOTUBE_ENVIRONMENT_ID },
);
console.log(`Triggered deploy: ${dep.serviceInstanceDeployV2}`);
console.log('Wait: npm run railway:deploy:wait && npm run railway:smoke');
