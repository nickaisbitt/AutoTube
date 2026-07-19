/**
 * Single source of truth for B-roll edit timelines (loop + ffmpeg assembly).
 * Always use post-TTS segment.duration when building for render.
 * When project.visualBeatSheet is present, prefer assets that match the
 * active beat for each time window (narration-aligned semantic placement).
 */
import { scoreAssetRelevance, isOffBrandVisual, isGenericStockJunk } from './harvest-quality.mjs';
import { isAirlineTopic, isHousingTopic, isWorkplaceTopic } from './topic-family.mjs';
import { isEvalColdMode } from './eval-flags.mjs';

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

/** Coarse visual cluster so cold body cuts don't loop the same subject. */
export function visualSubjectCluster(asset) {
  const blob = `${asset?.query || ''} ${asset?.alt || ''} ${asset?.url || ''}`.toLowerCase();
  if (/ambulance|paramedic|emt|911|dispatch/.test(blob)) return 'ambulance';
  if (/aerial|drone|overhead|bird.?eye|skyline|from above/.test(blob)) return 'aerial';
  if (/coding|source.?code|laptop screen|computer screen|typing keyboard|ide /.test(blob)) return 'coding';
  if (/airplane|aircraft|cabin|cockpit|jet |airport/.test(blob)) return 'aircraft';
  if (/flood|zoning|map |documents?|paperwork/.test(blob)) return 'mapdocs';
  if (/lab|pipette|sensor|calibrat|test tube/.test(blob)) return 'lab';
  if (/ship|port|container|cargo|dock|crane/.test(blob)) return 'port';
  if (/face|person|people|couple|worried|shocked|portrait|close.?up|crew|pilot|driver/.test(blob)) {
    return 'human';
  }
  if (/office|conference|corporate|meeting room/.test(blob)) return 'office';
  return 'other';
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
  const beatContext = `${beat.searchableSubject || ''} ${beat.narrationExcerpt || ''}`;
  if (isGenericStockJunk(blob, beatContext)) return -6;
  if (/stock photo|b-roll footage|generic corporate/.test(blob) && hits === 0) return -4;
  return hits * 2 + excerptHits;
}

function splitSentences(text) {
  return String(text || '')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 12);
}

/**
 * Proportional sentence start within a segment (narration-aligned when no whisper sidecar).
 * @param {object} beat
 * @param {object} seg
 * @param {number} duration
 */
export function beatStartSecForBeat(beat, seg, duration) {
  if (!beat || !seg || duration <= 0) return 0;
  const sentences = splitSentences(seg.narration || '');
  if (!sentences.length) return 0;
  const idx = Math.min(Math.max(0, beat.sentenceIndex ?? 0), sentences.length - 1);
  const totalChars = sentences.reduce((sum, line) => sum + line.length, 0) || 1;
  let charsBefore = 0;
  for (let i = 0; i < idx; i += 1) charsBefore += sentences[i].length;
  return (charsBefore / totalChars) * duration;
}

/**
 * Pick the beat active for a local time within a segment.
 * Uses sentenceIndex + narration proportion when beats carry sentence metadata;
 * falls back to even spacing otherwise.
 * @param {object[]} beats
 * @param {number} localSec
 * @param {number} duration
 * @param {object} [seg]
 */
