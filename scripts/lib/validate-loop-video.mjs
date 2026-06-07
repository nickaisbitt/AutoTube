/**
 * Assert loop render output is complete before scoring.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';

const MIN_DURATION_SEC = 55;
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

  return {
    valid: true,
    durationSec,
    sizeMb: (size / 1024 / 1024).toFixed(2),
  };
}
