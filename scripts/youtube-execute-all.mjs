#!/usr/bin/env node
/**
 * Execute full YouTube action plan: render → package → review export → verify → minute review.
 */
import { spawnSync } from 'child_process';
import { existsSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { buildPackagingSuggestions } from './lib/youtube-packaging.mjs';

const ROOT = process.cwd();

function run(cmd, args, env = {}, allowFail = false) {
  const label = `${cmd} ${args.join(' ')}`;
  console.log(`\n${'═'.repeat(60)}\n▶ ${label}\n${'═'.repeat(60)}\n`);
  const r = spawnSync(cmd, args, {
    cwd: ROOT,
    env: { ...process.env, ...env },
    stdio: 'inherit',
  });
  if (r.status !== 0 && !allowFail) {
    console.error(`\n❌ Failed: ${label} (exit ${r.status})`);
    process.exit(r.status ?? 1);
  }
  return r.status ?? 0;
}

console.log('\n🎬 YouTube Action Plan — full execution\n');

// Step 1–5: Render (YouTube profile)
run('npm', ['run', 'render:fixture:full'], {
  AUTOTUBE_YOUTUBE_MODE: '1',
  AUTOTUBE_FORCE_CPU: '1',
});

// Packaging metadata (titles/thumbnails)
const projectPath = '/tmp/autotube-project.json';
if (existsSync(projectPath)) {
  const project = JSON.parse(readFileSync(projectPath, 'utf8'));
  const pkg = buildPackagingSuggestions(project);
  const pkgPath = join(ROOT, 'test-recordings', 'SHIP_PACKAGE.json');
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
  console.log(`\n📦 Packaging: ${pkgPath}`);
  console.log(`   Title: ${pkg.recommendedTitle}`);
}

run('node', ['scripts/finalize-ship-artifacts.mjs']);

// Phase A: review-friendly export
run('node', ['scripts/export-youtube-review.mjs']);

const review90 = join(ROOT, 'docs', 'artifacts', 'FINAL-VIDEO-youtube-review.mp4');
run(
  'node',
  ['scripts/export-youtube-review.mjs', join(ROOT, 'test-recordings', 'FINAL-VIDEO-final.mp4'), review90, '90'],
);

// Phase B verification
run('npm', ['run', 'squad:gate']);
run('npm', ['run', 'test:e2e:smoke']);

// Minute-by-minute review (use review file if smaller)
const reviewInput = existsSync(review90) ? review90 : join(ROOT, 'test-recordings', 'FINAL-VIDEO-final.mp4');
run('node', ['scripts/youtube-minute-review.mjs', reviewInput], {}, true);

// GIF preview for GitHub
run(
  'ffmpeg',
  ['-y', '-i', review90, '-t', '12', '-vf', 'fps=6,scale=720:-1', join(ROOT, 'docs', 'artifacts', 'final-video-preview-v4.gif')],
  {},
  true,
);

console.log('\n═══════════════════════════════════════════════════════════');
console.log(' ✅ YOUTUBE ACTION PLAN EXECUTION COMPLETE');
console.log(' 📹 Review MP4: docs/artifacts/FINAL-VIDEO-youtube-review.mp4');
console.log(' 📋 Minute review: test-recordings/MINUTE_REVIEW.md');
console.log(' 📦 Titles/thumb: test-recordings/SHIP_PACKAGE.json');
console.log('═══════════════════════════════════════════════════════════\n');
