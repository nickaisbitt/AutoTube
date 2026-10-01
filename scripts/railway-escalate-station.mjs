#!/usr/bin/env node
/**
 * Print Railway Central Station escalation post (copy/paste or open URL).
 * Usage: npm run railway:escalate
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { loadRailwayToken, ensureRailwayApiTokenEnv } from './lib/railway-token.mjs';
import { railwayGql, fetchBuildLogTail } from './lib/railway-gql.mjs';
import {
  AUTOTUBE_SERVICE_ID,
  AUTOTUBE_ENVIRONMENT_ID,
} from './lib/railway-autotube-ids.mjs';
import { AUTOTUBE_PROJECT_ID } from './lib/railway-autotube-target.mjs';
import { readProdBuildConfig } from './lib/railway-prod-build-config.mjs';

ensureRailwayApiTokenEnv();
const token = loadRailwayToken();

function git(cmd) {
  const r = spawnSync('git', cmd.split(' '), { encoding: 'utf8' });
  return r.status === 0 ? (r.stdout || '').trim() : '—';
}

const build = token ? await readProdBuildConfig(token) : null;
let deps = [];
if (token) {
  const depData = await railwayGql(
    token,
    `query($input: DeploymentListInput!, $first: Int) {
      deployments(input: $input, first: $first) {
        edges { node { id status meta } }
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
  deps = depData.deployments?.edges?.map((e) => e.node) ?? [];
}

const failed = deps.filter((d) => d.status === 'FAILED' || d.status === 'BUILDING');
const failedId = failed[0]?.id;
let logTail = '';
if (token && failedId) {
  const logs = await fetchBuildLogTail(token, failedId, 6);
  logTail = logs.filter((l) => /snapshot|built in|uploading/i.test(l)).join('\n');
}

const body = `## Build succeeds, snapshot export hangs/fails (V2 Railpack + Dockerfile)

**Project:** AutoTube-Deploy (\`${AUTOTUBE_PROJECT_ID}\`)
**Service:** autotube (\`${AUTOTUBE_SERVICE_ID}\`)
**Environment:** production (\`${AUTOTUBE_ENVIRONMENT_ID}\`)
**Repo:** https://github.com/nickaisbitt/AutoTube
**Local HEAD:** \`${git('rev-parse HEAD')}\`

### Symptom
Every deploy completes the app build (Vite ~2–3s, \`npm run build:railway\` OK) then stalls or fails at **uploading snapshot** / image export. Prod container has been live ~5+ days; new deploys never roll.

### Config
- Builder: ${build?.builder ?? 'RAILPACK'} on **${build?.buildEnvironment ?? 'V2'}**
- buildCommand: \`${build?.buildCommand ?? 'npm run build:railway'}\`
- Tried: Railpack V2, Dockerfile multi-stage, \`railway up\` — same snapshot phase

### Recent deployment IDs
${deps.map((d) => `- \`${d.id}\` ${d.status} commit=${d.meta?.commitHash?.slice(0, 7) ?? '—'}`).join('\n')}

### Log excerpt
\`\`\`
${logTail || '(see Railway build logs — last lines show vite success then stall)'}
\`\`\`

### Ask
Is this a known snapshot export issue on your builders? Any workaround besides Docker **registry** deploy (which we'd prefer to avoid)?

Thanks!`;

const out = 'railway-station-post.md';
fs.writeFileSync(out, body);
console.log('Post to: https://station.railway.com/questions/new\n');
console.log(body);
console.log(`\nSaved: ${out}`);
