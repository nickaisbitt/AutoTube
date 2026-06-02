import { existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';

export const MIN_MP4_BYTES = 1_000_000;

/** Minimum output duration in seconds (`E2E_MIN_DURATION_SEC` or `MIN_DURATION_SEC`, default 180). */
export function getMinDurationSec(): number {
  const raw = process.env.E2E_MIN_DURATION_SEC ?? process.env.MIN_DURATION_SEC ?? '180';
  const parsed = parseFloat(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 180;
}

export function probeMediaDuration(filePath: string): number | null {
  if (!filePath || !existsSync(filePath)) return null;
  const result = spawnSync(
    'ffprobe',
    [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      filePath,
    ],
    { encoding: 'utf8', timeout: 15_000 },
  );
  if (result.status !== 0 || !result.stdout) return null;
  const parsed = parseFloat(result.stdout.trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function findLatestFinalMp4(
  recordingsDir = join(process.cwd(), 'test-recordings'),
  options: { minMtimeMs?: number; excludePaths?: string[] } = {},
): string | null {
  const { minMtimeMs = 0, excludePaths = [] } = options;
  const excluded = new Set(excludePaths.map((p) => p.replace(/\\/g, '/')));
  if (!existsSync(recordingsDir)) return null;

  const candidates = readdirSync(recordingsDir)
    .filter((name) => name.endsWith('-final.mp4'))
    .map((name) => join(recordingsDir, name))
    .filter((path) => {
      if (!existsSync(path)) return false;
      if (excluded.has(path.replace(/\\/g, '/'))) return false;
      if (minMtimeMs > 0 && statSync(path).mtimeMs < minMtimeMs) return false;
      return true;
    })
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);

  return candidates[0] ?? null;
}

export interface FinalMp4GateResult {
  path: string;
  sizeBytes: number;
  durationSec: number;
  minDurationSec: number;
}

export function verifyFinalMp4Gates(mp4Path: string | null): FinalMp4GateResult {
  const minDurationSec = getMinDurationSec();

  if (!mp4Path || !existsSync(mp4Path)) {
    throw new Error(`Missing -final.mp4 artifact (${mp4Path ?? 'none found'})`);
  }

  const sizeBytes = statSync(mp4Path).size;
  if (sizeBytes <= MIN_MP4_BYTES) {
    throw new Error(
      `MP4 too small: ${(sizeBytes / 1024).toFixed(1)} KB (expected > ${(MIN_MP4_BYTES / 1024 / 1024).toFixed(0)} MB)`,
    );
  }

  const durationSec = probeMediaDuration(mp4Path);
  if (durationSec == null) {
    throw new Error(`ffprobe could not read duration for ${mp4Path}`);
  }

  if (durationSec < minDurationSec) {
    throw new Error(
      `MP4 duration ${durationSec.toFixed(1)}s is below minimum ${minDurationSec}s (${mp4Path})`,
    );
  }

  return { path: mp4Path, sizeBytes, durationSec, minDurationSec };
}

export function listExistingFinalMp4s(recordingsDir = join(process.cwd(), 'test-recordings')): string[] {
  if (!existsSync(recordingsDir)) return [];
  return readdirSync(recordingsDir)
    .filter((name) => name.endsWith('-final.mp4'))
    .map((name) => join(recordingsDir, name))
    .filter((path) => existsSync(path));
}

export async function waitForFinalMp4(
  sinceMs: number,
  timeoutMs = 1_800_000,
  pollMs = 3_000,
  excludePaths: string[] = [],
): Promise<string> {
  const recordingsDir = join(process.cwd(), 'test-recordings');
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const path = findLatestFinalMp4(recordingsDir, { minMtimeMs: sinceMs, excludePaths });
    if (path) return path;
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  throw new Error(`Timed out after ${timeoutMs}ms waiting for -final.mp4 in test-recordings/`);
}
