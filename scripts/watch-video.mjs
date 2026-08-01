#!/usr/bin/env node
/**
 * CLI: watch and analyze an MP4 (same engine as Video Watcher MCP).
 *
 * Usage:
 *   npm run watch:video
 *   npm run watch:video -- docs/artifacts/FINAL-VIDEO-youtube-full.mp4
 *   npm run watch:video -- path/to.mp4 --interval 3 --max 90
 *   npm run watch:video -- path/to.mp4 --min-score 7
 *
 * Exit code enforces DoD honesty by default: 0 only when the video is
 * upload-ready, or when --min-score N is given and the RAW brutal score ≥ N
 * (with no critical issues). Otherwise exits 1.
 */
import { watchVideo } from '../powers/video-watcher/src/analyze.mjs';
import { scoreForTargetGate } from '../powers/video-watcher/src/score-honesty.mjs';

const argv = process.argv.slice(2);
let videoPath;
let mode = 'quick';
let intervalSec;
let maxDurationSec;
let skipVision = false;
let minScore;

for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--full') mode = 'full';
  else if (a === '--quick') mode = 'quick';
  else if (a === '--interval' && argv[i + 1]) intervalSec = parseFloat(argv[++i]);
  else if (a === '--max' && argv[i + 1]) maxDurationSec = parseFloat(argv[++i]);
  else if (a === '--min-score' && argv[i + 1]) minScore = parseFloat(argv[++i]);
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

const gateScore = scoreForTargetGate(result.brutal, minScore);
const minScoreMet =
  typeof minScore === 'number' &&
  Number.isFinite(minScore) &&
  typeof gateScore === 'number' &&
  gateScore >= minScore &&
  result.brutal?.hasCriticalIssues !== true;

if (result.uploadReady === true) {
  console.log('\n✅ GATE PASS — upload-ready');
  process.exit(0);
}
if (minScoreMet) {
  console.log(`\n✅ GATE PASS — raw brutal ${gateScore}/10 ≥ --min-score ${minScore} (not upload-ready)`);
  process.exit(0);
}

const reason =
  skipVision
    ? 'vision skipped — upload-ready cannot be verified'
    : result.brutal == null || result.brutal?.success === false
      ? `brutal review failed (${result.brutal?.error || 'no review'})`
      : typeof minScore === 'number' && Number.isFinite(minScore)
        ? `raw brutal ${gateScore ?? '—'}/10 below --min-score ${minScore}${
            result.brutal?.hasCriticalIssues === true ? ' + critical issues' : ''
          }`
        : 'not upload-ready (pass --min-score N to gate on raw score instead)';
console.error(`\n❌ GATE FAIL — ${reason}`);
process.exit(1);
