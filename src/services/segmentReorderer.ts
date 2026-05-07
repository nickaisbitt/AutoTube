/**
 * Segment Reorderer — Requirement 6 (Hook Restructure)
 *
 * Reorders VideoProject.script so the most data-rich chart segment appears
 * first, maximising viewer retention in the opening seconds.
 *
 * This module is a pure function: it never mutates the input project.
 */

import { VideoProject } from '../types';
import { CHART_KEYWORDS } from './captionUtils';

/**
 * Reorders the project's script so the segment associated with the
 * highest-scored chart asset appears at index 0 with type `'intro'`.
 *
 * Implements Requirements 6.1–6.5, 6.7, 8.3.
 *
 * Algorithm:
 *  1. Single O(n) pass over `project.media` to find the highest-scored
 *     asset whose `concept` or `alt` contains a CHART_KEYWORDS keyword.
 *  2. If no such asset exists, return the project unchanged.
 *  3. Locate the ScriptSegment whose `id` matches `bestChartAsset.segmentId`.
 *  4. If not found, or already at index 0, return the project unchanged.
 *  5. Build a new script array: matched segment first (type → 'intro'),
 *     then all other segments in their original relative order.
 *  6. Return a new VideoProject with the reordered script; media is
 *     unchanged because segmentId values still reference the correct segments.
 *
 * @param project  The source VideoProject (never mutated).
 * @returns        A new VideoProject with reordered script, or the same
 *                 reference if no reordering was needed.
 */
export function reorderForHook(project: VideoProject): VideoProject {
  // ── Step 1: O(n) pass to find the best chart asset ──────────────────────
  let bestChartAsset = project.media[0] !== undefined ? undefined : undefined;
  let bestScore = -Infinity;

  for (const asset of project.media) {
    const concept = (asset.concept ?? '').toLowerCase();
    const alt = (asset.alt ?? '').toLowerCase();

    const isChart = CHART_KEYWORDS.some(
      (kw) => concept.includes(kw.toLowerCase()) || alt.includes(kw.toLowerCase())
    );

    if (isChart) {
      const score = asset.score ?? 0;
      if (score > bestScore) {
        bestScore = score;
        bestChartAsset = asset;
      }
    }
  }

  // ── Step 2: No chart asset found → return unchanged ─────────────────────
  if (bestChartAsset === undefined) {
    return project;
  }

  // ── Step 3: Find the matching segment ───────────────────────────────────
  const segmentIndex = project.script.findIndex(
    (seg) => seg.id === bestChartAsset!.segmentId
  );

  // ── Step 4: Not found or already first → return unchanged ───────────────
  if (segmentIndex === -1 || segmentIndex === 0) {
    return project;
  }

  // ── Step 5: Build new script array (immutable) ──────────────────────────
  const matchedSegment = project.script[segmentIndex];

  const newScript = [
    // Matched segment moved to front, type set to 'intro' (Requirement 6.3)
    { ...matchedSegment, type: 'intro' as const },
    // All other segments in original relative order, types preserved (Req 6.5)
    ...project.script.filter((_, idx) => idx !== segmentIndex),
  ];

  // ── Step 6: Return new project object (media unchanged) ─────────────────
  return {
    ...project,
    script: newScript,
  };
}
