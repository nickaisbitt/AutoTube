/**
 * Harvest quality gates: topic/segment relevance + per-segment volume.
 */

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
  'from', 'as', 'is', 'was', 'are', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
  'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall',
  'can', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they',
  'what', 'which', 'who', 'whom', 'whose', 'where', 'when', 'why', 'how', 'all', 'each',
  'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not',
  'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just', 'about', 'into', 'through',
  'during', 'before', 'after', 'above', 'below', 'between', 'under', 'again', 'further',
  'then', 'once', 'here', 'there', 'your', 'our', 'their', 'its', 'his', 'her', 'my',
  'me', 'him', 'them', 'us', 'also', 'still', 'even', 'back', 'because', 'while', 'like',
  'get', 'got', 'make', 'made', 'say', 'said', 'says', 'one', 'two', 'new', 'now', 'way',
]);

const VIDEO_HOST_RE = /(?:youtube\.com|youtu\.be|vimeo\.com|player\.vimeo|dailymotion\.com|videos\.pexels\.com|archive\.org|\/api\/download-clip)/i;

/** Hosts that often fail download-clip proxy and become ffmpeg placeholders. */
const UNRELIABLE_VIDEO_HOST_RE = /(?:tiktok\.com|vm\.tiktok|instagram\.com|x\.com|twitter\.com|facebook\.com|fb\.watch|news\.artnet\.com\/art-world\/)/i;

/** @param {string} url */
export function isUnreliableVideoHost(url = '') {
  return UNRELIABLE_VIDEO_HOST_RE.test(url || '');
}

/** Motion-clip sources that reliably survive download-clip proxy + ffmpeg encode. */
const TRUSTED_VIDEO_HOST_RE = /(?:youtube\.com|youtu\.be|vimeo\.com|player\.vimeo|videos\.pexels\.com)/i;

/** @param {string} url */
export function isTrustedVideoHost(url = '') {
  return TRUSTED_VIDEO_HOST_RE.test(url || '');
}

