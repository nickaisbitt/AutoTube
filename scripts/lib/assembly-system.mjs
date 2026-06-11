/**
 * Assembly-system: clip budget, dedup policy, and diversity metrics for the improvement loop.
 * Central source of truth for pipeline capacity constants shared between
 * harvest, sanitize, and assembly stages.
 */
import { effectiveCutInterval, MAX_USES_PER_URL, MAX_URL_SHARE_PCT, URL_SPACING_SEC } from './build-edit-timeline.mjs';
import { normalizeUrlKey } from './harvest-loop-context.mjs';

export { MAX_URL_SHARE_PCT, URL_SPACING_SEC };

/** Hard cap on browser minAssetsPerSegment — raising above this starves harvest before top-up. */
export const LOOP_MAX_MIN_ASSETS_PER_SEGMENT = 8;

/** Maximum escalating top-up rescue passes before declaring a thin pool abort. */
export const TOP_UP_MAX_PASSES = 3;

/**
 * Compute the clip budget for the assembly timeline.
 * Returns the minimum unique URL count the assembled timeline needs to avoid
 * repeat-montage (same URL appearing > MAX_USES_PER_URL times).
 *
 * Formula: max(segFloor, ceil(totalDuration / effectiveCut / MAX_USES_PER_URL))
 *
 * @param {object} project
 * @param {number} [cutIntervalSec]
 * @returns {{ requiredUniqueUrls: number, cut: number, totalDuration: number }}
 */
export function computeClipBudget(project, cutIntervalSec = 1.25) {
  const segs = project.script || [];
  const cut = effectiveCutInterval(project, cutIntervalSec);
  const totalDuration = segs.reduce((sum, s) => sum + (s.duration || 0), 0) || 60;
  const targetClips = Math.ceil(totalDuration / Math.max(0.25, cut));
  // Per-segment floor: each segment should have at least half the max-assets quota
  const segFloor = Math.ceil(segs.length * (LOOP_MAX_MIN_ASSETS_PER_SEGMENT / 2));
  const required = Math.max(segFloor, Math.ceil(targetClips / MAX_USES_PER_URL));
  return { requiredUniqueUrls: required, cut, totalDuration };
}

/**
 * Returns true when the global URL dedup pass should run immediately before top-up.
 * When the pool is already thin relative to the clip budget, deferring the
 * cross-segment dedup prevents an already-marginal pool from shrinking further
 * before top-up has a chance to fill it.
 *
 * @param {number} poolSize  current unique URL count (after phash dedup, pre-url-dedup)
 * @param {number} required  requiredUniqueUrls from computeClipBudget
 */
export function shouldUseGlobalUrlDedup(poolSize, required) {
  // Dedup immediately when pool has ≥1.5× headroom over budget.
  // Below that threshold, defer until after top-up.
  return poolSize >= required * 1.5;
}

/**
 * Resolve the canonical URL key for an asset, matching the logic in build-edit-timeline.mjs.
 * @param {object} asset
 * @returns {string}
 */
function assetUrlKey(asset) {
  if (!asset) return '';
  const normalized = normalizeUrlKey(asset.url, asset.sourceUrl);
  if (normalized) return normalized;
  return asset.id || (asset.url || '').split('?')[0] || '';
}

/**
 * Compute diversity metrics from a built edit timeline.
 *
 * @param {Array<{segmentId: string, startSec: number, endSec: number, assetId: string}>} timeline
 * @param {object[]} media  full project.media array
 * @param {object[]} [script]  project.script array for computing cumulative segment start times
 * @returns {{ uniqueUrlsUsed: number, maxUrlSharePct: number, adjacentRepeatCount: number, requiredUniqueUrls: number, spacingViolations: number }}
 */
