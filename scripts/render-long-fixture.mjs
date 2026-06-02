#!/usr/bin/env node
/**
 * Render long-form fixture (6 × ~85-word segments) → ≥180s -final.mp4 for strict Real Pass.
 * Usage: npm run render:fixture:full
 */
import { writeFileSync, copyFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { writeFileSync as writePkg } from 'fs';
import { buildLongFixtureProject } from './lib/long-fixture-project.mjs';
import { buildPackagingSuggestions } from './lib/youtube-packaging.mjs';
import { validateOutput, MIN_RENDER_OUTPUT_BYTES } from '../server-render/pipelineReliability.mjs';

const ROOT = process.cwd();
const OUT = join(ROOT, 'test-recordings', 'FINAL-OUTPUT.mp4');
mkdirSync(join(ROOT, 'test-recordings'), { recursive: true });

const project = buildLongFixtureProject({
  backgroundMusic: process.env.FIXTURE_BACKGROUND_MUSIC !== '0',
  musicPreset: process.env.FIXTURE_MUSIC_PRESET ?? 'neutral',
});

// Clear stale /tmp projects so server-render does not pick an old short fixture.
try {
  for (const f of readdirSync('/tmp')) {
    if (f.startsWith('autotube-project') && f.endsWith('.json')) {
      unlinkSync(`/tmp/${f}`);
    }
  }
} catch { /* ignore */ }

const projectPath = '/tmp/autotube-project.json';
writeFileSync(projectPath, JSON.stringify(project, null, 2));
writePkg(
  join(ROOT, 'test-recordings', 'SHIP_PACKAGE.json'),
  JSON.stringify(buildPackagingSuggestions(project), null, 2),
);

const scriptSec = project.script.reduce((s, seg) => s + seg.duration, 0);
console.log(`📝 Long fixture: ${project.script.length} segments, ~${scriptSec}s script target`);
console.log(`   backgroundMusic=${project.exportSettings.backgroundMusic}`);
console.log(`🎥 Rendering → ${OUT}\n`);

const devServer = process.env.DEV_SERVER_URL || 'http://localhost:5173';
const start = Date.now();
const result = spawnSync('node', ['server-render.mjs', OUT], {
  cwd: ROOT,
  env: {
    ...process.env,
    DEV_SERVER_URL: devServer,
    AUTOTUBE_FORCE_CPU: process.env.AUTOTUBE_FORCE_CPU ?? '1',
    AUTOTUBE_PROJECT_PATH: projectPath,
    AUTOTUBE_YOUTUBE_MODE: '1',
  },
  encoding: 'utf8',
  timeout: 3_600_000,
  stdio: ['inherit', 'pipe', 'pipe'],
});

const renderLogPath = join(ROOT, 'test-recordings', 'latest-render.log');
writeFileSync(renderLogPath, `${result.stdout || ''}\n${result.stderr || ''}`);
console.log(`📋 Render log: ${renderLogPath} (${((Date.now() - start) / 1000).toFixed(0)}s wall)`);

if (result.stdout) process.stdout.write(result.stdout.slice(-4000));
if (result.stderr) process.stderr.write(result.stderr.slice(-2000));

if (result.status !== 0 && result.status !== null) {
  console.error(`\n❌ server-render exited with code ${result.status}`);
  process.exit(result.status);
}

const finalPath = OUT.replace('.mp4', '-final.mp4');
const produced = existsSync(finalPath) ? finalPath : existsSync(OUT) ? OUT : null;
if (!produced) {
  console.error('\n❌ No output file');
  process.exit(1);
}

const gate = validateOutput(produced, 'Long fixture render', { minBytes: MIN_RENDER_OUTPUT_BYTES });
if (!gate.valid) {
  console.error(`\n❌ ${gate.error}`);
  process.exit(1);
}

const probe = spawnSync(
  'ffprobe',
  ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', produced],
  { encoding: 'utf8' },
);
const durationSec = probe.stdout ? parseFloat(probe.stdout.trim()) : NaN;

console.log(`\n✅ LONG FIXTURE: ${produced}`);
console.log(`   Size: ${(gate.size / 1024 / 1024).toFixed(2)} MB`);
if (Number.isFinite(durationSec)) {
  console.log(`   Duration: ${durationSec.toFixed(1)}s`);
  if (durationSec < 180) {
    console.warn(`   ⚠ Below 180s merge gate — TTS may have shortened segments`);
  }
}

if (produced !== OUT && existsSync(produced)) {
  copyFileSync(produced, OUT.replace('.mp4', '-final.mp4'));
}

process.exit(Number.isFinite(durationSec) && durationSec >= 180 ? 0 : 1);