/** @param {object} asset */
export function isVideoLikeAsset(asset = {}) {
  if (isUnreliableVideoHost(`${asset.url || ''} ${asset.sourceUrl || ''}`)) return false;
  if (asset.type === 'video') return true;
  const url = `${asset.url || ''} ${asset.sourceUrl || ''}`;
  return /\.(?:mp4|webm|mov)(?:[?#]|$)/i.test(url) || VIDEO_HOST_RE.test(url);
}

/** @param {object[]} media @param {string} segmentId */
export function countSegmentVideos(media = [], segmentId) {
  return media.filter((m) => m.segmentId === segmentId && isVideoLikeAsset(m)).length;
}

/** Generic topic words that alone should not keep an asset on-topic. */
const WEAK_TOPIC_WORDS = new Set([
  'tiktok', 'live', 'stream', 'streamed', 'video', 'news', 'breaking', 'viral',
  'social', 'media', 'online', 'watch', 'footage', 'clip', 'trending', 'update',
]);

/** Topic-level tokens that strongly indicate off-topic harvest noise. */
const OFF_TOPIC_BLOCKLIST = [
  { pattern: /\btrump\b/i, requires: /\btrump|president|white house|election|maga\b/i },
  { pattern: /\bbiden\b/i, requires: /\bbiden|president|white house|election\b/i },
  { pattern: /\bdemocracy forum\b/i, requires: /\bdemocracy|athens forum\b/i },
  { pattern: /\bwallpaper\b/i, requires: /\bwallpaper|desktop background\b/i },
  { pattern: /\bfood poisoning\b/i, requires: /\bfood poisoning|salmonella|e\.?\s*coli\b/i },
  { pattern: /\belectric car fire\b/i, requires: /\belectric car|ev fire|tesla fire\b/i },

  // Pinterest pin-board aggregator — almost never quality B-roll; exclude unless topic is about Pinterest
  { pattern: /pinterest\.com|pinimg\.com/i, requires: /\bpinterest\b/i },

  // Geographic map images (Texas map, state/county maps, OpenStreetMap tiles) — noise for non-geo topics
  { pattern: /\btexas\s*map|\bstate\s*map|\bcounty\s*map|\bgeographic\s*map/i, requires: /\bmap\b|\bgeograph|\btexas\b/i },
  { pattern: /openstreetmap\.org|\/api\/static-map/i, requires: /\bmap\b|\bgeograph|\blocation\b|\bstreet\b/i },

  // Hydration / water-bottle lifestyle shots — noise when topic is not health/fitness/drinks
  { pattern: /\bhydration\b|\bdrinking\s+water\b|\bwater\s+bottle\b/i, requires: /\bhydrat|\bwater\s+drink|\bdrink|\bfitness\b|\bhealth\b|\bwellness\b/i },

  // Royalty-free children stock photos — noise when topic is not about kids/education
  { pattern: /royalty.{0,5}free\s+(?:kids?|child(?:ren)?)|(?:kids?|children)\s+stock\s+photo/i, requires: /\bkid|\bchild|\byouth\b|\beducation\b/i },

  // Tier-list / ranking graphics — almost never relevant B-roll
  { pattern: /\btier\s*list\b/i, requires: /\btier\s*list\b/i },

  // Social/app logos, app-store screenshots, avatar crops — never editorial B-roll
  { pattern: /logojoy\.com|cdn\.logojoy|tiktokcdn\.com\/tos-maliva-avt|sndcdn\.com\/artworks|tiktokpng\.com|filehippo\.net|mzstatic\.com\/image|androidheadlines\.com.*app/i, requires: /\b__autotube_never__\b/i },

  // Children/nature stock — noise unless topic is about kids/education
  { pattern: /\b(?:children?\s+(?:playing|exploring|hugging)|nature\s+lover\s+child)\b/i, requires: /\bkid|\bchild|\byouth\b|\beducation\b/i },
  { pattern: /stockcake\.com|freepik\.com.*child|dreamstime\.com.*child/i, requires: /\bkid|\bchild|\byouth\b/i },

  // Generic map / timezone infographics — noise unless topic is geographic
  { pattern: /printable-us-map|guideoftheworld\.com\/map|time-zone-map|timezonesmap|wikiusa\.org.*time-zone/i, requires: /\bmap\b|\btime\s*zone\b|\bgeograph\b/i },

  // Stock lifestyle / clipart / generic infographics
  { pattern: /\b(?:living\s+room|weight\s*watchers|clipart|teamwork\s+hands)\b/i, requires: /\b(?:living\s+room|weight|clipart|teamwork)\b/i },
  { pattern: /videoblocks.*thumbnail|cloudfront\.net\/thumbnails\/video/i, requires: /\b__autotube_never__\b/i },

  // Fiction / movie stills and meme posters — not editorial news B-roll
  { pattern: /movieweb|pulp[\s-]?fiction|jason[\s-]?statham|talestavern|stealing-pulp|movieposter|film[\s-]?still|heist[\s-]?thriller|heist[\s-]?movie/i, requires: /\b(?:movie|film|cinema|hollywood|statham|actor|fiction)\b/i },
  { pattern: /preview\.redd\.it\/|redd\.it\/.*\.jpg/i, requires: /\b(?:meme|reddit|fan[\s-]?art)\b/i },
];

/**
 * @param {string} haystack
 * @param {string} contextText
 * @returns {string|null}
 */
function offTopicBlockReason(haystack, contextText) {
  for (const rule of OFF_TOPIC_BLOCKLIST) {
    if (rule.pattern.test(haystack) && !rule.requires.test(contextText)) {
      return `blocklist: ${rule.pattern}`;
    }
  }
  return null;
}

/**
 * @param {string} text
 * @param {number} [max]
 */
export function extractKeywords(text, max = 14) {
  const raw = (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
  const seen = new Set();
  const out = [];
  for (const w of raw) {
    if (seen.has(w)) continue;
    seen.add(w);
    out.push(w);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * @param {object} asset
 * @param {object} segment
 * @param {string} topic
 * @param {string[]} topicKeywords
 */
export function scoreAssetRelevance(asset, segment, topic, topicKeywords = []) {
  const segText = `${segment?.title || ''} ${segment?.narration || ''}`;
  const segKeywords = extractKeywords(segText, 10).filter((kw) => !WEAK_TOPIC_WORDS.has(kw));
  const topicKws = topicKeywords.length ? topicKeywords : extractKeywords(topic, 12);
  const strongTopicKws = topicKws.filter((kw) => !WEAK_TOPIC_WORDS.has(kw));
  const corpus = new Set([...strongTopicKws, ...segKeywords]);

  const haystack = `${asset?.alt || ''} ${asset?.url || ''} ${asset?.query || ''} ${asset?.sourceUrl || ''}`.toLowerCase();
  if (!haystack.trim()) return 0;

  const contextText = `${topic} ${segText}`.toLowerCase();
  if (offTopicBlockReason(haystack, contextText)) return 0;

  let topicHits = 0;
  let segHits = 0;
  for (const kw of strongTopicKws) {
    if (haystack.includes(kw)) topicHits += 1;
  }
  for (const kw of segKeywords) {
    if (haystack.includes(kw)) segHits += 1;
  }

  const strongHits = topicHits + segHits;
  if (strongHits === 0) return 0;
  if (segHits === 0 && topicHits < 2) return 0;

  const denom = Math.min(Math.max(corpus.size, 1), 8);
  let score = strongHits / denom;

  if (asset?.type === 'video' || /\.(mp4|webm|mov)/i.test(asset?.url || '') || /\/api\/download-clip/i.test(asset?.url || '')) {
    score += 0.05;
    if (/youtube|vimeo|dailymotion|news|documentary|archive\.org/i.test(haystack)) {
      score += 0.1;
    }
  }
  if (asset?.query && segKeywords.some((k) => asset.query.toLowerCase().includes(k))) {
    score += 0.1;
  }

  // Giphy assets are GIFs/short loops with no editorial context — cap their relevance
  // score so news/stock/documentary sources always rank above them.
  if ((asset?.source || '').toLowerCase() === 'giphy') {
    score = Math.min(score, 0.35);
  }

  return Math.max(0, Math.min(1, score));
}

/** Stricter gate for volume top-up — rejects weak-keyword-only matches (e.g. TikTok logos). */
export function passesTopUpRelevanceGate(asset, segment, topic, topicKeywords = []) {
  const topicKws = topicKeywords.length ? topicKeywords : extractKeywords(topic, 12);
  const strongTopicKws = topicKws.filter((kw) => !WEAK_TOPIC_WORDS.has(kw));
  const proxiedClip = /\/api\/download-clip/i.test(asset?.url || '');
  const haystack = `${asset?.alt || ''} ${asset?.url || ''} ${asset?.sourceUrl || ''}${
    proxiedClip ? ` ${segment?.title || ''} ${topic}` : ''
  }`.toLowerCase();
  const contextText = `${topic} ${segment?.title || ''} ${segment?.narration || ''}`.toLowerCase();
  if (offTopicBlockReason(haystack, contextText)) return false;

  // Do NOT count asset.query — top-up queries are built from topic keywords and would always self-match.
  const topicHits = strongTopicKws.filter((kw) => haystack.includes(kw)).length;
  if (topicHits < 1) return false;

  const score = scoreAssetRelevance(
    { ...asset, query: '' },
    segment,
    topic,
    topicKeywords,
  );
  const minScore = asset?.type === 'video' ? 0.3 : 0.35;
  return score >= minScore;
}

/**
 * @param {object[]} media
 * @param {object} project
 * @param {{ minScore?: number }} [options]
 */
export function filterAssetsByRelevance(media, project, options = {}) {
  const minScore = options.minScore ?? 0.25;
  const topic = project.topic || project.title || '';
  const topicKeywords = extractKeywords(topic, 12);
  const segments = Object.fromEntries((project.script || []).map((s) => [s.id, s]));
  const kept = [];
  const dropped = [];

  for (const asset of media) {
    const seg = segments[asset.segmentId] || project.script?.[0];
    const haystack = `${asset?.alt || ''} ${asset?.url || ''} ${asset?.query || ''} ${asset?.sourceUrl || ''}`.toLowerCase();
    const contextText = `${topic} ${seg?.title || ''} ${seg?.narration || ''}`.toLowerCase();
    const blockReason = offTopicBlockReason(haystack, contextText);
    if (blockReason) {
      dropped.push({
        url: asset.url,
        segmentId: asset.segmentId,
        score: 0,
        reason: blockReason,
      });
      continue;
    }

    const isTopUp = (asset?.source || '').includes('top-up');
    const score = scoreAssetRelevance(asset, seg, topic, topicKeywords);
    const threshold = isTopUp ? Math.max(minScore, 0.35) : minScore;
    if (score >= threshold && (!isTopUp || passesTopUpRelevanceGate(asset, seg, topic, topicKeywords))) {
      kept.push({ ...asset, relevanceScore: Math.round(score * 100) / 100 });
    } else {
      dropped.push({
        url: asset.url,
        segmentId: asset.segmentId,
        score: Math.round(score * 100) / 100,
        reason: score === 0 ? 'no strong topic/segment keyword hits' : 'below relevance threshold',
      });
    }
  }

  return { media: kept, dropped, minScore };
}

/**
 * Detect segments where Giphy dominates (≥50% of assets) or is the only source.
 * Used by the improvement loop to flag weak-source segments before scoring.
 *
 * @param {object} project
 * @returns {{ giphyOnlySegments: string[], giphyDominantSegments: string[], giphyTotal: number }}
 */
export function detectGiphyDominance(project) {
  const segments = project.script || [];
  const giphyOnlySegments = [];
  const giphyDominantSegments = [];
  let giphyTotal = 0;

  for (const seg of segments) {
    const assets = (project.media || []).filter((m) => m.segmentId === seg.id);
    if (assets.length === 0) continue;
    const giphyCount = assets.filter((m) => (m.source || '').toLowerCase() === 'giphy').length;
    giphyTotal += giphyCount;
    if (giphyCount === assets.length) {
      giphyOnlySegments.push(seg.id);
    } else if (giphyCount / assets.length >= 0.5) {
      giphyDominantSegments.push(seg.id);
    }
  }

  return { giphyOnlySegments, giphyDominantSegments, giphyTotal };
}

/**
 * @param {object} project
 * @param {number} minPerSegment
 */
export function evaluateHarvestVolume(project, minPerSegment = 6) {
  const segments = project.script || [];
  const perSegment = {};

  for (const seg of segments) {
    const assets = (project.media || []).filter((m) => m.segmentId === seg.id);
    const uniqueUrls = new Set(
      assets.map((a) => (a.url || '').split('?')[0]).filter(Boolean),
    );
    perSegment[seg.id] = {
      title: seg.title,
      count: uniqueUrls.size,
      videoCount: countSegmentVideos(project.media || [], seg.id),
    };
  }

  const failing = Object.entries(perSegment)
    .filter(([, v]) => v.count < minPerSegment)
    .map(([id, v]) => ({ segmentId: id, ...v, need: minPerSegment }));

  return {
    pass: failing.length === 0,
    perSegment,
    minPerSegment,
    failing,
  };
}

/** Warn when browser harvest is below this (top-up runs after narration). */
export const THIN_HARVEST_WARN_THRESHOLD = 3;

/** Loop cap — raising minAssets above this starves browser harvest before top-up. */
export const LOOP_MAX_MIN_ASSETS_PER_SEGMENT = 6;

/**
 * Segments with fewer than `warnThreshold` unique asset URLs (browser harvest before top-up).
 * @param {object} project
 * @param {number} [warnThreshold]
 */
export function detectThinHarvest(project, warnThreshold = THIN_HARVEST_WARN_THRESHOLD) {
  const volume = evaluateHarvestVolume(project, warnThreshold);
  const thin = volume.failing.map((f) => ({
    segmentId: f.segmentId,
    title: f.title,
    count: f.count,
    need: warnThreshold,
  }));
  return { pass: thin.length === 0, thin, warnThreshold };
}

/**
 * Loop media-step timeout — extra headroom when video-first harvest runs longer.
 * @param {{ realHarvest?: boolean, videoFirst?: boolean }} options
 */
export function loopMediaTimeoutMs({ realHarvest = false, videoFirst = false } = {}) {
  const base = realHarvest ? 1_200_000 : 300_000;
  return realHarvest && videoFirst ? base + 300_000 : base;
}
