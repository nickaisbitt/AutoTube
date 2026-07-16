#!/usr/bin/env node
/**
 * Re-run topics that failed generate in recent eval dirs.
 * Usage: node scripts/retry-eval-failures.mjs [glob-prefix] [--dirs dir1,dir2]
 */
import { readdirSync, readFileSync, statSync, mkdirSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { generateFullVideo } from './lib/generate-full-video.mjs';
import { applyEnvLocalToProcess } from './lib/railway-prod-env.mjs';
import { watchVideo } from '../powers/video-watcher/src/analyze.mjs';

const ROOT = process.cwd();
const argv = process.argv.slice(2);
const dirsArg = argv.find((a) => a.startsWith('--dirs='))?.slice(7);
const prefix = argv.find((a) => !a.startsWith('--')) || 'eval-';

applyEnvLocalToProcess();
process.env.AUTOTUBE_EVAL_COLD = '1';
process.env.AUTOTUBE_BEAT_VISION = '1';
process.env.AUTOTUBE_VISUAL_BEATS = '1';

function coldFixState() {
  return {
    renderTier: 'full',
    cutIntervalSec: 0.7,
    whisperAlign: true,
    faceSeekBroll: true,
    harvestVideoFirst: true,
    preferBrightBroll: true,
    patternInterrupts: false,
    hookSceneCuts: true,
    karaokeCaptions: true,
    minAssetsPerSegment: 8,
    visualBeats: true,
    beatVision: true,
    maxReusePerUrl: 1,
    reHarvestMedia: false,
    keepBestMedia: false,
    harvestNonce: 1,
    mediaOffset: 2,
    excludedUrls: [],
  };
}

const dirs = dirsArg
  ? dirsArg.split(',').map((d) => join(ROOT, 'test-recordings', d.trim()))
  : readdirSync(join(ROOT, 'test-recordings'))
      .filter((d) => d.startsWith(prefix))
      .map((d) => join(ROOT, 'test-recordings', d))
      .filter((p) => statSync(p).isDirectory())
      .sort();

const failedById = new Map();
for (const dir of dirs) {
  const jsonl = join(dir, 'EVAL_REPORT.jsonl');
  if (!existsSync(jsonl)) continue;
  for (const line of readFileSync(jsonl, 'utf8').trim().split('\n')) {
    const row = JSON.parse(line);
    if (!row.generateOk) failedById.set(row.topicId, { ...row, sourceDir: dir });
  }
}
const failed = [...failedById.values()];

if (!failed.length) {
  console.log('No generate failures to retry');
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = join(ROOT, 'test-recordings', `eval-retry-${stamp}`);
mkdirSync(outDir, { recursive: true });
const jsonlPath = join(outDir, 'EVAL_REPORT.jsonl');

console.log(`↻ Retrying ${failed.length} failed topic(s) → ${outDir}`);

for (const row of failed) {
  console.log(`\n========== RETRY ${row.topicId}: ${row.topic} ==========`);
  const fixState = coldFixState();
  const gen = await generateFullVideo({
    topic: row.topic,
    realHarvest: true,
    fixState,
    runId: Date.now(),
    youtubeMode: true,
    loopShort: false,
  });
  const record = {
    topicId: row.topicId,
    topic: row.topic,
    pass: 'retry-after-failure',
    at: new Date().toISOString(),
    generateOk: gen.ok === true,
    generateError: gen.ok ? null : gen.error || 'generate failed',
    durationSec: gen.durationSec ?? null,
    videoPath: gen.videoPath || gen.canonicalPath || null,
    watch: null,
  };
  if (gen.ok && record.videoPath && existsSync(record.videoPath)) {
    const topicDir = join(outDir, row.topicId);
    mkdirSync(topicDir, { recursive: true });
    copyFileSync(record.videoPath, join(topicDir, 'final-video-final.mp4'));
    record.watch = await watchVideo({
      video_path: record.videoPath,
      mode: 'brutal',
      skip_vision: false,
      render_tier: 'full',
    });
  }
  writeFileSync(jsonlPath, `${JSON.stringify(record)}\n`, { flag: 'a' });
  console.log(`→ ${row.topicId}: ok=${record.generateOk} raw=${record.watch?.brutal?.rawOverall ?? 'n/a'}`);
}

console.log(`\n📋 Retry report: ${jsonlPath}`);
