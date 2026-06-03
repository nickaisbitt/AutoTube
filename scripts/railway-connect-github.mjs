#!/usr/bin/env node
/**
 * Connect autotube service to GitHub via Railway CLI (backend).
 */
import { spawnSync } from 'node:child_process';
import { loadRailwayToken, ensureRailwayApiTokenEnv } from './lib/railway-token.mjs';

ensureRailwayApiTokenEnv();
const token = loadRailwayToken();
if (!token) {
  console.error('No Railway token. Run: npm run env:debug-railway');
  process.exit(1);
}
process.env.RAILWAY_TOKEN = token;

const PROJECT = process.env.RAILWAY_PROJECT || 'AutoTube-Deploy';
const ENVIRONMENT = process.env.RAILWAY_ENVIRONMENT || 'production';
const SERVICE = process.env.RAILWAY_SERVICE || 'autotube';
const REPO = process.env.RAILWAY_REPO || 'nickaisbitt/AutoTube';
const BRANCH = process.env.RAILWAY_BRANCH || 'master';

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', env: process.env, ...opts });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

console.log(`Linking ${PROJECT} / ${ENVIRONMENT} / ${SERVICE}`);
run('npx', ['@railway/cli', 'link', '--project', PROJECT, '--environment', ENVIRONMENT]);
run('npx', ['@railway/cli', 'service', 'link', SERVICE]);

console.log(`Source: ${REPO} @ ${BRANCH}`);
run('npx', ['@railway/cli', 'environment', 'edit', '--service-config', SERVICE, 'source.repo', REPO]);
run('npx', ['@railway/cli', 'environment', 'edit', '--service-config', SERVICE, 'source.branch', BRANCH]);
run('npx', ['@railway/cli', 'environment', 'edit', '--service-config', SERVICE, 'source.rootDirectory', '']);

console.log('Redeploy from GitHub...');
run('npx', ['@railway/cli', 'redeploy', '--service', SERVICE, '--from-source', '--yes']);

console.log('\nDone. https://autotube-production.up.railway.app/api/health');
