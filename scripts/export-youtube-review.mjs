#!/usr/bin/env node
/**
 * Export a review/YouTube-upload-friendly MP4 (H.264 + AAC, faststart, 30fps).
 * Fixes "parsing error" on some reviewers when source is huge or exotic encode.
 *
 * Usage:
 *   npm run export:review
 *   node scripts/export-youtube-review.mjs [input.mp4] [output.mp4] [maxSeconds]
 */
import { existsSync, statSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';

const ROOT = process.cwd();
const input = process.argv[2] || join(ROOT, 'test-recordings', 'FINAL-VIDEO-final.mp4');
const output = process.argv[3] || join(ROOT, 'docs', 'artifacts', 'FINAL-VIDEO-youtube-review.mp4');
const maxSec = process.argv[4] ? parseFloat(process.argv[4]) : 90;

if (!existsSync(input)) {
  console.error(`❌ Input not found: ${input}`);
  console.error('   Run: npm run render:fixture:full  or  npm run generate:video');
  process.exit(1);
}

const inStat = statSync(input);
console.log(`\n📦 Source: ${input} (${(inStat.size / 1024 / 1024).toFixed(2)} MB)`);
console.log(`📤 Review export → ${output} (max ${maxSec}s, H.264/AAC, faststart)\n`);

const args = [
  '-y',
  '-i', input,
  '-t', String(maxSec),
  '-map', '0:v:0',
  '-map', '0:a:0?',
  '-c:v', 'libx264',
  '-profile:v', 'high',
  '-level', '4.0',
  '-pix_fmt', 'yuv420p',
  '-r', '30',
  '-crf', '20',
  '-preset', 'medium',
  '-movflags', '+faststart',
  '-c:a', 'aac',
  '-b:a', '192k',
  '-ac', '2',
  '-ar', '48000',
  output,
];

const r = spawnSync('ffmpeg', args, { encoding: 'utf8', timeout: 600_000 });
if (r.status !== 0) {
  console.error(r.stderr?.slice(-2000) || 'ffmpeg failed');
  process.exit(r.status ?? 1);
}

const probe = spawnSync(
  'ffprobe',
  ['-v', 'error', '-show_entries', 'format=duration,size', '-of', 'default=noprint_wrappers=1', output],
  { encoding: 'utf8' },
);
console.log(probe.stdout || '');
console.log(`✅ Review file ready: ${output}\n`);
console.log('Share this URL on GitHub raw or upload to YouTube directly.\n');
