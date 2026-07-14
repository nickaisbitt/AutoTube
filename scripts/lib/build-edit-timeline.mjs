/**
 * Single source of truth for B-roll edit timelines (loop + ffmpeg assembly).
 * Always use post-TTS segment.duration when building for render.
 */
import { scoreAssetRelevance, isOffBrandVisual, isGenericStockJunk } from './harvest-quality.mjs';

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
      // Borrow from global pool but prefer face/CTA motion over random intro leftovers
      assets = uniqueAssetsByUrl(
        [...globalPool]
          .sort((a, b) => {
            const score = (x) => {
              const blob = `${x.query || ''} ${x.alt || ''}`.toLowerCase();
              if (/puppet|beetle|insect|cartoon|minecraft/i.test(blob)) return -5;
              if (/face|person|worried|hospital|records?|laptop|verify/i.test(blob)) return 2;
              return x.type === 'video' ? 1 : 0;
            };
            return score(b) - score(a);
          })
          .map((m) => ({ ...m, segmentId: seg.id })),
      );
    }
    if (!assets.length) continue;

    const videos = assets.filter((a) => a.type === 'video');
    const images = assets.filter((a) => a.type !== 'video');
    const script = project.script || [];
    const isIntro = seg.type === 'intro' || seg === script[0];
    const isOutro = seg.type === 'outro' || seg === script[script.length - 1];
    const topicBlob = `${project.topic || ''} ${seg.narration || ''} ${seg.title || ''}`;
    const scoreAsset = (a) => {
      const blob = `${a.query || ''} ${a.alt || ''} ${a.url || ''}`.toLowerCase();
      if (isOffBrandVisual(blob, topicBlob)) return -8;
      if (isGenericStockJunk(blob, topicBlob)) return -6;
      if (/architectural model|architecture model|scale model|conference room|skyline|corporate office|business district/i.test(blob)) return -5;
      if (/microphone|podcast|recording studio|asmr|sequin|fashion runway|back of head|from behind|puppet|beetle|insect|cartoon|minecraft/i.test(blob)) return -3;
      const preferBright = process.env.AUTOTUBE_PREFER_BRIGHT_BROLL === '1';
      if (preferBright && /\b(night|dark|silhouette|low.?light|underexposed|muddy|dimly|shadowy|overexposed|blown.?out|washed.?out)\b/i.test(blob)) {
        return -4;
      }
      // Intro + outro: topic relevance first so office/arch models lose to care/CCTV clips
      if (isIntro || isOutro) {
        const rel = scoreAssetRelevance(a, seg, project.topic || '');
        let score = rel < 0.15 ? -4 : Math.round(rel * 5);
        if (/nursing|elderly|care\s*home|cctv|camera|caregiver|surveillance|wheelchair/i.test(blob)) score += 3;
        if (/face|person|people|couple|worried|shocked|reaction|family|close.?up/i.test(blob)) score += 1;
        if (isOutro && /checklist|subscribe|relieved|direct.?camera|verify|call/i.test(blob)) score += 2;
        if (preferBright && /\b(daylight|sunny|bright|well.?lit|window light)\b/i.test(blob)) score += 2;
        return score;
      }
      if (/nursing|elderly|care\s*home|cctv|camera|caregiver|surveillance/i.test(blob)) return 3;
      if (/face|person|people|couple|worried|shocked|reaction|tenant|family|close.?up/i.test(blob)) return 2;
      return 0;
    };
    // Intro/outro = motion only when videos exist. Body = almost all video (V-V-V-I).
    const ordered = preferVideo && videos.length
      ? (() => {
          if (isIntro || isOutro) {
            const ranked = [...videos].sort((a, b) => scoreAsset(b) - scoreAsset(a));
            let usable = uniqueAssetsByUrl(ranked.filter((a) => scoreAsset(a) >= 0));
            if (!usable.length) usable = uniqueAssetsByUrl(ranked.slice(0, 1));
            // Avoid single-asset intro holds: borrow more topic-relevant motion from the global pool
            if (usable.length < 2 && globalPool.length) {
              const extras = uniqueAssetsByUrl(
                [...globalPool]
                  .filter((a) => a.type === 'video' && !usable.some((u) => u.id === a.id || urlKey(u) === urlKey(a)))
                  .map((a) => ({ ...a, segmentId: seg.id }))
                  .sort((a, b) => scoreAsset(b) - scoreAsset(a))
                  .filter((a) => scoreAsset(a) >= 0),
              );
              usable = uniqueAssetsByUrl([...usable, ...extras]).slice(0, 6);
            }
            return usable.length ? usable : uniqueAssetsByUrl(ranked.slice(0, 1));
          }
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
        // Intro/outro: stay in ordered (topic-locked) — never pull beetle/still from global pool
        asset = pickFrom(isIntro || isOutro || ordered.length > 1 ? ordered : globalPool);
        ai += 1;
        attempts += 1;
      }
      if (!isIntro && !isOutro && urlKey(asset) === lastUrl && globalPool.length > 1) {
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
