/**
 * Keep-best: freeze a good cut instead of reharvest lottery.
 * When raw ≥ KEEP_BEST_RAW_FLOOR (or upload-ready), next iter polishes
 * overlays/pacing on the same media/timeline rather than pulling new stock.
 *
 * Strong-topical freeze: when a generate produces ≥1 strong topical video
 * asset, the project is frozen so the next iteration can reuse those assets
 * without a full reharvest.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { countAirlineStrongVideos } from './harvest-quality.mjs';
import { isAirlineTopic } from './topic-family.mjs';

/** Raw overall at/above this (no critical issues) → freeze media. */
export const KEEP_BEST_RAW_FLOOR = 7.4;

/**
 * Minimum relevance score for a non-airline video asset to count as
 * "strong topical" when deciding whether to freeze the project.
 */
export const STRONG_TOPICAL_RELEVANCE_MIN = 0.5;

/**
 * @param {object} watch — watchVideo() result
 * @returns {boolean}
 */
export function shouldKeepBest(watch) {
  if (!watch) return false;
  if (watch.brutal?.hasCriticalIssues) return false;
  if (watch.uploadReady === true) return true;
  const raw = watch.brutal?.rawOverall;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= KEEP_BEST_RAW_FLOOR) {
    return true;
  }
  return false;
}

/**
 * Count unique video assets that carry real topical visual evidence.
 *
 * For airline topics the aviation-specific strong-video check is used
 * (cabin/cockpit/oxygen-mask/runway+aircraft). For other topics a video
 * must have `relevanceScore >= STRONG_TOPICAL_RELEVANCE_MIN` (set by
 * filterAssetsByRelevance during harvest).
 *
 * @param {object} project
 * @param {string} [topic]
 * @returns {number}
 */
export function countStrongTopicalVideos(project, topic) {
  const topicText = topic || project?.topic || project?.title || '';
  const media = project?.media || [];
  const videoAssets = media.filter(
    (a) => a.type === 'video' || /\.(mp4|webm|mov)/i.test(a?.url || ''),
  );
  if (!videoAssets.length) return 0;

  if (isAirlineTopic(topicText)) {
    return countAirlineStrongVideos(videoAssets, topicText);
  }
  return videoAssets.filter(
    (a) => typeof a.relevanceScore === 'number' && a.relevanceScore >= STRONG_TOPICAL_RELEVANCE_MIN,
  ).length;
}

/**
 * Returns true when the project has ≥1 strong topical video asset and the
 * watch result does not carry critical issues. Does NOT require a score
 * floor — the intent is to preserve good media even on a draft-tier pass.
 *
 * @param {object|null} watch — watchVideo() result
 * @param {object|null} project — project object (with .media array)
 * @param {string} [topic]
 * @returns {boolean}
 */
export function shouldFreezeOnTopicalAssets(watch, project, topic) {
  if (!watch) return false;
  if (watch.brutal?.hasCriticalIssues) return false;
  if (!project || !Array.isArray(project.media) || !project.media.length) return false;
  return countStrongTopicalVideos(project, topic) >= 1;
}

/**
 * Persist frozen project for polish iterations.
 * @param {string} loopDir
 * @param {string} projectPath — source project.json
 * @param {{ rawOverall?: number, videoPath?: string, topic?: string }} meta
 * @returns {string|null} frozen path
 */
export function saveFrozenProject(loopDir, projectPath, meta = {}) {
  if (!projectPath || !existsSync(projectPath)) return null;
  mkdirSync(loopDir, { recursive: true });
  const dest = join(loopDir, 'FROZEN_BEST_PROJECT.json');
  copyFileSync(projectPath, dest);
  writeFileSync(
    join(loopDir, 'FROZEN_BEST_META.json'),
    JSON.stringify(
      {
        savedAt: new Date().toISOString(),
        rawOverall: meta.rawOverall ?? null,
        videoPath: meta.videoPath || null,
        topic: meta.topic || null,
        sourceProject: projectPath,
      },
      null,
      2,
    ),
  );
  return dest;
}

/**
 * @param {string} frozenPath
 * @returns {object|null}
 */
