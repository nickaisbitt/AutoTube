/**
 * Loop harvest diversity: sessionStorage wiring + URL exclusion from prior runs.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIVERSITY_TOKENS = ['news', 'documentary', 'archive', 'footage', 'investigation', 'report', 'leaked', 'official'];

/**
 * @param {object} fixState
 * @returns {{ harvestNonce: number, mediaOffset: number, excludeUrls: string[] }}
 */
export function harvestContextFromFixState(fixState = {}) {
  const visionRejected = Array.isArray(fixState.visionRejectedUrls) ? fixState.visionRejectedUrls : [];
  const lifestyleExcluded = Array.isArray(fixState.excludedUrls) ? fixState.excludedUrls : [];
  return {
    harvestNonce: fixState.harvestNonce || 0,
    mediaOffset: fixState.mediaOffset || 0,
    excludeUrls: [...new Set([...lifestyleExcluded, ...visionRejected])],
    suppressGiphy: fixState.suppressGiphy === true,
    harvestVideoFirst: fixState.harvestVideoFirst !== false,
    minVideosPerSegment: Math.max(2, fixState.minVideosPerSegment || 2),
    hookLine: fixState.hookLine?.trim() || null,
    hookOverlay: fixState.hookOverlay?.trim() || null,
  };
}

/**
 * Playwright init script payload for sessionStorage.
 * @param {object} ctx
 */
export function harvestSessionStoragePayload(ctx) {
  // Cap the offset sent to the browser. Requesting page 5+ of results reliably
  // returns empty sets for most search APIs, which causes empty-segment aborts.
  const safeOffset = Math.min(ctx.mediaOffset || 0, 4);
  // Cap nonce at 3 — diversity tokens beyond "take 3" produce nonsense queries
  // like "museum heist investigation take 6" that return zero results.
  const safeNonce = Math.min(ctx.harvestNonce || 0, 3);
  const payload = {
    autotube_loop_harvest_nonce: String(safeNonce),
    autotube_loop_media_offset: String(safeOffset),
    autotube_loop_exclude_urls: JSON.stringify((ctx.excludeUrls || []).slice(0, 300)),
  };
  if (ctx.suppressGiphy) {
    payload.autotube_loop_suppress_giphy = 'true';
  }
  if (ctx.harvestVideoFirst !== false) {
    payload.autotube_loop_video_first = 'true';
  }
  if (ctx.minVideosPerSegment && ctx.minVideosPerSegment > 0) {
    payload.autotube_loop_min_videos = String(ctx.minVideosPerSegment);
  }
  if (ctx.hookLine) {
    payload.autotube_loop_hook_line = ctx.hookLine;
  }
  if (ctx.hookOverlay) {
    payload.autotube_loop_hook_overlay = ctx.hookOverlay;
  }
  return payload;
}

/**
 * Append media URLs from a project into fixState.excludedUrls (deduped).
 * @param {object} fixState
 * @param {object} project
 */
/**
 * Append vision-rejected URLs (separate from lifestyle excludedUrls).
 * @param {object} fixState
 * @param {string[]} urls
 */
export function accumulateVisionRejectedUrls(fixState, urls = []) {
  const prev = new Set(
    (fixState.visionRejectedUrls || [])
      .map((u) => normalizeUrlKey(u))
      .filter((key) => key && !isOverBroadExcludeUrl(key)),
  );
  for (const u of urls) {
    const key = normalizeUrlKey(u);
    if (key && !isOverBroadExcludeUrl(key)) prev.add(key);
  }
  fixState.visionRejectedUrls = [...prev].slice(-200);
  return fixState;
}

export function accumulateExcludedUrls(fixState, project) {
  const prev = new Set(
    (fixState.excludedUrls || [])
      .map((u) => normalizeUrlKey(u))
      .filter((key) => key && !isOverBroadExcludeUrl(key)),
  );
  for (const m of project?.media || []) {
    if (isEditorialHarvestKeep(m)) continue;
    const key = normalizeUrlKey(m.url, m.sourceUrl);
    if (key && !isOverBroadExcludeUrl(key)) prev.add(key);
  }
  fixState.excludedUrls = [...prev].slice(-400);
  return fixState;
}

/** Curated/editorial B-roll must stay in the harvest pool across loop retries. */
function isEditorialHarvestKeep(asset) {
  const src = `${asset?.source || ''}`.toLowerCase();
  const hay = `${asset?.url || ''} ${asset?.sourceUrl || ''}`.toLowerCase();
  if (src === 'curated-topic-pool' || src === 'crime-fallback-stock') return true;
  if (/upload\.wikimedia\.org|images\.unsplash\.com\/photo-/.test(hay)) return true;
  if (/\/news\/|bbc\.co\.uk|nytimes\.com|reuters\.com|apnews\.com|abcnews\.go\.com|cbsnews|npr\.org|theguardian\.com|globalnews\.ca|inquirer\.net/.test(hay)) return true;
  return false;
}

