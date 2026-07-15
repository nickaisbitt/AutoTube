/**
 * Single source of truth for B-roll edit timelines (loop + ffmpeg assembly).
 * Always use post-TTS segment.duration when building for render.
 * When project.visualBeatSheet is present, prefer assets that match the
 * active beat for each time window (narration-aligned semantic placement).
 */
import { scoreAssetRelevance, isOffBrandVisual, isGenericStockJunk } from './harvest-quality.mjs';
import { isHousingTopic } from './topic-family.mjs';

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

function tokens(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3);
}

/** Heuristic overlap between asset metadata and a beat subject/excerpt. */
export function scoreAssetAgainstBeat(asset, beat) {
  if (!beat) return 0;
  const blob = `${asset?.alt || ''} ${asset?.query || ''} ${asset?.source || ''} ${asset?.url || ''}`.toLowerCase();
  for (const avoid of beat.mustAvoid || []) {
    if (avoid && blob.includes(String(avoid).toLowerCase())) return -8;
  }
  const subject = tokens(beat.searchableSubject || '');
  const excerpt = tokens(beat.narrationExcerpt || '').slice(0, 10);
  let hits = 0;
  for (const t of subject) {
    if (blob.includes(t)) hits += 1;
  }
  let excerptHits = 0;
  for (const t of excerpt) {
    if (blob.includes(t)) excerptHits += 1;
  }
  if (/stock photo|b-roll footage|generic corporate/.test(blob) && hits === 0) return -4;
  return hits * 2 + excerptHits;
}

/**
 * Pick the beat active for a local time within a segment (evenly spaced).
 * @param {object[]} beats
 * @param {number} localSec
 * @param {number} duration
 */
export function beatAtSegmentTime(beats, localSec, duration) {
  if (!beats?.length) return null;
  if (beats.length === 1 || duration <= 0) return beats[0];
  const idx = Math.min(
    beats.length - 1,
    Math.max(0, Math.floor((localSec / duration) * beats.length)),
  );
  return beats[idx];
}

