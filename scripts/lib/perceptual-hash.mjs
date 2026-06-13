/**
 * Node-side 8×8 average-hash via ffmpeg (post-harvest sanitize).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

export const VISUAL_DUP_MAX_DISTANCE = 10;
export const VISUAL_DUP_THIN_POOL_DISTANCE = 8;

const videoFrameHashCache = new Map();

/** Hamming threshold — tighter on thin pools. */
export function effectiveVisualDupDistance(thinPool = false) {
  return thinPool ? VISUAL_DUP_THIN_POOL_DISTANCE : VISUAL_DUP_MAX_DISTANCE;
}

export function isSimilarAtDistance(hash, registry, maxDistance = VISUAL_DUP_MAX_DISTANCE) {
  if (!hash) return false;
  return registry.some((h) => hammingDistance(hash, h) <= maxDistance);
}

/** Thumbnail URL patterns that are too small for reliable visual dedup. */
const TINY_THUMB_RE = /(?:[_-]\d{2,3}x\d{2,3}|w=\d{1,3}(?:[&,]|$)|h=\d{1,3}(?:[&,]|$)|\/hqdefault\.|\/mqdefault\.|\/sddefault\.)/i;

/**
 * Prefer full-resolution image URLs over tiny CDN thumbs for hashing.
 * @param {object} asset
 * @param {string} [devServer]
 * @returns {string|null}
 */
export function resolveAssetHashSource(asset, devServer = 'http://localhost:5173') {
  const candidates = [];
  const push = (u) => {
    if (!u || typeof u !== 'string') return;
    if (u.startsWith('data:') || u.startsWith('blob:')) return;
    if (/^https?:\/\//i.test(u)) {
      candidates.push(u);
      return;
    }
    if (u.startsWith('/api/') || u.startsWith('/')) {
      candidates.push(`${devServer}${u.startsWith('/') ? '' : '/'}${u}`);
    }
  };

  if (asset?.type === 'image' || /\.(jpe?g|png|webp|gif)(\?|$)/i.test(asset?.url || '')) {
    push(asset.url);
  }
  push(asset?.sourceUrl);
  const thumb = asset?.thumbnailUrl;
  if (thumb && !TINY_THUMB_RE.test(thumb)) push(thumb);
  if (!candidates.length && thumb) push(thumb);

  return candidates.find((u) => !TINY_THUMB_RE.test(u)) || candidates[0] || null;
}

/**
 * Hash a single video frame at t=1s (proxy or direct URL).
 * @param {string} videoUrl
 * @param {{ devServer?: string, workDir?: string }} [options]
 */
export function aHashFromVideoFrame(videoUrl, options = {}) {
  const devServer = options.devServer || 'http://localhost:5173';
  const src = videoUrl.startsWith('http') ? videoUrl : `${devServer}${videoUrl.startsWith('/') ? '' : '/'}${videoUrl}`;
  const cacheKey = src.split('?')[0];
  if (videoFrameHashCache.has(cacheKey)) return videoFrameHashCache.get(cacheKey);

  mkdirSync(options.workDir || join(tmpdir(), 'autotube-phash'), { recursive: true });
  const framePath = join(options.workDir || join(tmpdir(), 'autotube-phash'), `vf-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`);
  const extract = spawnSync(
    'ffmpeg',
    ['-y', '-ss', '1', '-i', src, '-frames:v', '1', '-q:v', '2', framePath],
    { encoding: 'utf8', timeout: 25_000 },
  );
  if (extract.status !== 0 || !existsSync(framePath)) return null;
  const hash = aHashFromImage(framePath, options.workDir);
  try {
    unlinkSync(framePath);
  } catch {
    /* ignore */
  }
  if (hash) videoFrameHashCache.set(cacheKey, hash);
  return hash;
}

/**
 * @param {object} asset
 * @param {{ devServer?: string, workDir?: string }} [options]
 */
export function aHashFromAsset(asset, options = {}) {
  const isVideo = asset?.type === 'video' || /\/api\/download-clip/i.test(asset?.url || '');
  if (isVideo) {
    const clipUrl = asset.url || asset.sourceUrl;
    if (clipUrl) {
      const frameHash = aHashFromVideoFrame(clipUrl, options);
      if (frameHash) return frameHash;
    }
  }
  const src = resolveAssetHashSource(asset, options.devServer);
  if (!src) return null;
  return aHashFromImage(src, options.workDir);
}

export function hammingDistance(a, b) {
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
export function isSimilarToRegistry(hash, registry, maxDistance = VISUAL_DUP_MAX_DISTANCE) {
  return isSimilarAtDistance(hash, registry, maxDistance);
}

/**
 * Dedupe media array by perceptual hash (drops visually similar assets).
 * @param {object[]} media
 * @param {{ devServer?: string, onDrop?: (item: object, reason: string) => void, maxDistance?: number }} [options]
 */
export function dedupeMediaByPHash(media, options = {}) {
  const registry = [];
  const kept = [];
  const devServer = options.devServer || 'http://localhost:5173';
  const maxDistance = options.maxDistance ?? VISUAL_DUP_MAX_DISTANCE;

  for (const asset of media) {
    const hash = aHashFromAsset(asset, { devServer });
    if (!hash) {
      kept.push(asset);
      continue;
    }
    if (hash && isSimilarAtDistance(hash, registry, maxDistance)) {
      options.onDrop?.(asset, `pHash dup (≤${maxDistance} bits)`);
      continue;
    }
    if (hash) registry.push(hash);
    kept.push(asset);
  }

  return { media: kept, hashCount: registry.length, droppedGroups: registry.length };
}
