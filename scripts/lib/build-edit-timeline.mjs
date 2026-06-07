/**
 * Single source of truth for B-roll edit timelines (loop + ffmpeg assembly).
 * Always use post-TTS segment.duration when building for render.
 */

/**
 * @param {object} project
 * @param {{ cutIntervalSec?: number, reason?: string }} [options]
 * @returns {Array<{ segmentId: string, startSec: number, endSec: number, assetId: string, reason: string }>}
 */
export function buildEditTimeline(project, options = {}) {
  const cut = options.cutIntervalSec ?? 1.25;
  const reason = options.reason ?? 'heuristic placement';
  const entries = [];

  for (const seg of project.script || []) {
    const assets = (project.media || []).filter((m) => m.segmentId === seg.id);
    if (!assets.length) {
      const pool = project.media || [];
      if (!pool.length) continue;
      for (let i = 0; i < pool.length; i++) {
        assets.push({ ...pool[i % pool.length], segmentId: seg.id });
      }
    }

    const duration = seg.duration || 20;
    const interval = seg.type === 'intro' ? Math.min(cut, 3) : cut;
    let t = 0;
    let ai = 0;
    while (t < duration - 0.05) {
      const end = Math.min(duration, t + interval);
      const asset = assets[ai % assets.length];
      entries.push({
        segmentId: seg.id,
        startSec: t,
        endSec: end,
        assetId: asset.id,
        reason,
      });
      t = end;
      ai += 1;
    }
  }

  return entries;
}

/**
 * @param {object} project
 * @param {string} segmentId
 * @returns {object[]}
 */
export function mediaForSegment(project, segmentId) {
  const pool = project.media || [];
  let segMedia = pool.filter((m) => m.segmentId === segmentId);
  if (!segMedia.length && pool.length) {
    segMedia = pool.map((a) => ({ ...a, segmentId }));
  }
  return segMedia;
}
