#!/usr/bin/env node
/**
 * Railway support escalation bundle after snapshot / deploy failure.
 * Usage: npm run railway:support-bundle
 * Optional escape hatch: npm run railway:up (local build → upload)
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { loadRailwayToken, ensureRailwayApiTokenEnv } from './lib/railway-token.mjs';
import { railwayGql, fetchBuildLogTail } from './lib/railway-gql.mjs';
import {
  AUTOTUBE_SERVICE_ID,
  AUTOTUBE_ENVIRONMENT_ID,
} from './lib/railway-autotube-ids.mjs';
import { AUTOTUBE_PROJECT_ID, AUTOTUBE_PROJECT_NAME } from './lib/railway-autotube-target.mjs';
import { readProdBuildConfig } from './lib/railway-prod-build-config.mjs';

ensureRailwayApiTokenEnv();
const token = loadRailwayToken();

function git(cmd) {
  const r = spawnSync('git', cmd.split(' '), { encoding: 'utf8' });
  return r.status === 0 ? (r.stdout || '').trim() : '—';
}

const lines = [];
const add = (s) => lines.push(s);

add('=== Railway support bundle (AutoTube) ===');
add('');
add(`Project: ${AUTOTUBE_PROJECT_NAME} (${AUTOTUBE_PROJECT_ID})`);
add(`Service: autotube (${AUTOTUBE_SERVICE_ID})`);
add(`Environment: production (${AUTOTUBE_ENVIRONMENT_ID})`);
add(`Local HEAD: ${git('rev-parse HEAD')} (${git('rev-parse --short HEAD')})`);
add('');
add('Issue: Build completes (Vite ~3s / shrink OK) but SNAPSHOT_CODE / uploading snapshot fails on V2.');
add('Tried: Railpack V2 + Dockerfile multi-stage — same snapshot failure.');
add('');

if (token) {
  const build = await readProdBuildConfig(token);
  add(`Builder: ${build?.builder ?? '—'}`);
  add(`buildEnvironment: ${build?.buildEnvironment ?? '—'}`);
  add(`buildCommand: ${build?.buildCommand ?? '—'}`);
  add('');

  const depData = await railwayGql(
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
      first: 5,
    },
  );
  const deps = depData.deployments?.edges?.map((e) => e.node) ?? [];
  add('Recent deployments:');
  for (const d of deps) {
    add(`  ${d.status} ${d.id} commit=${d.meta?.commitHash?.slice(0, 7) ?? '—'}`);
  }
  const failed = deps.find((d) => d.status === 'FAILED');
  if (failed) {
    add('');
    add(`Failed deploy tail (${failed.id}):`);
    const logs = await fetchBuildLogTail(token, failed.id, 15);
    for (const l of logs) add(`  ${l}`);
  }
}

add('');
add('--- Escape hatch (may bypass builder snapshot) ---');
add('  railway link  # if not linked');
add('  railway up --service autotube');
add('  Or: npm run railway:up');
add('');

const out = `railway-support-bundle-${Date.now()}.txt`;
fs.writeFileSync(out, lines.join('\n'));
console.log(lines.join('\n'));
console.log(`\nSaved: ${out}`);
console.log('Post to Railway Discord/support with the file above.');