export function buildEditTimeline(project, options = {}) {
  let cut = options.cutIntervalSec ?? 1.25;
  const reason = options.reason ?? 'heuristic placement';
  const preferVideo = options.preferVideo !== false;
  const entries = [];
  const globalPool = uniqueAssetsByUrl(project.media || []);
  const urlUseCount = new Map();
  const maxReusePerUrl = options.maxReusePerUrl ?? 1;
  const uniqueVideos = uniqueAssetsByUrl((project.media || []).filter((m) => m.type === 'video'));
  const totalDur = (project.script || []).reduce((sum, seg) => sum + (Number(seg.duration) || 0), 0);
  if (uniqueVideos.length > 0 && totalDur > 0 && maxReusePerUrl > 0) {
    const maxUniqueSlots = uniqueVideos.length * maxReusePerUrl;
    const impliedCut = totalDur / maxUniqueSlots;
    if (impliedCut > cut) {
      cut = Math.min(impliedCut, 3.5);
    }
  }
  const topicIsHousing = isHousingTopic(project.topic || '');
  const beatSheet = project.visualBeatSheet;
  const beatsBySeg = new Map();
  for (const b of beatSheet?.beats || []) {
    const list = beatsBySeg.get(b.segmentId) || [];
    list.push(b);
    beatsBySeg.set(b.segmentId, list);
  }

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
    const isIntro =
      seg.type === 'intro'
      || (seg === script[0] && seg.type !== 'body' && seg.type !== 'outro' && seg.type !== 'section');
    const isOutro =
      seg.type === 'outro'
      || (seg === script[script.length - 1] && !['body', 'intro', 'section'].includes(seg.type));
    const topicBlob = `${project.topic || ''} ${seg.narration || ''} ${seg.title || ''}`;
    const segBeats = beatsBySeg.get(seg.id) || [];
    const scoreAsset = (a, activeBeat = null) => {
      const blob = `${a.query || ''} ${a.alt || ''} ${a.url || ''}`.toLowerCase();
      if (isOffBrandVisual(blob, topicBlob)) return -8;
      if (isGenericStockJunk(blob, topicBlob)) return -6;
      if (/architectural model|architecture model|scale model|conference room|skyline|corporate office|business district/i.test(blob)) return -5;
      if (topicIsHousing && /moving boxes|packing boxes|cardboard boxes|boxes hallway/i.test(blob)) return -2;
      if (/microphone|podcast|recording studio|asmr|sequin|fashion runway|back of head|from behind|puppet|beetle|insect|cartoon|minecraft/i.test(blob)) return -3;
      // Always demote dark/muddy stock — critical watch fail pattern
      if (/\b(night|dark|silhouette|low.?light|underexposed|muddy|dimly|shadowy|black background|black frame)\b/i.test(blob)) {
        return -5;
      }
      const preferBright = process.env.AUTOTUBE_PREFER_BRIGHT_BROLL === '1';
      if (preferBright && /\b(overexposed|blown.?out|washed.?out)\b/i.test(blob)) {
        return -4;
      }
      let beatBoost = 0;
      if (activeBeat) {
        beatBoost = scoreAssetAgainstBeat(a, activeBeat);
      } else if (segBeats.length) {
        beatBoost = Math.max(...segBeats.map((b) => scoreAssetAgainstBeat(a, b)));
      }
      // Intro + outro: topic relevance first so office/arch models lose to care/CCTV clips
      if (isIntro || isOutro) {
        const rel = scoreAssetRelevance(a, seg, project.topic || '');
        let score = rel < 0.15 ? -4 : Math.round(rel * 5);
        if (topicIsHousing && /evict|landlord|tenant|lease|rent|notice|apartment|keys|court/i.test(blob)) score += 3;
        if (/nursing|elderly|care\s*home|cctv|camera|caregiver|surveillance|wheelchair/i.test(blob)) score += 5;
        // Hook needs a human face — but care/CCTV still outranks generic faces on nursing topics
        if (/face|person|people|couple|worried|shocked|reaction|family|close.?up|portrait|eyes/i.test(blob)) {
          score += /nursing|elderly|care\s*home|cctv|abuse/i.test(topicBlob) ? 1 : 4;
        }
        if (isOutro && /checklist|subscribe|relieved|direct.?camera|verify|call/i.test(blob)) score += 2;
        if (preferBright && /\b(daylight|sunny|bright|well.?lit|window light)\b/i.test(blob)) score += 2;
        return score + beatBoost;
      }
      if (/nursing|elderly|care\s*home|cctv|camera|caregiver|surveillance/i.test(blob)) return 3 + beatBoost;
      if (topicIsHousing && /beetle|insect|wildlife|macro|spider|bug|larva|caterpillar/i.test(blob)) return -10;
      if (topicIsHousing && /evict|landlord|tenant|lease|rent|notice|apartment|keys|court|couple|worried/i.test(blob)) return 2 + beatBoost;
      if (/face|person|people|couple|worried|shocked|reaction|tenant|family|close.?up|portrait/i.test(blob)) return 3 + beatBoost;
      return beatBoost;
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
          const ranked = [...videos].sort((a, b) => scoreAsset(b) - scoreAsset(a));
          const usable = uniqueAssetsByUrl(ranked.filter((a) => scoreAsset(a) >= 0));
          if (usable.length) return usable;
          const out = [];
          let vi = 0;
          let ii = 0;
          const total = Math.max(assets.length, 8);
          const pickVideo = () => {
            for (let j = 0; j < ranked.length; j++) {
              const candidate = ranked[(vi + j) % ranked.length];
              const key = urlKey(candidate);
              if (key && (urlUseCount.get(key) || 0) >= maxReusePerUrl) continue;
              vi += 1;
              return candidate;
            }
            const fallback = ranked[vi % ranked.length];
            vi += 1;
            return fallback;
          };
          for (let k = 0; k < total; k += 1) {
            if (k % 4 !== 3 && videos.length) {
              out.push(pickVideo());
            } else if (images.length) {
              out.push(images[ii % images.length]);
              ii += 1;
            } else if (videos.length) {
              out.push(pickVideo());
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
      const activeBeat = beatAtSegmentTime(segBeats, t, duration);
      const pickFrom = (pool) => {
        const canUse = (candidate) => {
          const key = urlKey(candidate);
          if (candidate.id === lastAssetId || (key && key === lastUrl)) return false;
          if (key && (urlUseCount.get(key) || 0) >= maxReusePerUrl) return false;
          return true;
        };
        // Beat-aware re-rank only when a beat sheet window is active; otherwise
        // preserve ordered preference (intro topic lock / care-over-face borrow order).
        const rankedPool = activeBeat
          ? [...pool].sort((a, b) => scoreAsset(b, activeBeat) - scoreAsset(a, activeBeat))
          : pool;
        for (let j = 0; j < rankedPool.length; j++) {
          const candidate = rankedPool[(ai + j) % rankedPool.length];
          if (canUse(candidate)) return candidate;
        }
        return rankedPool.reduce((best, candidate) => {
          const key = urlKey(candidate);
          const count = key ? (urlUseCount.get(key) || 0) : 0;
          const bestKey = urlKey(best);
          const bestCount = bestKey ? (urlUseCount.get(bestKey) || 0) : 0;
          if (candidate.id === lastAssetId || (key && key === lastUrl)) return best;
          if (topicIsHousing && !isIntro && scoreAsset(candidate, activeBeat) < 0) return best;
          if (activeBeat && scoreAsset(candidate, activeBeat) !== scoreAsset(best, activeBeat)) {
            return scoreAsset(candidate, activeBeat) > scoreAsset(best, activeBeat) ? candidate : best;
          }
          return count < bestCount ? candidate : best;
        }, rankedPool[ai % rankedPool.length]);
      };

      let asset = pickFrom(ordered);
      let attempts = 0;

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
        reason: activeBeat ? `beat:${activeBeat.id || activeBeat.searchableSubject || 'match'}` : reason,
      });
      lastAssetId = asset.id;
      lastUrl = urlKey(asset) || null;
      if (lastUrl) {
        urlUseCount.set(lastUrl, (urlUseCount.get(lastUrl) || 0) + 1);
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
      maxReusePerUrl: options.maxReusePerUrl ?? 1,
      reason: 'post-sanitize rebuild',
    });
  }
  return { rebuilt, staleCount: stale, staleRatio, clipCount: project.editTimeline.length };
}
