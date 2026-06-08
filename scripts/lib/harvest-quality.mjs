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

/** Topic-level tokens that strongly indicate off-topic harvest noise. */
const OFF_TOPIC_BLOCKLIST = [
  { pattern: /\btrump\b/i, requires: /\btrump|president|white house|election\b/i },
  { pattern: /\bbiden\b/i, requires: /\bbiden|president|white house|election\b/i },
  { pattern: /\bdemocracy forum\b/i, requires: /\bdemocracy|athens forum\b/i },
  { pattern: /\bwallpaper\b/i, requires: /\bwallpaper|desktop background\b/i },
  { pattern: /\bfood poisoning\b/i, requires: /\bfood poisoning|salmonella|e\.?\s*coli\b/i },
  { pattern: /\belectric car fire\b/i, requires: /\belectric car|ev fire|tesla fire\b/i },
];

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
  const segKeywords = extractKeywords(segText, 10);
  const topicKws = topicKeywords.length ? topicKeywords : extractKeywords(topic, 12);
  const corpus = new Set([...topicKws, ...segKeywords]);

  const haystack = `${asset?.alt || ''} ${asset?.url || ''} ${asset?.query || ''} ${asset?.sourceUrl || ''}`.toLowerCase();
  if (!haystack.trim()) return 0;

  let hits = 0;
  for (const kw of corpus) {
    if (haystack.includes(kw)) hits += 1;
  }
  let score = corpus.size ? hits / Math.min(corpus.size, 8) : 0;

  const contextText = `${topic} ${segText}`.toLowerCase();
  for (const rule of OFF_TOPIC_BLOCKLIST) {
    if (rule.pattern.test(haystack) && !rule.requires.test(contextText)) {
      score -= 0.45;
    }
  }

  if (asset?.type === 'video' || /\.(mp4|webm|mov)/i.test(asset?.url || '')) {
    score += 0.08;
  }
  if (asset?.query && segKeywords.some((k) => asset.query.toLowerCase().includes(k))) {
    score += 0.12;
  }

  return Math.max(0, Math.min(1, score));
}

/**
 * @param {object[]} media
 * @param {object} project
 * @param {{ minScore?: number }} [options]
 */
export function filterAssetsByRelevance(media, project, options = {}) {
  const minScore = options.minScore ?? 0.12;
  const topic = project.topic || project.title || '';
  const topicKeywords = extractKeywords(topic, 12);
  const segments = Object.fromEntries((project.script || []).map((s) => [s.id, s]));
  const kept = [];
  const dropped = [];

  for (const asset of media) {
    const seg = segments[asset.segmentId] || project.script?.[0];
    const score = scoreAssetRelevance(asset, seg, topic, topicKeywords);
    if (score >= minScore) {
      kept.push({ ...asset, relevanceScore: Math.round(score * 100) / 100 });
    } else {
      dropped.push({
        url: asset.url,
        segmentId: asset.segmentId,
        score: Math.round(score * 100) / 100,
        reason: 'below relevance threshold',
      });
    }
  }

  return { media: kept, dropped, minScore };
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
      videoCount: assets.filter((m) => m.type === 'video' || /\.mp4/i.test(m.url || '')).length,
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
