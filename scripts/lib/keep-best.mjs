/**
 * Keep-best: freeze a good cut instead of reharvest lottery.
 * When raw ≥ KEEP_BEST_RAW_FLOOR (or upload-ready), next iter polishes
 * overlays/pacing on the same media/timeline rather than pulling new stock.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';

/** Raw overall at/above this (no critical issues) → freeze media. */
export const KEEP_BEST_RAW_FLOOR = 7.4;

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
    const seg = script[segIdx] || script[0];
    if (!seg) {
      droppedOrphanMediaIds.push(m.id || m.url || `frozen-${i}`);
      continue;
    }
    media.push({
      ...m,
      segmentId: seg?.id || m.segmentId,
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