export function loadFrozenProject(frozenPath) {
  if (!frozenPath || !existsSync(frozenPath)) return null;
  try {
    return JSON.parse(readFileSync(frozenPath, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Copy media + editTimeline from frozen project onto the current generate project.
 * Keeps new script/narration durations; reassigns segmentIds when lengths match.
 * @param {object} project
 * @param {object} frozen
 * @returns {{ ok: boolean, mediaCount: number, timelineCount: number, orphanMediaCount?: number, orphanTimelineCount?: number, droppedOrphanMediaIds?: string[] }}
 */
export function applyFrozenMediaToProject(project, frozen) {
  if (!project || !frozen?.media?.length) {
    return { ok: false, mediaCount: 0, timelineCount: 0 };
  }
  const script = project.script || [];
  const frozenScript = frozen.script || [];
  if (!script.length || !frozenScript.length) {
    return { ok: false, mediaCount: 0, timelineCount: 0 };
  }
  const droppedOrphanMediaIds = [];
  const media = [];
  for (const [i, m] of (frozen.media || []).entries()) {
    const frozenSegIdx = frozenScript.findIndex((s) => s.id === m.segmentId);
    if (frozenSegIdx < 0) {
      droppedOrphanMediaIds.push(m.id || m.url || `frozen-${i}`);
      continue;
    }
    const segIdx = Math.min(frozenSegIdx, script.length - 1);
    const seg = script[segIdx];
    if (!seg) {
      // This branch is unreachable when script is non-empty (segIdx is always in range),
      // but guard explicitly so orphans are never silently assigned to segment 0.
      droppedOrphanMediaIds.push(m.id || m.url || `frozen-${i}`);
      continue;
    }
    media.push({
      ...m,
      segmentId: seg.id,
      id: m.id || `frozen-${i}`,
    });
  }
  if (!media.length) {
    return {
      ok: false,
      mediaCount: 0,
      timelineCount: 0,
      orphanMediaCount: droppedOrphanMediaIds.length,
      droppedOrphanMediaIds,
    };
  }
  project.media = media;
  let orphanTimelineCount = 0;
  if (Array.isArray(frozen.editTimeline) && frozen.editTimeline.length) {
    const idMap = new Map();
    for (let i = 0; i < frozenScript.length && i < script.length; i += 1) {
      idMap.set(frozenScript[i].id, script[i].id);
    }
    project.editTimeline = frozen.editTimeline
      .map((e) => {
        if (!e.segmentId) return e;
        const segmentId = idMap.get(e.segmentId);
        if (!segmentId) {
          orphanTimelineCount += 1;
          return null;
        }
        return { ...e, segmentId };
      })
      .filter(Boolean);
  }
  return {
    ok: true,
    mediaCount: media.length,
    timelineCount: (project.editTimeline || []).length,
    orphanMediaCount: droppedOrphanMediaIds.length,
    orphanTimelineCount,
    droppedOrphanMediaIds,
  };
}

/**
 * Mutate fixState into polish mode (no reharvest).
 * @param {object} s
 * @param {{ frozenProjectPath?: string, rawOverall?: number }} opts
 * @param {string[]} applied
 */
export function enterPolishMode(s, opts = {}, applied = []) {
  s.keepBestMedia = true;
  s.reHarvestMedia = false;
  s.fixStrategy = 'polish';
  s.rewriteScript = false;
  if (opts.frozenProjectPath) s.frozenProjectPath = opts.frozenProjectPath;
  s.keepBestRaw = opts.rawOverall ?? s.keepBestRaw ?? null;
  applied.push(
    `keep-best: freeze cut (raw ${opts.rawOverall ?? '?'} ≥ ${KEEP_BEST_RAW_FLOOR}) → polish overlays/pacing (no reharvest)`,
  );
  return s;
}

/**
 * Clear keep-best fields on topic change.
 * @param {object} state
 */
export function clearKeepBest(state) {
  if (!state || typeof state !== 'object') return state;
  delete state.keepBestMedia;
  delete state.frozenProjectPath;
  delete state.keepBestRaw;
  if (state.fixStrategy === 'polish') state.fixStrategy = 'reharvest';
  return state;
}
