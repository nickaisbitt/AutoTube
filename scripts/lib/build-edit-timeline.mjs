/**
 * Single source of truth for B-roll edit timelines (loop + ffmpeg assembly).
 * Always use post-TTS segment.duration when building for render.
 */
import { normalizeUrlKey } from './harvest-loop-context.mjs';
import { aHashFromAsset, isSimilarToRegistry, hammingDistance, VISUAL_DUP_MAX_DISTANCE } from './perceptual-hash.mjs';

/** Hard cap on how many times a single URL may appear across the full 60 s timeline. */
export const MAX_USES_PER_URL = 2;

/** Per-segment cap: no single URL may exceed this share of segment clips (0–100). */
export const MAX_URL_SHARE_PCT = 40;

/** Minimum seconds that must separate two uses of the same URL on the full timeline. */
export const URL_SPACING_SEC = 12;

/** Minimum seconds between visually similar clips (pHash) on the full timeline. */
export const VISUAL_SPACING_SEC = 14;

/** Hook zone duration (seconds from video start). Clips here are subject to a tighter hold cap. */
export const HOOK_ZONE_SEC = 10;

/**
 * Max clip duration (seconds) allowed within the hook zone.
 * Override via AUTOTUBE_HOOK_MAX_HOLD_SEC env var.
 */
export const HOOK_MAX_HOLD_SEC = (() => {
  const v = parseFloat(process.env.AUTOTUBE_HOOK_MAX_HOLD_SEC || '');
  return Number.isFinite(v) && v > 0 ? v : 2.0;
})();

/**
 * Minimum unique assets a segment pool must have before being supplemented
 * with cross-segment assets from the global pool.
 */
const MIN_SEGMENT_POOL = 5;

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

/**
 * Widen cuts when the unique asset pool cannot support fast pacing without obvious repeats.
 *
 * When the widened cut exceeds HOOK_MAX_HOLD_SEC, the hook zone forces shorter clips in the
 * first segment, causing it to consume more of the pool budget than expected. A segment-aware
 * correction ensures each segment stays within its share of the global pool budget.
 *
 * @param {object} project
 * @param {number} cutIntervalSec
 */
export function effectiveCutInterval(project, cutIntervalSec = 1.25) {
  const cut = cutIntervalSec ?? 1.25;
  const uniqueUrls = new Set((project.media || []).map((a) => urlKey(a)).filter(Boolean));
  const poolSize = uniqueUrls.size || 1;
  const segs = project.script || [];
  const totalDur = segs.reduce((sum, seg) => sum + (seg.duration || 0), 0) || 60;
  const targetClips = totalDur / Math.max(0.25, cut);
  const maxReusesPerAsset = MAX_USES_PER_URL;
  const maxClipsFromPool = poolSize * maxReusesPerAsset;
  if (targetClips <= maxClipsFromPool) return cut;

  const baseWidened = totalDur / maxClipsFromPool;

  // If the widened cut would trigger hook-zone shortening (baseWidened > HOOK_MAX_HOLD_SEC),
  // compute the minimum cut that keeps each hook-zone segment within its share of the pool
  // budget, so wrap-around clips don't overflow the global URL cap.
  if (baseWidened > HOOK_MAX_HOLD_SEC && segs.length > 0) {
    const numSegs = segs.length;
    const segBudget = maxClipsFromPool / numSegs;
    let minCutRequired = baseWidened;

    let cumStart = 0;
    for (const seg of segs) {
      const segDur = seg.duration || 0;
      const hookDurInSeg = Math.max(0, Math.min(HOOK_ZONE_SEC - cumStart, segDur));
      if (hookDurInSeg > 0) {
        const hookClips = Math.ceil(hookDurInSeg / HOOK_MAX_HOLD_SEC);
        const restDurInSeg = segDur - hookDurInSeg;
        const restBudget = segBudget - hookClips;
        if (restBudget > 0 && restDurInSeg > 0) {
          minCutRequired = Math.max(minCutRequired, restDurInSeg / restBudget);
        }
      }
      cumStart += segDur;
    }
    return Math.min(3.5, minCutRequired);
  }

  return Math.min(2.5, baseWidened);
}

