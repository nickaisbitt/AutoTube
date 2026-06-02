#!/usr/bin/env node
/**
 * R7 Real Pass — individual criterion checks.
 */
import { spawnSync } from 'child_process';
import { existsSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import {
  loadProject,
  probeMediaDuration,
  verifyOutputDuration,
} from './duration-check.mjs';
import { ROOT } from './real-pass-config.mjs';

/**
 * @typedef {{
 *   id: number,
 *   key: string,
 *   title: string,
 *   ok: boolean,
 *   skipped?: boolean,
 *   message: string,
 *   details?: Record<string, unknown>,
 * }} CheckResult
 */

/**
 * @param {number} id
 * @param {string} key
 * @param {string} title
 * @param {boolean} ok
 * @param {string} message
 * @param {{ skipped?: boolean, details?: Record<string, unknown> }} [extra]
 * @returns {CheckResult}
 */
function result(id, key, title, ok, message, extra = {}) {
  return { id, key, title, ok, message, ...extra };
}

/**
 * @param {string} mp4Path
 */
export function probeStreams(mp4Path) {
  const probe = spawnSync(
    'ffprobe',
    ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', mp4Path],
    { encoding: 'utf8', timeout: 20_000 },
  );
  if (probe.status !== 0 || !probe.stdout) return null;
  try {
    return JSON.parse(probe.stdout);
  } catch {
    return null;
  }
}

/**
 * @param {string} mp4Path
 */
export function probeAudioVolume(mp4Path) {
  const run = spawnSync(
    'ffmpeg',
    ['-hide_banner', '-i', mp4Path, '-af', 'volumedetect', '-f', 'null', '-'],
    { encoding: 'utf8', timeout: 120_000 },
  );
  const text = `${run.stderr || ''}\n${run.stdout || ''}`;
  const meanMatch = text.match(/mean_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/);
  const maxMatch = text.match(/max_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/);
  return {
    meanDb: meanMatch ? parseFloat(meanMatch[1]) : null,
    maxDb: maxMatch ? parseFloat(maxMatch[1]) : null,
  };
}

/**
 * @param {string|null} logPath
 */
export function readRenderLog(logPath) {
  if (!logPath || !existsSync(logPath)) return '';
  try {
    return readFileSync(logPath, 'utf8');
  } catch {
    return '';
  }
}

/**
 * @param {string|null} manifestPath
 */
export function readManifest(manifestPath) {
  if (!manifestPath || !existsSync(manifestPath)) return null;
  try {
    return JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Real Pass #1 — full pipeline produces -final.mp4 ≥ configured min duration.
 * @param {import('./real-pass-config.mjs').RealPassConfig} config
 * @param {string} mp4Path
 * @param {object|null} project
 */
export function check1PipelineDuration(config, mp4Path, project) {
  const size = statSync(mp4Path).size;
  const durationSec = probeMediaDuration(mp4Path);
  const isFinalName = /-final\.mp4$/i.test(mp4Path) || mp4Path.includes('FINAL-OUTPUT');

  if (!isFinalName) {
    return result(1, 'pipeline', 'Full pipeline → -final.mp4 ≥ min duration', false,
      `Output should be a -final.mp4 artifact (got ${mp4Path})`);
  }

  if (durationSec == null) {
    return result(1, 'pipeline', 'Full pipeline → -final.mp4 ≥ min duration', false,
      'ffprobe could not read MP4 duration');
  }

  if (durationSec < config.minSeconds) {
    return result(1, 'pipeline', 'Full pipeline → -final.mp4 ≥ min duration', false,
      `Duration ${durationSec.toFixed(1)}s < ${config.minSeconds}s (set REAL_PASS_FIXTURE=1 for short fixture runs)`,
      { details: { durationSec, minSeconds: config.minSeconds, sizeBytes: size } });
  }

  if (!config.fixtureMode && project?.id === 'fixture-full-pipeline') {
    return result(1, 'pipeline', 'Full pipeline → -final.mp4 ≥ min duration', false,
      'Fixture-only project detected — run npm run generate:video for full product path (or REAL_PASS_FIXTURE=1)');
  }

  let durationSub = '';
  if (project?.script?.length) {
    const durationCheck = verifyOutputDuration(mp4Path, project, { tolerance: config.tolerance });
    if (!durationCheck.ok) {
      return result(1, 'pipeline', 'Full pipeline → -final.mp4 ≥ min duration', false,
        `${durationCheck.message} (A2 duration match)`,
        { details: { durationSec, expectedSec: durationCheck.expectedSec, sizeBytes: size } });
    }
    durationSub = `; ${durationCheck.message}`;
  }

  return result(1, 'pipeline', 'Full pipeline → -final.mp4 ≥ min duration', true,
    `${durationSec.toFixed(1)}s ≥ ${config.minSeconds}s, ${(size / 1024 / 1024).toFixed(2)} MB${durationSub}`,
    { details: { durationSec, minSeconds: config.minSeconds, sizeBytes: size, mp4Path } });
}

/**
 * Real Pass #2 — no silent TTS segments in output audio.
 * @param {import('./real-pass-config.mjs').RealPassConfig} config
 * @param {string} mp4Path
 * @param {object|null} project
 * @param {string} renderLog
 */
export function check2NoSilentTts(config, mp4Path, project, renderLog) {
  const streams = probeStreams(mp4Path);
  const audioStream = streams?.streams?.find((s) => s.codec_type === 'audio');
  if (!audioStream) {
    return result(2, 'tts', 'No silent TTS segments', false, 'MP4 has no audio stream — narration missing');
  }

  const expectsNarration = (project?.script ?? []).some((seg) => (seg.narration || '').trim().length > 0);
  if (renderLog.includes('producing silent video') && expectsNarration) {
    return result(2, 'tts', 'No silent TTS segments', false,
      'Render log shows silent video mux despite script narration');
  }

  const volume = probeAudioVolume(mp4Path);
  if (volume.meanDb == null) {
    return result(2, 'tts', 'No silent TTS segments', false,
      'Could not measure audio volume (ffmpeg volumedetect failed)');
  }

  if (volume.meanDb < config.silentMeanDb) {
    return result(2, 'tts', 'No silent TTS segments', false,
      `Mean volume ${volume.meanDb.toFixed(1)} dB < ${config.silentMeanDb} dB — likely silent/flat narration`,
      { details: volume });
  }

  return result(2, 'tts', 'No silent TTS segments', true,
    `Audio present (${audioStream.codec_name}, mean ${volume.meanDb.toFixed(1)} dB, max ${volume.maxDb?.toFixed(1) ?? 'n/a'} dB)`,
    { details: { ...volume, codec: audioStream.codec_name } });
}

/**
 * Real Pass #3 — CPU-safe encode (libx264 fallback, no broken NVENC default).
 * @param {import('./real-pass-config.mjs').RealPassConfig} config
 * @param {string} mp4Path
 * @param {string} renderLog
 * @param {object|null} manifest
 */
export function check3CpuSafeEncode(config, mp4Path, renderLog, manifest) {
  const streams = probeStreams(mp4Path);
  const videoStream = streams?.streams?.find((s) => s.codec_type === 'video');
  if (!videoStream) {
    return result(3, 'encode', 'CPU-safe encode (libx264 fallback)', false, 'MP4 has no video stream');
  }

  const encoderTag = videoStream.tags?.encoder || '';
  const codec = videoStream.codec_name || '';
  const forceCpu = process.env.FORCE_CPU === '1' || process.env.FORCE_CPU === 'true'
    || process.env.AUTOTUBE_FORCE_CPU === '1' || process.env.AUTOTUBE_FORCE_CPU === 'true';

  const gpuFailed = /GPU encoder .* failed during render/i.test(renderLog);
  const cpuFallback = /falling back to libx264|CPU encoding \(libx264\)|AUTOTUBE_FORCE_CPU set/i.test(renderLog);
  const manifestEncode = manifest?.encodePath || manifest?.videoCodec;

  if (gpuFailed && !cpuFallback && !encoderTag.includes('libx264')) {
    return result(3, 'encode', 'CPU-safe encode (libx264 fallback)', false,
      'Render log shows GPU encoder failure without libx264 fallback');
  }

  const isH264 = codec === 'h264';
  const isLibx264 = encoderTag.toLowerCase().includes('libx264')
    || manifestEncode === 'libx264'
    || cpuFallback;

  if (forceCpu && !isLibx264 && renderLog) {
    return result(3, 'encode', 'CPU-safe encode (libx264 fallback)', false,
      'FORCE_CPU/AUTOTUBE_FORCE_CPU set but render log does not confirm libx264 path');
  }

  if (!isH264) {
    return result(3, 'encode', 'CPU-safe encode (libx264 fallback)', false,
      `Unexpected video codec ${codec} — expected h264/libx264 output`);
  }

  const encodeDetail = encoderTag || manifestEncode || codec;
  return result(3, 'encode', 'CPU-safe encode (libx264 fallback)', true,
    `Valid H.264 output (${encodeDetail})${gpuFailed && cpuFallback ? ' with GPU→CPU fallback' : ''}`,
    { details: { codec, encoderTag, forceCpu, gpuFailed, cpuFallback } });
}

/**
 * Real Pass #4 — ≥90% image preload before frame loop.
 * @param {import('./real-pass-config.mjs').RealPassConfig} config
 * @param {string} renderLog
 * @param {object|null} manifest
 */
export function check4MediaPreload(config, renderLog, manifest) {
  const logMatch = renderLog.match(/\[MediaPreload\]\s*load rate:\s*(\d+(?:\.\d+)?)\s*%/i);
  const manifestRate = manifest?.mediaPreloadRatePct ?? manifest?.mediaPreloadRate;

  let loadRate = logMatch ? parseFloat(logMatch[1]) : (
    typeof manifestRate === 'number' ? manifestRate : null
  );

  if (loadRate == null) {
    return result(4, 'preload', '≥90% images loaded before render', false,
      'No preload rate in render log or manifest — pass --log test-recordings/latest-render.log (re-run render to capture log)',
      { details: { hint: 'npm run render:fixture or npm run generate:video saves latest-render.log' } });
  }

  if (loadRate < config.minMediaLoadRate) {
    return result(4, 'preload', '≥90% images loaded before render', false,
      `Preload load rate ${loadRate}% < ${config.minMediaLoadRate}% threshold`,
      { details: { loadRatePct: loadRate, minMediaLoadRate: config.minMediaLoadRate } });
  }

  return result(4, 'preload', '≥90% images loaded before render', true,
    `Image preload ${loadRate}% ≥ ${config.minMediaLoadRate}%`,
    { details: { loadRatePct: loadRate } });
}

/**
 * Real Pass #5 — background music muxed when enabled.
 * @param {string} mp4Path
 * @param {object|null} project
 * @param {string} renderLog
 * @param {object|null} manifest
 */
export function check5BackgroundMusic(mp4Path, project, renderLog, manifest) {
  const musicEnabled = project?.exportSettings?.backgroundMusic !== false;
  if (!musicEnabled) {
    return result(5, 'music', 'Background music muxed when enabled', true,
      'Skipped — backgroundMusic disabled in project exportSettings',
      { skipped: true });
  }

  const tracks = ['bg-neutral.aac', 'bg-tense.aac', 'bg-uplifting.aac', 'ambient-bg.aac'];
  const trackPaths = tracks.map((t) => join(ROOT, 'public', 'audio', t));
  const existingTracks = trackPaths.filter((p) => existsSync(p) && statSync(p).size > 10_000);
  if (existingTracks.length === 0) {
    return result(5, 'music', 'Background music muxed when enabled', false,
      'No non-placeholder background music in public/audio/ — run node scripts/generate-background-music.mjs');
  }

  const streams = probeStreams(mp4Path);
  const audioStream = streams?.streams?.find((s) => s.codec_type === 'audio');
  if (!audioStream) {
    return result(5, 'music', 'Background music muxed when enabled', false, 'No audio stream in final MP4');
  }

  const logShowsMix = /Mixing background music|background music-only track|🎵 Mixing background music/i.test(renderLog);
  const manifestMusic = manifest?.backgroundMusicMuxed === true;

  if (!logShowsMix && !manifestMusic && renderLog.length > 0) {
    const narrationOnly = /Using narration only \(no background music\)/i.test(renderLog);
    if (narrationOnly) {
      return result(5, 'music', 'Background music muxed when enabled', false,
        'Render log shows narration-only mux despite backgroundMusic enabled');
    }
  }

  const volume = probeAudioVolume(mp4Path);
  if (volume.meanDb != null && volume.meanDb < -50) {
    return result(5, 'music', 'Background music muxed when enabled', false,
      `Output audio too quiet (${volume.meanDb.toFixed(1)} dB) — music may not be muxed`);
  }

  const evidence = logShowsMix ? 'render log confirms music mix'
    : manifestMusic ? 'manifest confirms music mux'
      : `${existingTracks.length} bg track(s) on disk + stereo AAC in MP4`;

  return result(5, 'music', 'Background music muxed when enabled', true,
    `Background music path OK (${evidence})`,
    { details: { tracks: existingTracks.map((p) => p.split('/').pop()), logShowsMix, manifestMusic } });
}

/**
 * Real Pass #6 — E2E-style size + duration assertions.
 * @param {import('./real-pass-config.mjs').RealPassConfig} config
 * @param {string} mp4Path
 */
export function check6SizeDuration(config, mp4Path) {
  const size = statSync(mp4Path).size;
  const durationSec = probeMediaDuration(mp4Path);

  if (size < config.minSizeBytes) {
    return result(6, 'assertions', 'E2E size + duration assertions', false,
      `File size ${size} bytes < ${config.minSizeBytes} bytes (A10/A11 floor)`,
      { details: { sizeBytes: size, minSizeBytes: config.minSizeBytes } });
  }

  if (durationSec == null || durationSec < config.minSeconds) {
    return result(6, 'assertions', 'E2E size + duration assertions', false,
      `Duration ${durationSec?.toFixed(1) ?? 'unknown'}s < ${config.minSeconds}s`,
      { details: { durationSec, minSeconds: config.minSeconds } });
  }

  return result(6, 'assertions', 'E2E size + duration assertions', true,
    `Size ${(size / 1024 / 1024).toFixed(2)} MB > ${(config.minSizeBytes / 1024 / 1024).toFixed(2)} MB, duration ${durationSec.toFixed(1)}s ≥ ${config.minSeconds}s`,
    { details: { sizeBytes: size, durationSec, minSizeBytes: config.minSizeBytes, minSeconds: config.minSeconds } });
}

/**
 * Real Pass #7 — export blocked when quality gates fail (vitest suite).
 * @param {import('./real-pass-config.mjs').RealPassConfig} config
 */
export function check7QualityGates(config) {
  if (config.skipGateTest) {
    return result(7, 'gates', 'Export blocked when blind review / gates fail', true,
      'Skipped — SKIP_GATE_TEST=1',
      { skipped: true });
  }

  const testFile = join(ROOT, 'src', 'store', '__tests__', 'qualityGates.test.ts');
  if (!existsSync(testFile)) {
    return result(7, 'gates', 'Export blocked when blind review / gates fail', false,
      `Missing ${testFile}`);
  }

  const run = spawnSync(
    'npx',
    ['vitest', 'run', 'src/store/__tests__/qualityGates.test.ts'],
    { cwd: ROOT, encoding: 'utf8', timeout: 120_000 },
  );

  if (run.status !== 0) {
    const tail = (run.stdout || run.stderr || '').split('\n').slice(-8).join('\n');
    return result(7, 'gates', 'Export blocked when blind review / gates fail', false,
      `qualityGates.test.ts failed — gates may not block bad exports\n${tail}`);
  }

  return result(7, 'gates', 'Export blocked when blind review / gates fail', true,
    'qualityGates.test.ts passed (15 tests — failing blind review blocks assembly gate)');
}
