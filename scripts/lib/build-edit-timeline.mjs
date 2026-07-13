/**
 * Single source of truth for B-roll edit timelines (loop + ffmpeg assembly).
 * Always use post-TTS segment.duration when building for render.
 */

/**
 * @param {object} project
 * @param {{ cutIntervalSec?: number, reason?: string }} [options]
 * @returns {Array<{ segmentId: string, startSec: number, endSec: number, assetId: string, reason: string }>}
 */
function urlKey(asset) {
  return (asset?.url || '').split('?')[0] || asset?.id || '';
}

function uniqueAssetsByUrl(assets) {
  const seen = new Set();
  const out = [];
  for (const asset of assets) {
    const key = urlKey(asset);
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    out.push(asset);
  }
  return out;
}

export function buildEditTimeline(project, options = {}) {
  const cut = options.cutIntervalSec ?? 1.25;
  const reason = options.reason ?? 'heuristic placement';
  const preferVideo = options.preferVideo !== false;
  const entries = [];
  const globalPool = uniqueAssetsByUrl(project.media || []);

  for (const seg of project.script || []) {
    let assets = uniqueAssetsByUrl((project.media || []).filter((m) => m.segmentId === seg.id));
    if (!assets.length) {
      assets = globalPool.map((m) => ({ ...m, segmentId: seg.id }));
    }
    if (!assets.length) continue;

    const videos = assets.filter((a) => a.type === 'video');
    const images = assets.filter((a) => a.type !== 'video');
    const isIntro = seg.type === 'intro' || seg === (project.script || [])[0];
    // Intro = motion only when videos exist. Body = almost all video (V-V-V-I).
    const ordered = preferVideo && videos.length
      ? (() => {
          if (isIntro) return uniqueAssetsByUrl(videos);
          const out = [];
          let vi = 0;
          let ii = 0;
          const total = Math.max(assets.length, 8);
          for (let k = 0; k < total; k += 1) {
            if (k % 4 !== 3 && videos.length) {
              out.push(videos[vi % videos.length]);
              vi += 1;
            } else if (images.length) {
              out.push(images[ii % images.length]);
              ii += 1;
            } else if (videos.length) {
              out.push(videos[vi % videos.length]);
              vi += 1;
            }
          }
          return uniqueAssetsByUrl(out.length ? out : assets);
        })()
      : assets;

    const duration = seg.duration || 20;
    const interval = isIntro ? Math.min(cut, 0.9) : cut;
    let t = 0;
    let ai = 0;
    let lastAssetId = null;
    let lastUrl = null;
    while (t < duration - 0.05) {
      const end = Math.min(duration, t + interval);
      let asset = ordered[ai % ordered.length];
      let attempts = 0;
      const pickFrom = (pool) => {
        for (let j = 0; j < pool.length; j++) {
          const candidate = pool[(ai + j) % pool.length];
          const key = urlKey(candidate);
          if (candidate.id === lastAssetId || (key && key === lastUrl)) continue;
          return candidate;
        }
        return pool[ai % pool.length];
      };

      while (
        attempts < Math.max(ordered.length, globalPool.length) &&
        (asset.id === lastAssetId || (urlKey(asset) && urlKey(asset) === lastUrl))
      ) {
        asset = pickFrom(ordered.length > 1 ? ordered : globalPool);
        ai += 1;
        attempts += 1;
      }
      if (urlKey(asset) === lastUrl && globalPool.length > 1) {
        asset = pickFrom(globalPool);
      }
      entries.push({
        segmentId: seg.id,
        startSec: t,
        endSec: end,
        assetId: asset.id,
        reason,
      });
      lastAssetId = asset.id;
      lastUrl = urlKey(asset) || null;
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

/**
 * Rebuild editTimeline when sanitize/balance invalidated asset IDs.
 * @param {object} project
 * @param {{ cutIntervalSec?: number }} [options]
 */
export function validateEditTimeline(project, options = {}) {
  const mediaIds = new Set((project.media || []).map((m) => m.id));
  const timeline = project.editTimeline || [];
  let stale = 0;
  for (const entry of timeline) {
    if (!mediaIds.has(entry.assetId)) stale += 1;
  }
  const staleRatio = timeline.length ? stale / timeline.length : 1;
  const rebuilt = staleRatio > 0.1 || timeline.length === 0;
  if (rebuilt) {
    project.editTimeline = buildEditTimeline(project, {
      cutIntervalSec: options.cutIntervalSec ?? 1.25,
      reason: 'post-sanitize rebuild',
    });
  }
  return { rebuilt, staleCount: stale, staleRatio, clipCount: project.editTimeline.length };
}