export function buildEditTimeline(project, options = {}) {
  const cut = effectiveCutInterval(project, options.cutIntervalSec ?? 1.25);
  const reason = options.reason ?? 'heuristic placement';
  const preferVideo = options.preferVideo === true;
  const minVideosFirst = options.minVideosFirst ?? 2;
  const devServer = options.devServer || 'http://localhost:5173';
  const entries = [];
  const globalPool = orderAssetsVideoFirst(project.media || [], preferVideo ? minVideosFirst : 0);
  const globalUrlUse = new Map();
  const uniquePoolSize = new Set((project.media || []).map((a) => urlKey(a)).filter(Boolean)).size;
  const thinPool = uniquePoolSize < 18;
  const maxUsesPerUrl = thinPool ? 1 : MAX_USES_PER_URL;
  const globalVisualHashes = [];

  // Diversity-enforcement state shared across all segments.
  const globalUrlLastAbsTime = new Map(); // urlKey → last abs start time used
  const pHashRegistry = []; // hashes of all committed clips
  const pHashLastAbsTime = new Map(); // hash → last absolute start time
  const pHashCache = new Map(); // assetId/src → hash (null if failed)

  const hashForAsset = (candidate) => {
    const cid = candidate.id || candidate.url || '';
    if (!pHashCache.has(cid)) pHashCache.set(cid, aHashFromAsset(candidate, { devServer }));
    return pHashCache.get(cid) || null;
  };

  const visualAlreadyUsed = (hash) => {
    if (!hash) return false;
    return globalVisualHashes.some((h) => hammingDistance(hash, h) <= VISUAL_DUP_MAX_DISTANCE);
  };

  const checkPHash = (candidate, absTime = 0, strict = false) => {
    const hash = hashForAsset(candidate);
    if (!hash) return true;
    if (thinPool && visualAlreadyUsed(hash)) return false;
    if (isSimilarToRegistry(hash, pHashRegistry)) return false;
    const lastVisual = pHashLastAbsTime.get(hash);
    if (lastVisual !== undefined && absTime - lastVisual < VISUAL_SPACING_SEC) return false;
    if (strict || thinPool) {
      for (const [h, t] of pHashLastAbsTime) {
        if (hammingDistance(hash, h) <= VISUAL_DUP_MAX_DISTANCE && absTime - t < VISUAL_SPACING_SEC) return false;
      }
    }
    return true;
  };

  const registerPHash = (asset, absTime) => {
    const hash = hashForAsset(asset);
    if (!hash) return;
    if (!isSimilarToRegistry(hash, pHashRegistry)) pHashRegistry.push(hash);
    if (!globalVisualHashes.some((h) => hammingDistance(hash, h) <= VISUAL_DUP_MAX_DISTANCE)) {
      globalVisualHashes.push(hash);
    }
    pHashLastAbsTime.set(hash, absTime);
  };

  // Track absolute video time so hook-zone clips can be capped independently of the
  // pool-widened effective cut interval.
  let cumSegStart = 0;

  for (const seg of project.script || []) {
    let assets = uniqueAssetsByUrl((project.media || []).filter((m) => m.segmentId === seg.id));
    if (!assets.length) {
      assets = globalPool.map((m) => ({ ...m, segmentId: seg.id }));
    } else if (assets.length < MIN_SEGMENT_POOL && globalPool.length > assets.length) {
      // Thin segment pool — pull in cross-segment assets to widen variety before the
      // global-URL-use cap forces fallback cycling.
      const segKeys = new Set(assets.map(urlKey).filter(Boolean));
      const need = MIN_SEGMENT_POOL - assets.length;
      const extras = globalPool
        .filter((a) => { const k = urlKey(a); return k && !segKeys.has(k); })
        .slice(0, need)
        .map((a) => ({ ...a, segmentId: seg.id }));
      if (extras.length) assets = [...assets, ...extras];
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
    // Scale anti-repeat window with pool size so the full pool cycles before any URL
    // is allowed to repeat within a segment (floor at 8 for small pools).
    const recentCap = Math.max(8, assets.length);
    let videoSlotsUsed = 0;
    // Per-segment URL diversity state.
    const segUrlCount = new Map(); // urlKey → clip count in this segment
    const estimatedSegClips = Math.max(1, Math.ceil(duration / interval));
    const maxSegUrlUses = Math.max(1, Math.ceil(estimatedSegClips * MAX_URL_SHARE_PCT / 100));

    while (t < duration - 0.05) {
      // Clips whose absolute start falls within the hook zone are capped to HOOK_MAX_HOLD_SEC
      // regardless of the pool-widened effective cut interval, so PySceneDetect never flags
      // a single hold > 2 s in the first 10 s of the video.
      const absStart = cumSegStart + t;
      const hookInterval = absStart < HOOK_ZONE_SEC ? Math.min(interval, HOOK_MAX_HOLD_SEC) : interval;
      const end = Math.min(duration, t + hookInterval);
      const clipIndex = entries.filter((e) => e.segmentId === seg.id).length;
      const inHookZone = absStart < HOOK_ZONE_SEC;
      const poolForClip = inHookZone && clipIndex < 6
        ? rankIntroHookAssets(uniqueAssetsByUrl(globalPool.length > assets.length ? globalPool : assets))
        : assets;
      let asset = poolForClip[ai % poolForClip.length];
      let attempts = 0;
      const pickFrom = (pool) => {
        const visualStrict = inHookZone;
        // Loop 1: strict — non-adjacent, non-recent, under global cap, URL spacing,
        // per-segment share cap, and perceptual-hash dedup.
        for (let j = 0; j < pool.length; j++) {
          const candidate = pool[(ai + j) % pool.length];
          const key = urlKey(candidate);
          if (candidate.id === lastAssetId || (key && key === lastUrl)) continue;
          if (key && recentUrls.includes(key)) continue;
          if (key && (globalUrlUse.get(key) || 0) >= maxUsesPerUrl) continue;
          if (key) {
            const lastTime = globalUrlLastAbsTime.get(key);
            if (lastTime !== undefined && absStart - lastTime < URL_SPACING_SEC) continue;
          }
          if (key && (segUrlCount.get(key) || 0) >= maxSegUrlUses) continue;
          if (!checkPHash(candidate, absStart, visualStrict)) continue;
          return candidate;
        }
        // Loop 2: relax recent and per-segment cap — keep non-adjacent, URL spacing, global cap, pHash.
        for (let j = 0; j < pool.length; j++) {
          const candidate = pool[(ai + j) % pool.length];
          const key = urlKey(candidate);
          if (key && key === lastUrl) continue;
          if (key && (globalUrlUse.get(key) || 0) >= maxUsesPerUrl) continue;
          if (key) {
            const lastTime = globalUrlLastAbsTime.get(key);
            if (lastTime !== undefined && absStart - lastTime < URL_SPACING_SEC) continue;
          }
          if (!checkPHash(candidate, absStart, visualStrict)) continue;
          return candidate;
        }
        // Pool exhausted — cycle to non-adjacent URL, preferring the one used furthest back in time.
        // Never return the same URL as lastUrl; prefer any different URL over an adjacent repeat.
        let bestFallback = null;
        let oldestUseTime = Infinity;
        for (let j = 0; j < pool.length; j++) {
          const c = pool[(ai + j) % pool.length];
          const k = urlKey(c);
          if (k && k === lastUrl) continue;
          const lastTime = k ? (globalUrlLastAbsTime.get(k) ?? -1) : -1;
          if (k && lastTime >= 0 && absStart - lastTime < URL_SPACING_SEC) continue;
          if (!checkPHash(c, absStart, inHookZone)) continue;
          if (lastTime < oldestUseTime) {
            oldestUseTime = lastTime;
            bestFallback = c;
          }
        }
        if (bestFallback) return bestFallback;
        // Truly single-URL pool — prefer any asset that is not lastUrl, otherwise cycle.
        for (let j = 1; j < pool.length; j++) {
          const c = pool[(ai + j) % pool.length];
          const k = urlKey(c);
          if (k && k === lastUrl) continue;
          const lastTime = k ? (globalUrlLastAbsTime.get(k) ?? -1) : -1;
          if (k && lastTime >= 0 && absStart - lastTime < URL_SPACING_SEC) continue;
          if (!k || k !== lastUrl) return c;
        }
        // Last resort: any non-adjacent URL (spacing may still fail on tiny pools).
        for (let j = 1; j < pool.length; j++) {
          const c = pool[(ai + j) % pool.length];
          const k = urlKey(c);
          if (!k || k !== lastUrl) return c;
        }
        // Never cycle the same URL/visual on thin pools — pick least-recently-used alternate.
        if (thinPool && pool.length > 1) {
          let best = null;
          let oldest = Infinity;
          for (const c of pool) {
            const k = urlKey(c);
            if (k && k === lastUrl) continue;
            const h = hashForAsset(c);
            if (h && visualAlreadyUsed(h)) continue;
            const t = k ? (globalUrlLastAbsTime.get(k) ?? -1) : -1;
            if (t < oldest) {
              oldest = t;
              best = c;
            }
          }
          if (best) return best;
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

      // If the round-robin candidate has already hit the global URL cap, use pickFrom to
      // find a less-used asset. This prevents wrap-around from recycling capped URLs when
      // the hook-zone or other interval changes cause more clips than the pool math expected.
      {
        const candidateKey = urlKey(asset);
        if (candidateKey && (globalUrlUse.get(candidateKey) || 0) >= maxUsesPerUrl) {
          asset = pickFrom(poolForClip.length > 1 ? poolForClip : globalPool);
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
        globalUrlUse.set(key, (globalUrlUse.get(key) || 0) + 1);
        segUrlCount.set(key, (segUrlCount.get(key) || 0) + 1);
        globalUrlLastAbsTime.set(key, absStart);
      }
      registerPHash(asset, absStart);
      t = end;
      ai += 1;
    }
    cumSegStart += duration;
  }

  return repairTimelineVisualRepeats(
    repairTimelineAdjacentRepeats(entries, project),
    project,
    { thinPool, devServer },
  );
}

/**
 * Post-pass: break back-to-back clips that share the same URL.
 */
export function repairTimelineAdjacentRepeats(entries, project) {
  if (!entries?.length || !(project.media?.length)) return entries;

  const mediaById = new Map((project.media || []).map((m) => [m.id, m]));
  const pool = project.media || [];
  const entryKey = (entry) => urlKey(mediaById.get(entry?.assetId));

  for (let i = 1; i < entries.length; i += 1) {
    const prevKey = entryKey(entries[i - 1]);
    const curKey = entryKey(entries[i]);
    if (!prevKey || !curKey || prevKey !== curKey) continue;

    const nextKey = i + 1 < entries.length ? entryKey(entries[i + 1]) : null;
    const replacement = pool.find((candidate) => {
      const key = urlKey(candidate);
      if (!key || key === curKey) return false;
      if (key === prevKey) return false;
      if (nextKey && key === nextKey) return false;
      return true;
    });
    if (replacement) entries[i].assetId = replacement.id;
  }

  return entries;
}

/**
 * Post-pass: swap clip assignments when visually similar shots land within VISUAL_SPACING_SEC.
 * Catches duplicates that slip through when the asset pool is thin and pick fallbacks fire.
 */
export function repairTimelineVisualRepeats(entries, project, options = {}) {
  if (!entries?.length || !(project.media?.length)) return entries;

  const uniquePoolSize = new Set((project.media || []).map((a) => urlKey(a)).filter(Boolean)).size;
  const thinPool = options.thinPool ?? uniquePoolSize < 18;

  const mediaById = new Map((project.media || []).map((m) => [m.id, m]));
  const pool = project.media || [];
  const usedVisualHashes = [];
  const segStarts = new Map();
  let cum = 0;
  for (const seg of project.script || []) {
    segStarts.set(seg.id, cum);
    cum += seg.duration || 0;
  }

  const devServer = options.devServer || 'http://localhost:5173';
  const hashCache = new Map();
  const assetHash = (asset) => {
    if (!asset) return null;
    const cid = asset.id || asset.url || '';
    if (!hashCache.has(cid)) hashCache.set(cid, aHashFromAsset(asset, { devServer }));
    return hashCache.get(cid) || null;
  };

  const committed = [];

  const visualUsed = (hash) => {
    if (!hash) return false;
    return usedVisualHashes.some((h) => hammingDistance(hash, h) <= VISUAL_DUP_MAX_DISTANCE);
  };

  const tooClose = (hash, absStart) => {
    if (!hash) return false;
    if (thinPool && visualUsed(hash)) return true;
    for (const c of committed) {
      if (hammingDistance(hash, c.hash) <= VISUAL_DUP_MAX_DISTANCE && absStart - c.absTime < VISUAL_SPACING_SEC) {
        return true;
      }
    }
    return false;
  };

  for (const entry of entries) {
    const absStart = (segStarts.get(entry.segmentId) ?? 0) + (entry.startSec ?? 0);
    let asset = mediaById.get(entry.assetId);
    let hash = assetHash(asset);

    if (tooClose(hash, absStart)) {
      const replacement = pool.find((candidate) => {
        if (candidate.id === entry.assetId) return false;
        const key = urlKey(candidate);
        if (key && key === urlKey(asset)) return false;
        const h = assetHash(candidate);
        return h ? !tooClose(h, absStart) : true;
      });
      if (replacement) {
        entry.assetId = replacement.id;
        asset = replacement;
        hash = assetHash(replacement);
      }
    }

    if (hash) {
      committed.push({ hash, absTime: absStart });
      if (!usedVisualHashes.some((h) => hammingDistance(hash, h) <= VISUAL_DUP_MAX_DISTANCE)) {
        usedVisualHashes.push(hash);
      }
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
      devServer: options.devServer,
    });
  }
  return { rebuilt, staleCount: stale, staleRatio, clipCount: project.editTimeline.length };
}
