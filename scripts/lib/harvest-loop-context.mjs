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
    preferBrightBroll: fixState.preferBrightBroll === true,
    faceSeekBroll: fixState.faceSeekBroll === true,
  };
}

/**
 * Playwright init script payload for sessionStorage.
 * @param {object} ctx
 */
export function harvestSessionStoragePayload(ctx) {
  return {
    autotube_loop_harvest_nonce: String(ctx.harvestNonce || 0),
    autotube_loop_media_offset: String(ctx.mediaOffset || 0),
    autotube_loop_exclude_urls: JSON.stringify((ctx.excludeUrls || []).slice(0, 300)),
    autotube_loop_prefer_bright: ctx.preferBrightBroll ? 'true' : 'false',
    autotube_loop_face_seek: ctx.faceSeekBroll ? 'true' : 'false',
  };
}

/**
 * Append media URLs from a project into fixState.excludedUrls (deduped).
 * @param {object} fixState
 * @param {object} project
 */
export function accumulateExcludedUrls(fixState, project) {
  const prev = new Set((fixState.excludedUrls || []).map((u) => normalizeUrlKey(u)));
  for (const m of project?.media || []) {
    const key = normalizeUrlKey(m.url);
    if (key) prev.add(key);
  }
  fixState.excludedUrls = [...prev].slice(-400);
  return fixState;
}

function normalizeUrlKey(url = '') {
  return (url || '').split('?')[0].toLowerCase();
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
