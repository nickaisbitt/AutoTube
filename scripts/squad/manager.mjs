#!/usr/bin/env node
/**
 * Agent M0 — Squad manager: assign waves, print status, run merge gate (R7).
 *
 * Usage:
 *   node scripts/squad/manager.mjs status
 *   node scripts/squad/manager.mjs assign [wave]
 *   node scripts/squad/manager.mjs gate [--fixture]
 *   node scripts/squad/manager.mjs agent A3
 */
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');
const MANIFEST_PATH = join(__dirname, 'agents.json');
const STATUS_PATH = join(__dirname, 'status.json');

function loadManifest() {
  return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
}

function loadStatus() {
  if (!existsSync(STATUS_PATH)) return { agents: {} };
  return JSON.parse(readFileSync(STATUS_PATH, 'utf8'));
}

function defaultStatusFromCommits() {
  /** @type {Record<string, 'done'|'in_progress'|'pending'|'blocked'>} */
  const s = {
    M0: 'in_progress',
    A1: 'done',
    A2: 'done',
    A3: 'done',
    A4: 'done',
    A5: 'done',
    A6: 'done',
    A7: 'done',
    A8: 'done',
    A9: 'done',
    A10: 'done',
    A11: 'in_progress',
    A12: 'done',
    A13: 'done',
    A14: 'in_progress',
    A15: 'in_progress',
    R7: 'done',
  };
  return s;
}

function cmdStatus() {
  const manifest = loadManifest();
  const fileStatus = loadStatus().agents ?? {};
  const inferred = defaultStatusFromCommits();

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(' M0 — AutoTube Real-Pass Squad (17 agents)');
  console.log(` Branch: ${manifest.branch}  |  PR #${manifest.pr}`);
  console.log('═══════════════════════════════════════════════════════════\n');

  const icon = { done: '✅', in_progress: '🔄', pending: '⏳', blocked: '🚫' };

  for (const agent of manifest.agents) {
    const st = fileStatus[agent.id] ?? inferred[agent.id] ?? 'pending';
    console.log(
      `${icon[st] ?? '•'} ${agent.id.padEnd(4)} ${agent.title.padEnd(22)} [${st}]`
    );
    if (agent.mission) console.log(`     ${agent.mission}`);
    if (agent.evidence) console.log(`     evidence: ${agent.evidence}`);
    console.log('');
  }

  const done = Object.values({ ...inferred, ...fileStatus }).filter((v) => v === 'done').length;
  console.log('───────────────────────────────────────────────────────────');
  console.log(` Merge gate: npm run verify:real-pass (R7)`);
  console.log(` Fixture CI: REAL_PASS_FIXTURE=1 npm run verify:real-pass`);
  console.log('───────────────────────────────────────────────────────────\n');
}

function cmdAssign(waveFilter) {
  const manifest = loadManifest();
  const waves = manifest.waves.filter(
    (w) => !waveFilter || w.name.toLowerCase().includes(String(waveFilter).toLowerCase())
  );

  console.log('\n M0 — Wave assignments\n');
  for (const wave of waves) {
    console.log(`## ${wave.name}`);
    for (const id of wave.agents) {
      const agent = manifest.agents.find((a) => a.id === id);
      if (!agent) continue;
      console.log(`  → ${id}: ${agent.mission ?? agent.title}`);
      if (agent.files?.length) console.log(`     files: ${agent.files.join(', ')}`);
      if (agent.evidence) console.log(`     run: ${agent.evidence}`);
    }
    console.log('');
  }
}

function cmdAgent(id) {
  const manifest = loadManifest();
  const agent = manifest.agents.find((a) => a.id === id);
  if (!agent) {
    console.error(`Unknown agent: ${id}`);
    process.exit(1);
  }
  console.log(JSON.stringify(agent, null, 2));
  if (agent.brief && existsSync(join(ROOT, agent.brief))) {
    console.log('\n--- brief ---\n');
    console.log(readFileSync(join(ROOT, agent.brief), 'utf8'));
  }
}

function cmdGate(fixture) {
  const env = { ...process.env };
  if (fixture) {
    env.REAL_PASS_FIXTURE = '1';
    env.MIN_DURATION_SEC = env.MIN_DURATION_SEC ?? '30';
  }
  console.log('\n M0 — Running R7 merge gate...\n');
  const r = spawnSync('npm', ['run', 'verify:real-pass'], {
    cwd: ROOT,
    env,
    stdio: 'inherit',
    shell: true,
  });
  process.exit(r.status ?? 1);
}

function printHelp() {
  console.log(`
M0 Squad Manager

  status              Show all 17 agents and status
  assign [wave]       Print wave assignments (e.g. assign "Wave 3")
  agent <ID>          Show agent manifest + brief (M0, A1–A15, R7)
  gate [--fixture]    Run R7 verify:real-pass (merge gate)

Manifest: scripts/squad/agents.json
Board:    scripts/squad/TASK_BOARD.md
`);
}

const [,, sub, arg] = process.argv;

switch (sub) {
  case 'status':
    cmdStatus();
    break;
  case 'assign':
    cmdAssign(arg);
    break;
  case 'agent':
    cmdAgent(arg ?? 'M0');
    break;
  case 'gate':
    cmdGate(process.argv.includes('--fixture'));
    break;
  default:
    printHelp();
    break;
}
