/**
 * Assembly-system: clip budget and dedup policy for the improvement loop.
 * Central source of truth for pipeline capacity constants shared between
 * harvest, sanitize, and assembly stages.
 */
import { effectiveCutInterval, MAX_USES_PER_URL } from './build-edit-timeline.mjs';

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
