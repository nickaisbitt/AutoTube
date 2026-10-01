#!/usr/bin/env node
/**
 * Minute-by-minute (5s interval) review artifact for YouTube QA.
 */
import { existsSync, mkdirSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';

const ROOT = process.cwd();
const mp4 =
  process.argv[2] ||
  join(ROOT, 'test-recordings', 'FINAL-VIDEO-final.mp4');
const outDir = join(ROOT, 'test-recordings', 'minute-review-frames');
const reportPath = join(ROOT, 'test-recordings', 'MINUTE_REVIEW.md');

if (!existsSync(mp4)) {
  console.error(`❌ MP4 not found: ${mp4}`);
  process.exit(1);
}

const durProbe = spawnSync(
  'ffprobe',
  ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', mp4],
  { encoding: 'utf8' },
);
const durationSec = parseFloat(durProbe.stdout?.trim() || '0');
const interval = 5;

mkdirSync(outDir, { recursive: true });

const rows = [];
rows.push('# Minute-by-minute review (auto-generated)');
rows.push('');
rows.push(`**File:** \`${mp4}\``);
rows.push(`**Duration:** ${durationSec.toFixed(1)}s`);
rows.push(`**Interval:** every ${interval}s`);
rows.push('');
rows.push('| Time | Frame | Notes | Severity |');
rows.push('|------|-------|-------|----------|');

for (let t = 0; t < durationSec; t += interval) {
  const stamp = formatTs(t);
  const framePath = join(outDir, `frame-${String(Math.floor(t)).padStart(4, '0')}s.jpg`);
  const r = spawnSync(
    'ffmpeg',
    ['-y', '-ss', String(t), '-i', mp4, '-frames:v', '1', '-q:v', '3', framePath],
    { encoding: 'utf8', timeout: 30_000 },
  );
  const ok = r.status === 0 && existsSync(framePath);
  let note = 'OK — frame extracted';
  let severity = 'info';
  if (!ok) {
    note = 'Could not extract frame';
    severity = 'high';
  } else if (t < 3) {
    note = 'HOOK ZONE — must grab attention in 0–3s';
    severity = t === 0 ? 'critical' : 'high';
  } else if (t % 15 === 0) {
    note = 'Pattern interrupt checkpoint — new visual or stat?';
    severity = 'medium';
  }
  const rel = ok ? `test-recordings/minute-review-frames/${framePath.split('/').pop()}` : '—';
  rows.push(`| ${stamp} | ${rel} | ${note} | ${severity} |`);
}

rows.push('');
rows.push('## Improvement checklist');
rows.push('');
rows.push('1. **0:00–0:03** — Shock hook visible + audible immediately');
rows.push('2. **Every 1–2s** — Visual change (B-roll cut)');
rows.push('3. **Captions** — ≤4 words, huge, yellow highlight word');
rows.push('4. **End** — Subscribe + Watch Next on screen');
rows.push('5. **Upload** — Custom thumbnail + curiosity title (see SHIP_PACKAGE.json)');
rows.push('');

writeFileSync(reportPath, rows.join('\n'));
console.log(`✅ Minute review: ${reportPath}`);
console.log(`   Frames: ${outDir}/`);

function formatTs(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