export function computeTimelineDiversityMetrics(timeline, media, script = []) {
  if (!timeline?.length) {
    return { uniqueUrlsUsed: 0, maxUrlSharePct: 0, adjacentRepeatCount: 0, requiredUniqueUrls: 0, spacingViolations: 0 };
  }

  const mediaById = new Map((media || []).map((m) => [m.id, m]));

  // Build cumulative segment start times from script (fall back to 0 for unknown segments).
  const segStartTimes = new Map();
  let cumStart = 0;
  for (const seg of (script || [])) {
    segStartTimes.set(seg.id, cumStart);
    cumStart += seg.duration || 0;
  }

  // Augment each entry with its absolute start time and resolved URL key.
  const entries = timeline.map((e) => {
    const asset = mediaById.get(e.assetId);
    const key = asset ? assetUrlKey(asset) : (e.assetId || '');
    const segStart = segStartTimes.get(e.segmentId) ?? 0;
    return { key, absStart: segStart + (e.startSec ?? 0), endSec: e.endSec ?? 0, startSec: e.startSec ?? 0 };
  }).sort((a, b) => a.absStart - b.absStart);

  // Unique URLs used.
  const uniqueUrls = new Set(entries.map((e) => e.key).filter(Boolean));
  const uniqueUrlsUsed = uniqueUrls.size;

  // Maximum URL share across all clips.
  const urlCount = new Map();
  for (const e of entries) {
    if (e.key) urlCount.set(e.key, (urlCount.get(e.key) || 0) + 1);
  }
  const maxUrlCount = urlCount.size > 0 ? Math.max(...urlCount.values()) : 0;
  const maxUrlSharePct = entries.length > 0 ? Math.round((maxUrlCount / entries.length) * 100) : 0;

  // Adjacent repeats (same URL on consecutive clips in temporal order).
  let adjacentRepeatCount = 0;
  for (let i = 1; i < entries.length; i++) {
    if (entries[i].key && entries[i].key === entries[i - 1].key) adjacentRepeatCount += 1;
  }

  // Required unique URLs: one fresh URL every URL_SPACING_SEC seconds of total timeline.
  const lastEntry = entries[entries.length - 1];
  const totalDuration = lastEntry
    ? lastEntry.absStart + ((lastEntry.endSec ?? 0) - (lastEntry.startSec ?? 0))
    : 0;
  const requiredUniqueUrls = Math.max(3, Math.ceil(totalDuration / URL_SPACING_SEC));

  // Spacing violations: same URL appearing within URL_SPACING_SEC of its previous appearance.
  const urlLastAbsTime = new Map();
  let spacingViolations = 0;
  for (const e of entries) {
    if (!e.key) continue;
    const prevTime = urlLastAbsTime.get(e.key);
    if (prevTime !== undefined && e.absStart - prevTime < URL_SPACING_SEC) spacingViolations += 1;
    urlLastAbsTime.set(e.key, e.absStart);
  }

  return { uniqueUrlsUsed, maxUrlSharePct, adjacentRepeatCount, requiredUniqueUrls, spacingViolations };
}

/**
 * Gate check — passes when the timeline meets diversity requirements.
 *
 * @param {{ uniqueUrlsUsed: number, maxUrlSharePct: number, adjacentRepeatCount: number, requiredUniqueUrls: number, spacingViolations: number }} metrics
 * @returns {{ pass: boolean, reason?: string }}
 */
export function diversityProxyGate(metrics) {
  if (!metrics) return { pass: false, reason: 'no diversity metrics' };

  if (metrics.maxUrlSharePct > MAX_URL_SHARE_PCT) {
    return { pass: false, reason: `maxUrlSharePct ${metrics.maxUrlSharePct}% > ${MAX_URL_SHARE_PCT}% cap` };
  }
  if (metrics.adjacentRepeatCount > 0) {
    return { pass: false, reason: `${metrics.adjacentRepeatCount} adjacent same-URL clip(s)` };
  }
  if (metrics.uniqueUrlsUsed < metrics.requiredUniqueUrls) {
    return { pass: false, reason: `${metrics.uniqueUrlsUsed} unique URLs < required ${metrics.requiredUniqueUrls}` };
  }
  if (metrics.spacingViolations > 0) {
    return { pass: false, reason: `${metrics.spacingViolations} URL spacing violation(s) (< ${URL_SPACING_SEC}s gap)` };
  }
  return { pass: true };
}
