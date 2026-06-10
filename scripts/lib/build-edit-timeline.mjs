/**
 * Single source of truth for B-roll edit timelines (loop + ffmpeg assembly).
 * Always use post-TTS segment.duration when building for render.
 */
import { normalizeUrlKey } from './harvest-loop-context.mjs';

/**
 * @param {object} project
 * @param {{ cutIntervalSec?: number, reason?: string, preferVideo?: boolean, minVideosFirst?: number }} [options]
 * @returns {Array<{ segmentId: string, startSec: number, endSec: number, assetId: string, reason: string }>}
 */
function urlKey(asset) {
  const normalized = normalizeUrlKey(asset?.url, asset?.sourceUrl);
  if (normalized) return normalized;
  return asset?.id || (asset?.url || '').split('?')[0] || '';
}

function isVideoAsset(asset) {
  return asset?.type === 'video' || /\/api\/download-clip/i.test(asset?.url || '');
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

/** Prefer crime/news/action B-roll over static tourist shots in cold open. */
function rankIntroHookAssets(assets) {
  return [...assets].sort((a, b) => {
    const score = (asset) => {
      const h = `${asset?.alt || ''} ${asset?.url || ''} ${asset?.source || ''}`.toLowerCase();
      let s = 0;
      if (/police|heist|robbery|security|jewel|crown|crime|news|cctv|stolen|arrest|crowd|protest|face|people|officer/.test(h)) s += 5;
      if (/pyramid|tourist|plaza|walking|architecture|france-museum-paris|aerial|skyline/.test(h)) s -= 3;
      return s;
    };
    return score(b) - score(a);
  });
}

/** Put motion clips before stills so early cuts show real video when video-first is on. */
export function orderAssetsVideoFirst(assets, minVideosFirst = 2) {
  const unique = uniqueAssetsByUrl(assets);
  if (minVideosFirst <= 0) return unique;
  const videos = unique.filter(isVideoAsset);
  const images = unique.filter((a) => !isVideoAsset(a));
  if (!videos.length) return unique;
  return [...videos, ...images];
}

export function buildEditTimeline(project, options = {}) {
  const cut = options.cutIntervalSec ?? 1.25;
  const reason = options.reason ?? 'heuristic placement';
  const preferVideo = options.preferVideo === true;
  const minVideosFirst = options.minVideosFirst ?? 2;
  const entries = [];
  const globalPool = orderAssetsVideoFirst(project.media || [], preferVideo ? minVideosFirst : 0);

  for (const seg of project.script || []) {
    let assets = uniqueAssetsByUrl((project.media || []).filter((m) => m.segmentId === seg.id));
    if (!assets.length) {
      assets = globalPool.map((m) => ({ ...m, segmentId: seg.id }));
    }
    if (preferVideo) {
      assets = orderAssetsVideoFirst(assets, minVideosFirst);
      if (seg.type === 'intro') {
        assets = rankIntroHookAssets(assets);
      }
    }
    if (!assets.length) continue;

    const videoPool = assets.filter(isVideoAsset);
    const duration = seg.duration || 20;
    const introCap = cut <= 0.75 ? 1.0 : cut <= 1 ? 1.5 : 2.5;
    const interval = seg.type === 'intro' ? Math.min(cut, introCap) : cut;
    const segMinVideos = seg.type === 'intro' ? Math.max(minVideosFirst, 3) : minVideosFirst;
    let t = 0;
    let ai = 0;
    let lastAssetId = null;
    let lastUrl = null;
    const recentUrls = [];
    const recentCap = 4;
    let videoSlotsUsed = 0;
    const introHookPool = seg.type === 'intro' ? rankIntroHookAssets(assets).slice(0, Math.max(6, minVideosFirst + 2)) : assets;
    while (t < duration - 0.05) {
      const end = Math.min(duration, t + interval);
      const clipIndex = entries.filter((e) => e.segmentId === seg.id).length;
      const poolForClip = seg.type === 'intro' && clipIndex < 4 ? introHookPool : assets;
      let asset = poolForClip[ai % poolForClip.length];
      let attempts = 0;
      const pickFrom = (pool) => {
        for (let j = 0; j < pool.length; j++) {
          const candidate = pool[(ai + j) % pool.length];
          const key = urlKey(candidate);
          if (candidate.id === lastAssetId || (key && key === lastUrl)) continue;
          if (key && recentUrls.includes(key)) continue;
          return candidate;
        }
        for (let j = 0; j < pool.length; j++) {
          const candidate = pool[(ai + j) % pool.length];
          const key = urlKey(candidate);
          if (key && key === lastUrl) continue;
          return candidate;
        }
        return pool[ai % pool.length];
      };

      if (preferVideo && videoPool.length) {
        const wantVideo = videoSlotsUsed < segMinVideos || ai % 3 !== 2;
        if (wantVideo) {
          asset = pickFrom(videoPool);
          if (isVideoAsset(asset)) videoSlotsUsed += 1;
        }
      }

      while (
        attempts < Math.max(assets.length, globalPool.length) &&
        (asset.id === lastAssetId || (urlKey(asset) && urlKey(asset) === lastUrl))
      ) {
        asset = pickFrom(assets.length > 1 ? assets : globalPool);
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
      const key = urlKey(asset) || null;
      lastUrl = key;
      if (key) {
        recentUrls.push(key);
        if (recentUrls.length > recentCap) recentUrls.shift();
      }
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
 * @param {{ cutIntervalSec?: number, preferVideo?: boolean }} [options]
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
      preferVideo: options.preferVideo === true,
      minVideosFirst: options.minVideosFirst ?? 2,
    });
  }
  return { rebuilt, staleCount: stale, staleRatio, clipCount: project.editTimeline.length };
}