export function beatAtSegmentTime(beats, localSec, duration, seg = null) {
  if (!beats?.length) return null;
  if (seg && beats.some((b) => typeof b.sentenceIndex === 'number')) {
    const ranked = beats
      .map((beat) => ({
        beat,
        start: beatStartSecForBeat(beat, seg, duration),
      }))
      .sort((a, b) => a.start - b.start);
    let active = ranked[0]?.beat ?? beats[0];
    for (const { beat, start } of ranked) {
      if (start <= localSec + 0.01) active = beat;
    }
    return active;
  }
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
  const MAX_BODY_CUT_SEC = 1.25;
  const MAX_BODY_CUT_THIN_SEC = 2.0;
  // Keep requested cut for pacing. Dynamic hard-cap: at least 3, at most 6 —
  // never climb to 9–12×. Thin pools lengthen cuts up to 2s instead.
  const HARD_MAX_REUSE_FLOOR = 3;
  const HARD_MAX_REUSE_CEIL = 6;
  let effectiveMaxReuse = maxReusePerUrl;
  let hardMaxReuse = HARD_MAX_REUSE_FLOOR;
  let effectiveCut = cut;
  if (uniqueVideos.length > 0 && totalDur > 0 && cut > 0) {
    const bodyCut = Math.min(cut, MAX_BODY_CUT_SEC);
    const clipsNeeded = totalDur / bodyCut;
    hardMaxReuse = Math.min(
      HARD_MAX_REUSE_CEIL,
      Math.max(HARD_MAX_REUSE_FLOOR, Math.ceil(clipsNeeded / uniqueVideos.length)),
    );
    if (clipsNeeded > uniqueVideos.length * effectiveMaxReuse) {
      effectiveMaxReuse = Math.min(hardMaxReuse, Math.max(effectiveMaxReuse, Math.ceil(clipsNeeded / uniqueVideos.length)));
    }
    const maxSlots = uniqueVideos.length * hardMaxReuse;
    if (totalDur / Math.min(effectiveCut, MAX_BODY_CUT_SEC) > maxSlots) {
      effectiveCut = Math.min(MAX_BODY_CUT_THIN_SEC, Math.max(cut, totalDur / maxSlots));
    }
  } else {
    hardMaxReuse = HARD_MAX_REUSE_CEIL;
  }
  const topicIsHousing = !isEvalColdMode() && isHousingTopic(project.topic || '');
  const topicIsWorkplace = isWorkplaceTopic(project.topic || '');
  const topicIsAirline = isAirlineTopic(project.topic || '');
  const coldEval = isEvalColdMode();
  const beatSheet = project.visualBeatSheet;
  const beatsBySeg = new Map();
  for (const b of beatSheet?.beats || []) {
    const list = beatsBySeg.get(b.segmentId) || [];
    list.push(b);
    beatsBySeg.set(b.segmentId, list);
  }

  for (const seg of project.script || []) {
    const segmentUrlUse = new Map();
    let assets = uniqueAssetsByUrl((project.media || []).filter((m) => m.segmentId === seg.id));
    if (!assets.length) {
      // Borrow from global pool; prefer face/CTA motion.
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
    const reuseCountFor = (key, introOutroOnly) => {
      if (!key) return 0;
      if (introOutroOnly) return segmentUrlUse.get(key) || 0;
      return urlUseCount.get(key) || 0;
    };
    const scoreAsset = (a, activeBeat = null) => {
      const blob = `${a.query || ''} ${a.alt || ''} ${a.url || ''}`.toLowerCase();
      const key = urlKey(a);
      const introOutroReuse = isIntro || isOutro;
      const priorUses = reuseCountFor(key, introOutroReuse);
      // Soft anti-reuse across the timeline (non-adjacent too): steepen with uses.
      let reusePenalty = priorUses > 0 ? -5 * priorUses - Math.max(0, priorUses - 1) * 2 : 0;
      if (isOffBrandVisual(blob, topicBlob)) return -8;
      if (isGenericStockJunk(blob, topicBlob)) return -8;
      // Hard-ban office/cowork pads on non-workplace stories.
      if (
        !topicIsWorkplace
        && (/office|coworking|open.?plan|imac|boardroom|conference room|corporate office|bright office daylight/i.test(blob)
          || visualSubjectCluster(a) === 'office')
      ) {
        return -20;
      }
      if (topicIsAirline && !/airline|aircraft|airplane|aviation|cabin|cockpit|oxygen|runway|jet|passenger|attendant|hangar|airport|pilot|plane|flight/i.test(blob)) {
        // Soft demote off-story stock on airline topics (faces still ok).
        if (!/face|person|people|worried|shocked|portrait|close.?up/i.test(blob)) reusePenalty -= 4;
      }
      if (/architectural model|architecture model|scale model|conference room|skyline|corporate office|business district|empty park|people in park|press conference|news desk|office desk/i.test(blob)) return -6;
      if (topicIsHousing && /moving boxes|packing boxes|cardboard boxes|boxes hallway/i.test(blob)) return -2;
      if (/microphone|podcast|recording studio|asmr|rode|sequin|fashion runway|back of head|from behind|puppet|beetle|insect|cartoon|minecraft/i.test(blob)) return -5;
      if (/camcorder|handheld camcorder|person holding camera|holding camcorder|vintage camera|filming with phone|dslr camera/i.test(blob)) return -4;
      // Demote dark/muddy stock.
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
        // First 3s: require beat match when available.
        if (isIntro && beatBoost < 0) return -6;
      } else if (segBeats.length) {
        beatBoost = Math.max(...segBeats.map((b) => scoreAssetAgainstBeat(a, b)));
      }
      // Intro/outro: topic relevance first.
      if (isIntro || isOutro) {
        const rel = scoreAssetRelevance(a, seg, project.topic || '');
        let score = rel < 0.15 ? -4 : Math.round(rel * 5);
        if (topicIsHousing && /evict|landlord|tenant|lease|rent|notice|apartment|keys|court/i.test(blob)) score += 3;
        if (!coldEval && /nursing|elderly|care\s*home|cctv|camera|caregiver|surveillance|wheelchair/i.test(blob)) score += 5;
        // Hook needs a face; care/CCTV outranks generic faces on nursing.
        if (/face|person|people|couple|worried|shocked|reaction|family|close.?up|portrait|eyes/i.test(blob)) {
          score += !coldEval && /nursing|elderly|care\s*home|cctv|abuse/i.test(topicBlob) ? 1 : 4;
        }
        // Cold intro: beat match outranks establishing stock.
        if (coldEval && isIntro && beatBoost > 0) score += beatBoost * 2;
        if (isOutro && /checklist|subscribe|relieved|direct.?camera|verify|call/i.test(blob)) score += 2;
        if (preferBright && /\b(daylight|sunny|bright|well.?lit|window light)\b/i.test(blob)) score += 2;
        return score + beatBoost + reusePenalty;
      }
      if (!coldEval && /nursing|elderly|care\s*home|cctv|camera|caregiver|surveillance/i.test(blob)) return 3 + beatBoost;
      if (topicIsHousing && /beetle|insect|wildlife|macro|spider|bug|larva|caterpillar/i.test(blob)) return -10;
      if (topicIsHousing && /evict|landlord|tenant|lease|rent|notice|apartment|keys|court|couple|worried/i.test(blob)) return 2 + beatBoost;
      // Cold body: topic relevance + faces beat looping subject stock.
      if (coldEval) {
        const rel = scoreAssetRelevance(a, seg, project.topic || '');
        let score = rel < 0.12 ? -2 : Math.round(rel * 4);
        if (/face|person|people|couple|worried|shocked|reaction|family|close.?up|portrait|crew|pilot|driver|paramedic/i.test(blob)) {
          score += 3;
        }
        if (preferBright && /\b(daylight|sunny|bright|well.?lit|window light)\b/i.test(blob)) score += 1;
        return score + beatBoost + reusePenalty;
      }
      if (/face|person|people|couple|worried|shocked|reaction|tenant|family|close.?up|portrait/i.test(blob)) return 3 + beatBoost + reusePenalty;
      return beatBoost + reusePenalty;
    };
    // Intro/outro: motion only when videos exist. Body: mostly video.
    const ordered = preferVideo && videos.length
      ? (() => {
          if (isIntro || isOutro) {
            const ranked = [...videos].sort((a, b) => scoreAsset(b) - scoreAsset(a));
            let usable = uniqueAssetsByUrl(ranked.filter((a) => scoreAsset(a) >= 0));
            if (!usable.length) usable = uniqueAssetsByUrl(ranked.slice(0, 1));
            // Borrow enough unique motion for dense intro cuts.
            const introSlotsNeeded = Math.max(4, Math.ceil((seg.duration || 20) / Math.min(cut, 0.65)));
            if (usable.length < introSlotsNeeded && globalPool.length) {
              const extras = uniqueAssetsByUrl(
                [...globalPool]
                  .filter((a) => a.type === 'video' && !usable.some((u) => u.id === a.id || urlKey(u) === urlKey(a)))
                  .map((a) => ({ ...a, segmentId: seg.id }))
                  .sort((a, b) => scoreAsset(b) - scoreAsset(a))
                  .filter((a) => scoreAsset(a) >= 0),
              );
              usable = uniqueAssetsByUrl([...usable, ...extras]).slice(0, Math.max(8, introSlotsNeeded));
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
              if (key && (urlUseCount.get(key) || 0) >= effectiveMaxReuse) continue;
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
    const interval = isIntro ? Math.min(effectiveCut, 0.65) : effectiveCut;
    const maxReuseThisSeg = isIntro || isOutro ? 1 : effectiveMaxReuse;
    let t = 0;
    let ai = 0;
    let lastAssetId = null;
    let lastUrl = null;
    let lastCluster = null;
    while (t < duration - 0.05) {
      const end = Math.min(duration, t + interval);
      const activeBeat = beatAtSegmentTime(segBeats, t, duration, seg);
      const diversityScore = (candidate) => {
        let s = scoreAsset(candidate, activeBeat);
        // Soft anti-repeat of the same subject cluster (not just adjacent URL).
        if (!isIntro && !isOutro && lastCluster) {
          const cluster = visualSubjectCluster(candidate);
          if (cluster === lastCluster && cluster !== 'human' && cluster !== 'other') s -= 4;
        }
        return s;
      };
      const pickFrom = (pool, { allowOverReuse = false } = {}) => {
        const introOutroReuse = isIntro || isOutro;
        const canUse = (candidate) => {
          const key = urlKey(candidate);
          if (candidate.id === lastAssetId || (key && key === lastUrl)) return false;
          const uses = reuseCountFor(key, introOutroReuse);
          // Never exceed hard max — even as last resort (stops 9–12× loops).
          if (key && uses >= hardMaxReuse) return false;
          if (!allowOverReuse && key && uses >= maxReuseThisSeg) {
            return false;
          }
          // Never over-reuse office pads on non-workplace topics.
          if (
            !topicIsWorkplace
            && visualSubjectCluster(candidate) === 'office'
            && uses >= 1
          ) {
            return false;
          }
          return true;
        };
        const rankedPool = (activeBeat || (coldEval && !isIntro && !isOutro))
          ? [...pool].sort((a, b) => diversityScore(b) - diversityScore(a))
          : pool;
        if (!rankedPool.length) return null;
        for (let j = 0; j < rankedPool.length; j++) {
          const candidate = rankedPool[(ai + j) % rankedPool.length];
          if (canUse(candidate)) return candidate;
        }
        if (!allowOverReuse) return null;
        // Last-resort: least-used under hardMax only.
        const underCap = rankedPool.filter((candidate) => {
          const key = urlKey(candidate);
          const count = reuseCountFor(key, introOutroReuse);
          if (candidate.id === lastAssetId || (key && key === lastUrl)) return false;
          if (key && count >= hardMaxReuse) return false;
          if (
            !topicIsWorkplace
            && visualSubjectCluster(candidate) === 'office'
            && count >= 1
          ) {
            return false;
          }
          return true;
        });
        if (!underCap.length) return null;
        return underCap.reduce((best, candidate) => {
          const key = urlKey(candidate);
          const count = reuseCountFor(key, introOutroReuse);
          const bestKey = urlKey(best);
          const bestCount = reuseCountFor(bestKey, introOutroReuse);
          if (topicIsHousing && !isIntro && scoreAsset(candidate, activeBeat) < 0) return best;
          if (diversityScore(candidate) !== diversityScore(best)) {
            return diversityScore(candidate) > diversityScore(best) ? candidate : best;
          }
          return count < bestCount ? candidate : best;
        }, underCap[0]);
      };

      // Prefer segment pool → unused global URLs → over-reuse last resort.
      let asset =
        pickFrom(ordered)
        || (!isIntro && !isOutro ? pickFrom(globalPool) : null)
        || pickFrom(ordered, { allowOverReuse: true })
        || pickFrom(globalPool, { allowOverReuse: true });
      let attempts = 0;

      while (
        asset
        && attempts < Math.max(ordered.length, globalPool.length)
        && (asset.id === lastAssetId || (urlKey(asset) && urlKey(asset) === lastUrl))
      ) {
        asset =
          pickFrom(isIntro || isOutro || ordered.length > 1 ? ordered : globalPool)
          || pickFrom(isIntro || isOutro || ordered.length > 1 ? ordered : globalPool, {
            allowOverReuse: true,
          });
        ai += 1;
        attempts += 1;
      }
      if (!asset) {
        // Absolute last resort under hardMax only; if capped, lengthen prior cut.
        const pool = [...ordered, ...globalPool];
        const ranked = pool
          .filter((c) => c && c.id !== lastAssetId && urlKey(c) !== lastUrl)
          .sort((a, b) => reuseCountFor(urlKey(a), isIntro || isOutro) - reuseCountFor(urlKey(b), isIntro || isOutro));
        asset = ranked.find((c) => reuseCountFor(urlKey(c), isIntro || isOutro) < hardMaxReuse) || null;
        if (!asset && entries.length && entries[entries.length - 1].segmentId === seg.id) {
          entries[entries.length - 1].endSec = end;
          t = end;
          continue;
        }
      }
      if (!asset) continue;
      entries.push({
        segmentId: seg.id,
        startSec: t,
        endSec: end,
        assetId: asset.id,
        reason: activeBeat ? `beat:${activeBeat.id || activeBeat.searchableSubject || 'match'}` : reason,
      });
      lastAssetId = asset.id;
      lastUrl = urlKey(asset) || null;
      lastCluster = visualSubjectCluster(asset);
      if (lastUrl) {
        if (isIntro || isOutro) {
          segmentUrlUse.set(lastUrl, (segmentUrlUse.get(lastUrl) || 0) + 1);
        } else {
          urlUseCount.set(lastUrl, (urlUseCount.get(lastUrl) || 0) + 1);
        }
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
