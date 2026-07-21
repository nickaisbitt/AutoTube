/**
 * Assert loop render output is complete before scoring.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, statSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const MIN_DURATION_SEC = 45;
const MIN_BYTES = 5 * 1024 * 1024;

/**
 * @param {string} videoPath
 * @returns {{ valid: boolean, durationSec?: number, sizeMb?: string, error?: string }}
 */
export function validateLoopVideo(videoPath) {
  if (!videoPath || !existsSync(videoPath)) {
    return { valid: false, error: 'video path missing or not found' };
  }

  const size = statSync(videoPath).size;
  if (size < MIN_BYTES) {
    return { valid: false, error: `file too small (${(size / 1024 / 1024).toFixed(2)} MB < 5 MB)` };
  }

  const probe = spawnSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', videoPath],
    { encoding: 'utf8', timeout: 30_000 },
  );
  const durationSec = probe.stdout ? parseFloat(probe.stdout.trim()) : NaN;
  if (!Number.isFinite(durationSec) || durationSec < MIN_DURATION_SEC) {
    return {
      valid: false,
      error: `duration ${durationSec || 0}s < ${MIN_DURATION_SEC}s (truncated/corrupt render?)`,
    };
  }

  const manifestPath = join(dirname(videoPath), 'ffmpeg-assembly', 'render-manifest.json');
  if (existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      if ((manifest.tpadSec ?? 0) > 2) {
        return {
          valid: false,
          error: `render used ${manifest.tpadSec}s video freeze-pad (A/V sync bug)`,
        };
      }
      const avDelta = Math.abs((manifest.videoSec ?? durationSec) - (manifest.muxDurationSec ?? durationSec));
      if (avDelta > 1) {
        return {
          valid: false,
          error: `A/V duration mismatch: video ${manifest.videoSec}s vs mux ${manifest.muxDurationSec}s`,
        };
      }
    } catch {
      /* manifest optional */
    }
  }

  return {
    valid: true,
    durationSec,
    sizeMb: (size / 1024 / 1024).toFixed(2),
  };
}