/**
 * On reharvest, prune accumulated excludedUrls to at most 30 confirmed lifestyle/spam-only entries.
 * Releases specific video/news/stock URLs back into the harvest pool to prevent browser harvest
 * starvation from over-accumulated exclusions across many loop iterations.
 *
 * Keeps: ytimg thumbnails, strategink webinars, pexels lifestyle page slug URLs,
 * and known "how-to" lifestyle guide domains.
 * Releases: raw pexels video-file URLs, vimeo player URLs, editorial news images (gettyimages etc.),
 * freepik stock images, and any other legitimate sources that were excluded from prior runs.
 *
 * @param {string[]} excludedUrls
 * @returns {string[]}
 */
export function pruneExcludedUrlsForReharvest(excludedUrls = []) {
  const LIFESTYLE_PATTERNS = [
    /strategink\.com/i,
    /ytimg\.com/i,
    // Pexels page URLs with descriptive slugs (e.g. /video/ring-light-12433102) — not raw video-files/ID paths
    /pexels\.com\/video\/[a-z][a-z-]+-\d/i,
    /buffer\.com\/resources\//i,
    /onestream\.live\//i,
    /routenote\.com\/blog\//i,
    /logojoy\.com/i,
    /tiktokpng\.com/i,
    /sndcdn\.com\/artworks/i,
  ];
  const lifestyle = (excludedUrls || []).filter((u) =>
    LIFESTYLE_PATTERNS.some((p) => p.test(u))
  );
  return lifestyle.slice(-30);
}

/** Drop provider-wide patterns that starve harvest (e.g. bare youtube.com/watch). */
export function sanitizeExcludedUrls(urls = []) {
  const out = [];
  const seen = new Set();
  for (const u of urls) {
    if (!u || isOverBroadExcludeUrl(u)) continue;
    const key = normalizeUrlKey(u) || (u || '').split('?')[0].toLowerCase();
    if (!key || isOverBroadExcludeUrl(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

/**
 * Stable dedupe key — prefer embedded source URL over bare proxy paths.
 * @param {string} url
 * @param {string} [sourceUrl]
 */
/** Bare host paths that would block entire providers if stored as excludes. */
export function isOverBroadExcludeUrl(url = '') {
  const raw = (url || '').trim();
  if (/[?&]v=[\w-]{4,}/i.test(raw) || /\/watch\/[\w-]{4,}/i.test(raw)) return false;
  const bare = raw.split('?')[0].toLowerCase().replace(/\/$/, '');
  return (
    bare === 'https://www.youtube.com/watch'
    || bare === 'http://www.youtube.com/watch'
    || bare === 'https://youtube.com/watch'
    || bare.endsWith('/watch')
  );
}

function youtubeWatchKey(url = '') {
  const raw = (url || '').trim();
  const m = raw.match(/[?&]v=([\w-]{4,})/i);
  if (m && /youtube\.com\/watch/i.test(raw)) {
    return `https://www.youtube.com/watch?v=${m[1].toLowerCase()}`;
  }
  return '';
}

export function normalizeUrlKey(url = '', sourceUrl = '') {
  const yt = youtubeWatchKey(url) || youtubeWatchKey(sourceUrl);
  if (yt) return yt;
  const embedded = extractEmbeddedSourceUrl(url);
  if (embedded) return embedded.split('?')[0].toLowerCase();
  const src = (sourceUrl || '').trim();
  if (src && /^https?:\/\//i.test(src)) return src.split('?')[0].toLowerCase();
  const bare = (url || '').split('?')[0].toLowerCase();
  if (bare.includes('/api/download-clip') && !embedded) return '';
  return bare;
}

function extractEmbeddedSourceUrl(url = '') {
  const raw = url || '';
  const match = raw.match(/[?&]url=([^&]+)/i);
  if (!match) return '';
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

/**
 * Diversify search query for loop re-harvest iterations.
 * @param {string} query
 * @param {{ mediaOffset?: number, harvestNonce?: number }} ctx
 */
export function diversifyHarvestQuery(query, ctx = {}) {
  const offset = ctx.mediaOffset || 0;
  const nonce = ctx.harvestNonce || 0;
  if (offset === 0 && nonce === 0) return query;
  const token = DIVERSITY_TOKENS[offset % DIVERSITY_TOKENS.length];
  const variant = nonce > 0 ? ` take ${nonce}` : '';
  return `${query} ${token}${variant}`.trim();
}

/**
 * Load URLs from last loop project.json if present.
 * @param {string} root
 */
export function loadLastProjectUrls(root) {
  const path = join(root, 'test-recordings', 'last-project.json');
  if (!existsSync(path)) return [];
  try {
    const project = JSON.parse(readFileSync(path, 'utf8'));
    return (project.media || []).map((m) => m.url).filter(Boolean);
  } catch {
    return [];
  }
}
