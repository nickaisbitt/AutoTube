#!/usr/bin/env node
/**
 * Frame-by-frame teardown + HTML gallery for AutoTube QA.
 *
 * Usage:
 *   npm run review:frames
 *   npm run review:frames -- test-recordings/full-XXX/final-video-final.mp4
 *   npm run review:frames -- path/to.mp4 --interval 0.5 --project path/to/project.json
 *   npm run review:frames -- path/to.mp4 --vision   # optional OpenRouter triage on suspicious assets
 */
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { reviewFrames } from './lib/frame-review.mjs';

const ROOT = process.cwd();
const argv = process.argv.slice(2);

let videoPath;
let projectPath;
let intervalSec = 1;
let maxDurationSec;
let outDir;
let useVision = false;

for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--interval' && argv[i + 1]) intervalSec = parseFloat(argv[++i]);
  else if (a === '--max' && argv[i + 1]) maxDurationSec = parseFloat(argv[++i]);
  else if (a === '--project' && argv[i + 1]) projectPath = argv[++i];
  else if (a === '--out' && argv[i + 1]) outDir = argv[++i];
  else if (a === '--vision') useVision = true;
  else if (!a.startsWith('-')) videoPath = a;
}

if (!videoPath) {
  const candidates = [
    join(ROOT, 'test-recordings/FINAL-VIDEO-final.mp4'),
    join(ROOT, 'test-recordings/full-1784507010021/final-video-final.mp4'),
    join(ROOT, 'docs/artifacts/FINAL-VIDEO-youtube-full.mp4'),
  ];
  videoPath = candidates.find((p) => existsSync(p));
}
if (!videoPath) {
  console.error('Usage: npm run review:frames -- <video.mp4> [--interval 1] [--project project.json] [--vision]');
  process.exit(1);
}

const openRouterKey = useVision
  ? (process.env.OPENROUTER_API_KEY || process.env.VITE_OPENROUTER_KEY || '')
  : '';

const result = await reviewFrames({
  videoPath: resolve(videoPath),
  projectPath: projectPath ? resolve(projectPath) : undefined,
  outDir: outDir ? resolve(outDir) : undefined,
  intervalSec,
  maxDurationSec,
  openRouterKey: openRouterKey || undefined,
});

console.log('✅ Frame review ready');
console.log(`   Out:      ${result.outDir}`);
console.log(`   Gallery:  ${result.gallery}`);
console.log(`   Report:   ${result.reviewMd}`);
console.log(`   Frames:   ${result.frameCount} @ ${intervalSec}s`);
console.log(`   Critical: ${result.critical} · High: ${result.high} · NSFW URL: ${result.nsfwUrlHits}`);
console.log(`   Volume stills: ${result.volumeStills} · Pool unsafe: ${result.poolUnsafe} (NSFW in pool: ${result.poolNsfw})`);
console.log('');
console.log('Open the gallery and step with ←/→ (press f for flagged-only).');
