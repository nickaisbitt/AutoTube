#!/usr/bin/env node
/**
 * Modal worker entry — ffmpeg assembly + overlays only (no TTS).
 * Expects MODAL_WORK_DIR with project.json, render-env.json, narration-mix.wav, assets/, word-timestamps.json
 */
import { readFileSync, existsSync, copyFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderViaFfmpegAssembly } from '../../deploy/server-render/ffmpegAssembly.mjs';
import { buildEditTimeline } from '../lib/build-edit-timeline.mjs';
import { spawnSync } from 'node:child_process';
import { validateOutput } from '../../deploy/server-render/pipelineReliability.mjs';

function probeDurationSec(videoPath) {
  const probe = spawnSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', videoPath],
    { encoding: 'utf8' },
  );
  const d = parseFloat((probe.stdout || '').trim());
  return Number.isFinite(d) ? d : 0;
}

const workDir = process.env.MODAL_WORK_DIR || '/work';
const projectPath = join(workDir, 'project.json');
const envPath = join(workDir, 'render-env.json');
const mixedAudio = ['narration-mix.m4a', 'narration-mix.wav', 'narration-mix.aac']
  .map((f) => join(workDir, f))
  .find((p) => existsSync(p));
const outputBase = join(workDir, 'final-video.mp4');

if (!existsSync(projectPath)) {
  console.error('project.json missing in', workDir);
  process.exit(1);
}

const renderEnv = existsSync(envPath) ? JSON.parse(readFileSync(envPath, 'utf8')) : {};
for (const [k, v] of Object.entries(renderEnv)) {
  if (v != null && v !== '') process.env[k] = String(v);
}
process.env.AUTOTUBE_FORCE_CPU = process.env.AUTOTUBE_FORCE_CPU || '0';
process.env.AUTOTUBE_RENDER_MODE = 'ffmpeg';
process.env.AUTOTUBE_LOOP_MODE = '1';

const project = JSON.parse(readFileSync(projectPath, 'utf8'));
const assetsDir = join(workDir, 'assets');
mkdirSync(assetsDir, { recursive: true });

for (const asset of project.media || []) {
  const localName = asset._bundleFile;
  if (!localName) continue;
  const localPath = join(assetsDir, localName);
  if (existsSync(localPath)) {
    asset.url = localPath;
    asset.sourceUrl = localPath;
    if (/\.(mp4|webm|mov)/i.test(localName)) asset.type = 'video';
  }
}

const wordTimestampCache = new Map();
const wtPath = join(workDir, 'word-timestamps.json');
if (existsSync(wtPath)) {
  const raw = JSON.parse(readFileSync(wtPath, 'utf8'));
  for (const [k, v] of Object.entries(raw)) {
    wordTimestampCache.set(Number(k), v);
  }
}

const cutInterval = parseFloat(process.env.AUTOTUBE_CUT_INTERVAL_SEC || '1.25');
project.editTimeline = buildEditTimeline(project, {
  cutIntervalSec: cutInterval,
  reason: 'modal post-tts sync',
  preferVideo: process.env.AUTOTUBE_HARVEST_VIDEO_FIRST === '1',
  minVideosFirst: process.env.AUTOTUBE_RENDER_QUALITY === 'high' ? 3 : 2,
});

console.log(`[modal-assembly] ${project.editTimeline?.length ?? 0} clips, audio ${mixedAudio ? 'yes' : 'no'}`);

const ffResult = await renderViaFfmpegAssembly(project, outputBase, {
  devServer: 'http://127.0.0.1:1',
  cutIntervalSec: cutInterval,
  mixedAudioPath: mixedAudio || null,
});

if (!ffResult.ok) {
  console.error('[modal-assembly] ffmpeg failed:', ffResult.error);
  process.exit(1);
}

const { applyFfmpegYoutubeOverlays } = await import('../../deploy/server-render/ffmpegOverlays.mjs');
applyFfmpegYoutubeOverlays(outputBase, project, wordTimestampCache);

const finalMp4 = outputBase.replace('.mp4', '-final.mp4');
if (existsSync(outputBase)) {
  copyFileSync(outputBase, finalMp4);
}

const gate = validateOutput(finalMp4, 'Modal assembly output');
const dur = probeDurationSec(finalMp4);
if (!gate.valid || dur < 10) {
  console.error('[modal-assembly] output gate:', gate.error || `invalid duration ${dur}s`);
  process.exit(1);
}

console.log('[modal-assembly] OK', finalMp4);
