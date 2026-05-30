/**
 * Render Cache Module
 *
 * Caches rendered video segments by content hash.
 * Reuses unchanged segments to skip re-rendering.
 */

import { createHash } from 'crypto';
import { existsSync, readFileSync, writeFileSync, unlinkSync, readdirSync, statSync, mkdirSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(__dirname, '..', '..', '.render-cache');
const MAX_CACHE_SIZE_MB = 2048; // 2GB max cache
const CACHE_MANIFEST = join(CACHE_DIR, 'manifest.json');

function ensureCacheDir() {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true, mode: 0o700 });
  }
}

function loadManifest() {
  ensureCacheDir();
  if (existsSync(CACHE_MANIFEST)) {
    try {
      return JSON.parse(readFileSync(CACHE_MANIFEST, 'utf8'));
    } catch {
      return { entries: {}, totalSizeBytes: 0 };
    }
  }
  return { entries: {}, totalSizeBytes: 0 };
}

function saveManifest(manifest) {
  ensureCacheDir();
  writeFileSync(CACHE_MANIFEST, JSON.stringify(manifest, null, 2));
}

/**
 * Compute a content hash for a segment's render inputs.
 * Changing any input invalidates the cache.
 */
export function computeSegmentHash(segment, assets, exportSettings) {
  const hash = createHash('sha256');

  // Segment content
  hash.update(segment.id || '');
  hash.update(segment.title || '');
  hash.update(segment.narration || '');
  hash.update(String(segment.duration || 0));
  hash.update(String(segment.pacingScore || 3));
  hash.update(segment.type || 'section');
  hash.update(segment.sceneLayout || '');

  // Media assets
  for (const asset of (assets || [])) {
    hash.update(asset.id || '');
    hash.update(asset.url || '');
    hash.update(asset.type || '');
  }

  // Export settings
  hash.update(exportSettings?.resolution || '1080p');
  hash.update(exportSettings?.quality || 'medium');
  hash.update(String(exportSettings?.fps || 24));
  hash.update(exportSettings?.codec || 'h264');

  // Edit plan overrides
  hash.update(JSON.stringify(exportSettings?.trimmedSegments || {}));
  hash.update(JSON.stringify(exportSettings?.editPlan || {}));

  return hash.digest('hex');
}

/**
 * Check if a cached render exists for the given segment hash.
 * Returns the cached file path if valid, null otherwise.
 */
export function getCachedSegment(segmentHash) {
  const manifest = loadManifest();
  const entry = manifest.entries[segmentHash];

  if (!entry) return null;

  const filePath = join(CACHE_DIR, `${segmentHash}.mp4`);
  if (!existsSync(filePath)) {
    // Entry exists but file is missing — remove from manifest
    delete manifest.entries[segmentHash];
    saveManifest(manifest);
    return null;
  }

  // Check file age (max 24 hours)
  const stats = statSync(filePath);
  const ageMs = Date.now() - stats.mtimeMs;
  if (ageMs > 24 * 60 * 60 * 1000) {
    unlinkSync(filePath);
    delete manifest.entries[segmentHash];
    manifest.totalSizeBytes -= stats.size;
    saveManifest(manifest);
    return null;
  }

  return {
    path: filePath,
    size: stats.size,
    createdAt: stats.mtimeMs,
    ageHours: Math.round(ageMs / (1000 * 60 * 60) * 10) / 10,
  };
}

/**
 * Store a rendered segment in the cache.
 */
export function cacheSegment(segmentHash, filePath, segmentLabel) {
  ensureCacheDir();

  if (!existsSync(filePath)) return false;

  const stats = statSync(filePath);
  const cachePath = join(CACHE_DIR, `${segmentHash}.mp4`);

  // Evict if cache would exceed limit
  const manifest = loadManifest();
  while (manifest.totalSizeBytes + stats.size > MAX_CACHE_SIZE_MB * 1024 * 1024) {
    // Remove oldest entry
    const oldestKey = Object.entries(manifest.entries)
      .sort((a, b) => a[1].createdAt - b[1].createdAt)[0];
    if (!oldestKey) break;

    const [key] = oldestKey;
    const oldPath = join(CACHE_DIR, `${key}.mp4`);
    if (existsSync(oldPath)) {
      const oldStats = statSync(oldPath);
      unlinkSync(oldPath);
      manifest.totalSizeBytes -= oldStats.size;
    }
    delete manifest.entries[key];
  }

  // Copy to cache
  copyFileSync(filePath, cachePath);

  manifest.entries[segmentHash] = {
    label: segmentLabel,
    size: stats.size,
    createdAt: Date.now(),
  };
  manifest.totalSizeBytes += stats.size;
  saveManifest(manifest);

  return true;
}

/**
 * Get cache statistics.
 */
export function getCacheStats() {
  const manifest = loadManifest();
  return {
    entries: Object.keys(manifest.entries).length,
    totalSizeMB: Math.round(manifest.totalSizeBytes / (1024 * 1024) * 10) / 10,
    maxSizeMB: MAX_CACHE_SIZE_MB,
    segments: Object.values(manifest.entries).map(e => ({
      label: e.label,
      sizeMB: Math.round(e.size / (1024 * 1024) * 100) / 100,
      ageHours: Math.round((Date.now() - e.createdAt) / (1000 * 60 * 60) * 10) / 10,
    })),
  };
}

/**
 * Clear the entire render cache.
 */
export function clearCache() {
  ensureCacheDir();
  const files = readdirSync(CACHE_DIR);
  for (const file of files) {
    if (file === 'manifest.json') continue;
    const fp = join(CACHE_DIR, file);
    try { unlinkSync(fp); } catch {}
  }
  saveManifest({ entries: {}, totalSizeBytes: 0 });
}
