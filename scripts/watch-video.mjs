#!/usr/bin/env node
/**
 * CLI: watch and analyze an MP4 (same engine as Video Watcher MCP).
 *
 * Usage:
 *   npm run watch:video
 *   npm run watch:video -- docs/artifacts/FINAL-VIDEO-youtube-full.mp4
 *   npm run watch:video -- path/to.mp4 --interval 3 --max 90
 */
import { watchVideo } from '../powers/video-watcher/src/analyze.mjs';

const argv = process.argv.slice(2);
let videoPath;
let mode = 'quick';
let intervalSec;
let maxDurationSec;
let skipVision = false;

for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--full') mode = 'full';
  else if (a === '--quick') mode = 'quick';
  else if (a === '--interval' && argv[i + 1]) intervalSec = parseFloat(argv[++i]);
  else if (a === '--max' && argv[i + 1]) maxDurationSec = parseFloat(argv[++i]);
  else if (a === '--skip-vision') skipVision = true;
  else if (!a.startsWith('-')) videoPath = a;
}

const result = await watchVideo({
  video_path: videoPath,
  mode,
  interval_sec: intervalSec,
  max_duration_sec: maxDurationSec,
  skip_vision: skipVision,
});

console.log(result.reportText);
console.log(`\n📄 Full report: ${result.reportPath}`);
if (result.contactSheet) console.log(`📊 Contact sheet: ${result.contactSheet}`);
