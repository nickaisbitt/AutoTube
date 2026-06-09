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
  return {
    harvestNonce: fixState.harvestNonce || 0,
    mediaOffset: fixState.mediaOffset || 0,
    excludeUrls: Array.isArray(fixState.excludedUrls) ? fixState.excludedUrls : [],
    suppressGiphy: fixState.suppressGiphy === true,
    harvestVideoFirst: fixState.harvestVideoFirst !== false,
    hookLine: fixState.hookLine?.trim() || null,
    hookOverlay: fixState.hookOverlay?.trim() || null,
  };
}

/**
 * Playwright init script payload for sessionStorage.
 * @param {object} ctx
 */
export function harvestSessionStoragePayload(ctx) {
  const payload = {
    autotube_loop_harvest_nonce: String(ctx.harvestNonce || 0),
    autotube_loop_media_offset: String(ctx.mediaOffset || 0),
    autotube_loop_exclude_urls: JSON.stringify((ctx.excludeUrls || []).slice(0, 300)),
  };
  if (ctx.suppressGiphy) {
    payload.autotube_loop_suppress_giphy = 'true';
  }
  if (ctx.harvestVideoFirst !== false) {
    payload.autotube_loop_video_first = 'true';
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
export function accumulateExcludedUrls(fixState, project) {
  const prev = new Set((fixState.excludedUrls || []).map((u) => normalizeUrlKey(u)));
  for (const m of project?.media || []) {
    const key = normalizeUrlKey(m.url, m.sourceUrl);
    if (key) prev.add(key);
  }
  fixState.excludedUrls = [...prev].slice(-400);
  return fixState;
}

/**
 * Stable dedupe key — prefer embedded source URL over bare proxy paths.
 * @param {string} url
 * @param {string} [sourceUrl]
 */
export function normalizeUrlKey(url = '', sourceUrl = '') {
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
