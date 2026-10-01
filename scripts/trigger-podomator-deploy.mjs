#!/usr/bin/env node
/**
 * Dispatch PODOMATOR "AutoTube deploy GHCR" workflow (uses PODOMATOR RAILWAY_API_TOKEN secret).
 * Usage: npm run deploy:bootstrap [-- --sha FULL_SHA]
 */
const TOKEN = process.env.CURSOR_GIT_TOKEN || process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
const REPO = 'nickaisbitt/PODOMATOR';
const WORKFLOW_FILE = 'autotube-deploy-ghcr.yml';

async function gh(path, opts = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...opts,
    headers: {
      Authorization: `token ${TOKEN}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`GitHub ${path} → ${res.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

async function main() {
  if (!TOKEN) {
    console.error('[deploy:bootstrap] Missing CURSOR_GIT_TOKEN');
    process.exit(1);
  }

  const shaArg = process.argv.find((a, i) => process.argv[i - 1] === '--sha');
  const workflows = await gh(`/repos/${REPO}/actions/workflows`);
  const wf = workflows.workflows?.find((w) => w.path.endsWith(WORKFLOW_FILE));
  if (!wf) throw new Error(`Workflow ${WORKFLOW_FILE} not found on ${REPO}`);

  const inputs = { sync_secrets_only: 'false' };
  if (shaArg) inputs.image_sha = shaArg;

  await gh(`/repos/${REPO}/actions/workflows/${wf.id}/dispatches`, {
    method: 'POST',
    body: JSON.stringify({ ref: 'main', inputs }),
  });

  console.log(`[deploy:bootstrap] Dispatched ${REPO} → ${WORKFLOW_FILE}`);
  console.log(`[deploy:bootstrap] Watch: https://github.com/${REPO}/actions/workflows/${WORKFLOW_FILE}`);

  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 15_000));
    const runs = await gh(`/repos/${REPO}/actions/workflows/${wf.id}/runs?per_page=1`);
    const run = runs.workflow_runs?.[0];
    if (!run) continue;
    console.log(`[deploy:bootstrap] ${run.status} ${run.conclusion ?? ''} ${run.html_url}`);
    if (run.status === 'completed') {
      process.exit(run.conclusion === 'success' ? 0 : 1);
    }
  }
  console.error('[deploy:bootstrap] Timed out waiting for workflow');
  process.exit(1);
}

main().catch((e) => {
  console.error(`[deploy:bootstrap] ${e.message}`);
  process.exit(1);
});
