/**
 * Detect repeated visuals via average-hash similarity (tolerates Ken Burns / slight motion).
 */
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { basename, join } from 'node:path';
import { spawnSync } from 'node:child_process';

function aHashBits(imagePath, tmpDir) {
  const rawPath = join(tmpDir, `ah-${basename(imagePath)}.raw`);
  const r = spawnSync(
    'ffmpeg',
    ['-y', '-i', imagePath, '-vf', 'scale=8:8,format=gray', '-f', 'rawvideo', '-pix_fmt', 'gray', rawPath],
    { encoding: 'utf8', timeout: 15_000 },
  );
  if (r.status !== 0 || !existsSync(rawPath)) return null;
  const buf = readFileSync(rawPath);
  try {
    unlinkSync(rawPath);
  } catch {
    /* ignore */
  }
  if (buf.length < 64) return null;
  let sum = 0;
  for (let i = 0; i < 64; i++) sum += buf[i];
  const avg = sum / 64;
  let bits = '';
  for (let i = 0; i < 64; i++) bits += buf[i] >= avg ? '1' : '0';
  return bits;
}

function hamming(a, b) {
  if (!a || !b || a.length !== b.length) return 64;
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d += 1;
  return d;
}

const SIMILAR_THRESHOLD = 8; // bits different (of 64) = same shot

/**
 * @param {Array<{ path: string, timestamp: string, timestampSec: number }>} frames
 * @param {string} tmpDir
 */
export function detectVisualRepetition(frames, tmpDir) {
  const withHash = frames.map((f) => ({
    ...f,
    aHash: aHashBits(f.path, tmpDir),
  }));

  const runs = [];
  let i = 0;
  while (i < withHash.length) {
    const base = withHash[i].aHash;
    if (!base) {
      i += 1;
      continue;
    }
    let j = i + 1;
    while (j < withHash.length && hamming(base, withHash[j].aHash) <= SIMILAR_THRESHOLD) j += 1;
    const count = j - i;
    if (count >= 2) {
      const start = withHash[i];
      const end = withHash[j - 1];
      const gap = frames[1] ? Math.abs(frames[1].timestampSec - frames[0].timestampSec) : 3;
      runs.push({
        start: start.timestamp,
        end: end.timestamp,
        startSec: start.timestampSec,
        frameCount: count,
        approxHoldSec: Math.max(end.timestampSec - start.timestampSec + gap, count * gap),
        samplePath: start.path,
      });
    }
    i = j;
  }

  const longest = runs.reduce((a, b) => ((b?.approxHoldSec ?? 0) > (a?.approxHoldSec ?? 0) ? b : a), null);

  let adjacentDup = 0;
  for (let k = 1; k < withHash.length; k++) {
    if (withHash[k].aHash && hamming(withHash[k].aHash, withHash[k - 1].aHash) <= SIMILAR_THRESHOLD) {
      adjacentDup += 1;
    }
  }
  const repeatPct = frames.length > 1 ? Math.round((adjacentDup / (frames.length - 1)) * 100) : 0;

  return {
    runs,
    repeatPct,
    longestRun: longest,
    duplicateRunCount: runs.length,
  };
}
