/**
 * Node-side 8×8 average-hash via ffmpeg (post-harvest sanitize).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

export const VISUAL_DUP_MAX_DISTANCE = 10;

function hamming(a, b) {
  if (!a || !b || a.length !== b.length) return 64;
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d += 1;
  return d;
}

/**
 * @param {string} imagePathOrUrl — local path or http URL
 * @param {string} [workDir]
 */
export function aHashFromImage(imagePathOrUrl, workDir = join(tmpdir(), 'autotube-phash')) {
  mkdirSync(workDir, { recursive: true });
  const rawPath = join(workDir, `ph-${Date.now()}-${Math.random().toString(36).slice(2)}.raw`);
  const r = spawnSync(
    'ffmpeg',
    ['-y', '-i', imagePathOrUrl, '-vf', 'scale=8:8,format=gray', '-f', 'rawvideo', '-pix_fmt', 'gray', rawPath],
    { encoding: 'utf8', timeout: 20_000 },
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

/**
 * @param {string|null} hash
 * @param {string[]} registry
 */
export function isSimilarToRegistry(hash, registry) {
  if (!hash) return false;
  return registry.some((h) => hamming(hash, h) <= VISUAL_DUP_MAX_DISTANCE);
}

/**
 * Dedupe media array by perceptual hash (drops visually similar assets).
 * @param {object[]} media
 * @param {{ devServer?: string, onDrop?: (item: object, reason: string) => void }} [options]
 */
export function dedupeMediaByPHash(media, options = {}) {
  const registry = [];
  const kept = [];
  const devServer = options.devServer || 'http://localhost:5173';

  for (const asset of media) {
    const thumb = asset.thumbnailUrl || (asset.type === 'image' ? asset.url : null);
    if (!thumb) {
      kept.push(asset);
      continue;
    }

    const src = thumb.startsWith('http')
      ? thumb
      : thumb.startsWith('/api/') || thumb.startsWith('/')
        ? `${devServer}${thumb.startsWith('/') ? '' : '/'}${thumb}`
        : thumb;
    const hash = aHashFromImage(src);
    if (hash && isSimilarToRegistry(hash, registry)) {
      options.onDrop?.(asset, `pHash dup (≤${VISUAL_DUP_MAX_DISTANCE} bits)`);
      continue;
    }
    if (hash) registry.push(hash);
    kept.push(asset);
  }

  return { media: kept, hashCount: registry.length };
}
