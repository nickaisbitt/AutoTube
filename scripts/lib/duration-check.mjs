#!/usr/bin/env node
/**
 * A2 / R7 criterion: final MP4 duration must track narration script length (±10%).
 */
import { spawnSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';

/** End-screen padding mirrored from server-render.mjs (non-shorts). */
export const END_SCREEN_SECONDS = 4;
export const SHORTS_END_SCREEN_SECONDS = 2;
/** Cold open mirrored from server-render.mjs (non-shorts). */
export const COLD_OPEN_SECONDS = 2.5;
export const DURATION_TOLERANCE = 0.1;

/**
 * Parse measured narration duration from server-render stdout (A2 / TTS path).
 * @param {string} [renderLog]
 */
export function parseMeasuredNarrationSec(renderLog) {
  if (!renderLog) return null;
  const m = renderLog.match(/TTS narration measured \(([\d.]+)s content\)/i);
  if (!m) return null;
  const parsed = parseFloat(m[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/**
 * @param {string} filePath
 * @returns {number|null}
 */
export function probeMediaDuration(filePath) {
  if (!filePath || !existsSync(filePath)) return null;
  const result = spawnSync(
    'ffprobe',
    [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath,
    ],
    { encoding: 'utf8', timeout: 15_000 },
  );
  if (result.status !== 0 || !result.stdout) return null;
  const parsed = parseFloat(result.stdout.trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Estimate spoken duration from narration word count (~150 wpm, edge-tts +10% rate).
 * @param {{ narration?: string, duration?: number }} seg
 */
export function estimateSegmentSpeechSec(seg) {
  const words = (seg.narration || '').split(/\s+/).filter(Boolean).length;
  const fromWords = words > 0 ? (words / 165) * 60 : 0;
  const fromPlanner = typeof seg.duration === 'number' && seg.duration > 0 ? seg.duration : 0;
  return Math.max(fromWords, fromPlanner);
}

/**
 * Expected render duration from script segment durations + end screen.
 * When narration text is present, uses word-count estimate (TTS tracks speech, not planner durations).
 * @param {Array<{duration?: number, narration?: string}>} script
 * @param {{ isShorts?: boolean }} [options]
 */
export function expectedRenderDuration(script, options = {}) {
  if (!Array.isArray(script) || script.length === 0) return 0;
  const isShorts = options.isShorts === true;
  const measuredNarration = options.measuredNarrationSec;
  if (typeof measuredNarration === 'number' && measuredNarration > 0) {
    const coldOpen = isShorts ? 0 : COLD_OPEN_SECONDS;
    const endScreen = isShorts ? SHORTS_END_SCREEN_SECONDS : END_SCREEN_SECONDS;
    return measuredNarration + coldOpen + endScreen;
  }
  const hasNarrationText = script.some((seg) => (seg.narration || '').trim().length > 0);
  const segmentSec = script.reduce((sum, seg) => {
    const d = hasNarrationText ? estimateSegmentSpeechSec(seg) : (
      typeof seg.duration === 'number' && seg.duration > 0 ? seg.duration : 0
    );
    return sum + d;
  }, 0);
  const coldOpen = isShorts ? 0 : COLD_OPEN_SECONDS;
  const endScreen = isShorts ? SHORTS_END_SCREEN_SECONDS : END_SCREEN_SECONDS;
  return segmentSec + coldOpen + endScreen;
}

/**
 * @param {number} actualSec
 * @param {number} expectedSec
 * @param {number} [tolerance]
 */
export function durationWithinTolerance(actualSec, expectedSec, tolerance = DURATION_TOLERANCE) {
  if (!Number.isFinite(actualSec) || !Number.isFinite(expectedSec) || expectedSec <= 0) {
    return { ok: false, ratio: null, deltaSec: null, tolerance };
  }
  const deltaSec = actualSec - expectedSec;
  const ratio = actualSec / expectedSec;
  const ok = Math.abs(deltaSec) <= expectedSec * tolerance;
  return { ok, ratio, deltaSec, tolerance };
}

/**
 * @param {string} mp4Path
 * @param {object} project
 * @param {{ tolerance?: number }} [options]
 */
export function verifyOutputDuration(mp4Path, project, options = {}) {
  const tolerance = options.tolerance ?? DURATION_TOLERANCE;
  const isShorts = project?.exportSettings?.format === 'shorts';
  const measuredNarration = parseMeasuredNarrationSec(options.renderLog ?? '');
  const expectedSec = expectedRenderDuration(project?.script ?? [], {
    isShorts,
    measuredNarrationSec: measuredNarration ?? undefined,
  });
  const actualSec = probeMediaDuration(mp4Path);
  const check = durationWithinTolerance(actualSec ?? NaN, expectedSec, tolerance);

  return {
    mp4Path,
    actualSec,
    expectedSec,
    ...check,
    message: check.ok
      ? `Duration OK: ${actualSec?.toFixed(1)}s vs expected ${expectedSec.toFixed(1)}s (±${tolerance * 100}%)`
      : `Duration FAIL: ${actualSec?.toFixed(1) ?? 'unknown'}s vs expected ${expectedSec.toFixed(1)}s (±${tolerance * 100}%, ratio=${check.ratio?.toFixed(2) ?? 'n/a'})`,
  };
}

/**
 * Load project JSON from path.
 * @param {string} projectPath
 */
export function loadProject(projectPath) {
  return JSON.parse(readFileSync(projectPath, 'utf8'));
}
