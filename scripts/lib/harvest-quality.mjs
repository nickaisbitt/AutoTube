/**
 * Harvest quality gates: topic/segment relevance + per-segment volume.
 */
import { isHeistTopic, isHousingTopic, isNursingHomeTopic } from './topic-family.mjs';
import { isEvalColdMode } from './eval-flags.mjs';

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
];

/**
 * Off-brand visual junk that wrecks serious cyber/news B-roll (watcher: beetles, puppets, cartoons).
 * Allowed only when the topic itself is about that subject.
 */
export const OFF_BRAND_VISUAL_RE =
  /\b(puppet|muppet|marionette|sock\s*puppet|claymation|stop[\s-]?motion|cartoon|anime|animated\s+character|animation\s+reel|minecraft|fortnite|gameplay|macro\s*insect|beetle|dung\s*beetle|insect|bug\s+macro|larva|caterpillar|spider\s+macro|ant\s+colony|wildlife\s+macro|hud\s+graphic|sci[\s-]?fi\s+hud)\b/i;

/** Blurry / soft-focus stock that reads as cheap filler on retention audits. */
export const BLURRY_LOW_QUALITY_RE =
  /\b(blurry|out of focus|out-of-focus|defocused|soft focus|low.?res|pixelat|grainy|unfocused)\b/i;

/** Washed-out / blown highlights — common when preferBright pulls wrong clips. */
export const OVEREXPOSED_STOCK_RE =
  /\b(overexposed|blown.?out|washed.?out|high.?key white|bleached white|too bright)\b/i;

/** Staged reenactment B-roll that tanks documentary credibility. */
export const STAGED_REENACT_RE =
  /\b(staged|reenactment|re-?enact|dramatization|dramatised|dramatized|actors pretending|mock scenario|reenacted scene)\b/i;

/** Produce/grocery literal matches (e.g. Pixabay "produce" token). */
export const PRODUCE_GROCERY_JUNK_RE =
  /\b(vegetable crate|produce crate|grocery stock|fruit market|food crate|farmers market|supermarket aisle|grocery aisle|vegetable market)\b/i;

/** Empty hospital-bed stills with no patient/caregiver context. */
export const EMPTY_HOSPITAL_BED_RE =
  /\b(empty hospital bed|hospital bed only|unmade hospital bed|empty ward bed|blurry bed|hospital bed close|empty medical bed)\b/i;

/** Overused camcorder / “person holding camera” loops on non-surveillance topics. */
export const CAMCORDER_STOCK_LOOP_RE =
  /\b(camcorder|handheld camcorder|person holding (a )?camera|holding camcorder|vintage (video )?camera|filming with camcorder)\b/i;

/** Generic corporate / architecture filler for serious investigation topics. */
export const GENERIC_CORPORATE_FILLER_RE =
  /\b(corporate handshake|team meeting smiling|empty office|business people walking|stock footage loop|generic corporate|open plan office|glass building skyline|architecture model|architectural model|scale model|conference room|office meeting|skyline timelapse)\b/i;

/** Overused eviction/housing B-roll loops (boxes/stressed tenant without narrative anchor). */
export const HOUSING_STOCK_LOOP_RE =
  /\b(moving boxes|packing boxes|cardboard boxes|tenant moving boxes|boxes hallway|stress(ed)? (woman|man|person) apartment|for rent sign only|empty apartment room)\b/i;

/** Street-barber / random lifestyle clips that read as off-topic on investigation topics. */
export const RANDOM_LIFESTYLE_FILLER_RE =
  /\b(street barber|barber shop|haircut street|musician busking|concert crowd phone|stadium crowd|sports crowd|cheering fans|food truck|coffee shop latte|band playing|orchestra playing|jazz band|live band|musicians on stage)\b/i;

/** Generic lab/science B-roll loops on non-science topics. */
export const SCIENCE_LAB_LOOP_RE =
  /\b(lab technician pipette|microscope close up generic|scientist in lab coat walking|laboratory b-?roll|test tube rack generic)\b/i;

/** Ultrasound / medical stock on non-health topics. */
export const OFF_TOPIC_MEDICAL_STOCK_RE =
  /\b(ultrasound monitor|ultrasound screen|pregnancy ultrasound|fetal ultrasound|hospital corridor empty)\b/i;

/** Ferry/port timelapse filler on unrelated infrastructure stories. */
export const PORT_FERRY_LOOP_RE =
  /\b(ferry timelapse|port crane timelapse|container ship aerial generic|cargo ship sunset timelapse)\b/i;

/** Repeated camera/phone B-roll loops on non-surveillance topics. */
export const CAMERA_PHONE_LOOP_RE =
  /\b(person filming with phone|filming with smartphone|holding phone recording|camera on tripod generic|dslr camera close up)\b/i;

/**
 * @param {string} haystack
 * @param {string} contextText
 * @returns {string|null}
 */
export function genericStockJunkReason(haystack, contextText = '') {
  const h = String(haystack || '');
  const ctx = String(contextText || '').toLowerCase();
  if (!h.trim()) return null;

  if (BLURRY_LOW_QUALITY_RE.test(h)) return 'blurry/low-quality stock';
  if (OVEREXPOSED_STOCK_RE.test(h)) return 'overexposed/washed-out stock';
  if (STAGED_REENACT_RE.test(h) && !/\b(staged|reenact)/i.test(ctx)) {
    return 'staged reenactment stock';
  }
  if (
    PRODUCE_GROCERY_JUNK_RE.test(h)
    && !/\bfood|poison|salmonella|grocery|produce|nutrition|diet|e\.?\s*coli|restaurant\b/i.test(ctx)
  ) {
    return 'off-topic produce/grocery stock';
  }
  if (
    EMPTY_HOSPITAL_BED_RE.test(h)
    && !/\b(patient|nurse|doctor|caregiver|family|elderly|visiting)\b/i.test(h)
  ) {
    return 'empty/blurry hospital bed filler';
  }
  if (isNursingHomeTopic(ctx)) {
    if (GENERIC_CORPORATE_FILLER_RE.test(h)) return 'off-topic corporate/architecture for nursing';
    if (PRODUCE_GROCERY_JUNK_RE.test(h)) return 'off-topic produce/grocery for nursing';
    if (
      EMPTY_HOSPITAL_BED_RE.test(h)
      && !/\b(patient|caregiver|elderly|family|nurse)\b/i.test(h)
    ) {
      return 'empty/blurry hospital bed for nursing';
    }
  }
  if (GENERIC_CORPORATE_FILLER_RE.test(h) && !/\b(office|corporate|business|company|startup)\b/i.test(ctx)) {
    return 'generic corporate/architecture filler';
  }
  if (isHousingTopic(ctx) && HOUSING_STOCK_LOOP_RE.test(h) && !/\b(eviction notice|court|lease|landlord|tenant|letter|keys)\b/i.test(h)) {
    return 'generic housing/moving-box loop stock';
  }
  if (
    RANDOM_LIFESTYLE_FILLER_RE.test(h)
    && !/\b(concert|ticket|scalp|music festival|barber)\b/i.test(ctx)
  ) {
    return 'random lifestyle filler';
  }
  if (
    CAMCORDER_STOCK_LOOP_RE.test(h)
    && !/\b(cctv|surveillance|security camera|nursing home|abuse|recorded)\b/i.test(ctx)
  ) {
    return 'generic camcorder/camera-holding loop';
  }
  if (
    SCIENCE_LAB_LOOP_RE.test(h)
    && !/\b(lab|science|research|biology|chemistry|physics|experiment|study)\b/i.test(ctx)
  ) {
    return 'generic science lab loop';
  }
  if (
    PORT_FERRY_LOOP_RE.test(h)
    && !/\b(port|ferry|shipping|maritime|cargo|container|dock|freight)\b/i.test(ctx)
  ) {
    return 'generic port/ferry timelapse';
  }
  if (
    OFF_TOPIC_MEDICAL_STOCK_RE.test(h)
    && !/\b(patient|doctor|nurse|hospital|healthcare|pregnancy|clinic|medical)\b/i.test(ctx)
  ) {
    return 'off-topic medical/ultrasound stock';
  }
  if (
    CAMERA_PHONE_LOOP_RE.test(h)
    && !/\b(cctv|surveillance|podcast|recording studio|filming|documentary)\b/i.test(ctx)
  ) {
    return 'generic camera/phone filming loop';
  }
  return null;
}

/** @param {string} haystack @param {string} [contextText] */
export function isGenericStockJunk(haystack, contextText = '') {
  return Boolean(genericStockJunkReason(String(haystack || ''), String(contextText || '')));
}

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
  if (OFF_BRAND_VISUAL_RE.test(haystack) && !OFF_BRAND_VISUAL_RE.test(contextText)) {
    return 'off-brand visual (puppet/cartoon/insect)';
  }
  const junk = genericStockJunkReason(haystack, contextText);
  if (junk) return junk;
  return null;
}

/** @param {string} haystack @param {string} [contextText] */
export function isOffBrandVisual(haystack, contextText = '') {
  return Boolean(offTopicBlockReason(String(haystack || ''), String(contextText || '')));
}

/** Crime/heist topics often harvest unevenly after relevance dedupe (e.g. diamond heist). */
export function isCrimeHeistTopic(topicBlob = '') {
  const t = String(topicBlob || '');
  return (
    isHeistTopic(t)
    || /\b(robbery|robbed|stolen|jewelry|thief|burglar|smuggl|trespass)\b/i.test(t)
  );
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

/** Volume padding from top-up passes — must not be stripped by post-top-up relevance. */
export function isVolumePaddingAsset(asset) {
  const blob = `${asset?.source || ''} ${asset?.query || ''} ${asset?.id || ''}`.toLowerCase();
  return /volume top-up|stock pool|stock-video|cyber-stock|stock video pool|topup-|stock-topup-/i.test(blob);
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
  const strongTopicKws = topicKws.filter((kw) => !WEAK_TOPIC_WORDS.has(kw));
  const corpus = new Set([...strongTopicKws, ...segKeywords]);

  const haystackRaw = `${asset?.alt || ''} ${asset?.url || ''} ${asset?.sourceUrl || ''}`.toLowerCase();
  // Ignore synthetic stock-video/stock-pool queries that self-inflate relevance
  const queryText = String(asset?.query || '');
  const queryForScore = /^(stock-video|stock-pool)\b/i.test(queryText) ? '' : queryText.toLowerCase();
  const haystack = `${haystackRaw} ${queryForScore}`.trim();
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
  if (strongHits === 0) {
    if (
      isCrimeHeistTopic(topic)
      && /airport|runway|terminal|vault|safe|security|diamond|jewel|cargo|guard|heist|plane|aviation|warehouse|investigation|documentary|news/.test(
        haystack,
      )
    ) {
      return 0.35;
    }
    return 0;
  }
  if (segHits === 0 && topicHits < 2) {
    if (
      isCrimeHeistTopic(topic)
      && /airport|runway|terminal|vault|safe|security|diamond|jewel|cargo|guard|heist|plane|aviation|warehouse|investigation|documentary|news/.test(
        haystack,
      )
    ) {
      return 0.3;
    }
    return 0;
  }

  const denom = Math.min(Math.max(corpus.size, 1), 8);
  let score = strongHits / denom;

  if (asset?.type === 'video' || /\.(mp4|webm|mov)/i.test(asset?.url || '')) {
    score += 0.05;
  }
  if (queryForScore && segKeywords.some((k) => queryForScore.includes(k))) {
    score += 0.1;
  }

  return Math.max(0, Math.min(1, score));
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

    const score = scoreAssetRelevance(asset, seg, topic, topicKeywords);
    if (score >= minScore) {
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
 * Re-attach volume-padding assets dropped by relevance so per-segment counts hold.
 * @param {object[]} media
 * @param {object[]} padding
 */
export function mergeVolumePadding(media, padding, project = null) {
  let pad = padding || [];
  if (project && pad.length) {
    const filtered = filterAssetsByRelevance(pad, project, {
      minScore: isEvalColdMode() ? 0.22 : 0.18,
    });
    pad = filtered.media;
  }
  const out = [...media];
  for (const asset of pad) {
    const key = (asset.url || '').split('?')[0];
    if (!key) continue;
    if (out.some((m) => m.segmentId === asset.segmentId && (m.url || '').split('?')[0] === key)) continue;
    out.push(asset);
  }
  return out;
}

/**
 * @param {object} project
 * @param {number} minPerSegment
 */
export function evaluateHarvestVolume(project, minPerSegment = 6) {
  const segments = project.script || [];
  const topicBlob = `${project.topic || ''} ${project.title || ''}`;
  const effectiveMin = isCrimeHeistTopic(topicBlob)
    ? Math.max(3, minPerSegment - 2)
    : minPerSegment;
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
    .filter(([, v]) => v.count < effectiveMin)
    .map(([id, v]) => ({ segmentId: id, ...v, need: effectiveMin }));

  return {
    pass: failing.length === 0,
    perSegment,
    minPerSegment: effectiveMin,
    requestedMinPerSegment: minPerSegment,
    crimeHeistTopic: isCrimeHeistTopic(topicBlob),
    failing,
  };
}

/**
 * Soft-pass when curated cyber stills or stock-API motion filled a thin harvest.
 * Requires motion-rich timelines (enough videos per segment), not stills alone.
 *
 * @param {{ volumePass?: boolean, cyberStockInjected?: number, pexelsFetched?: number, pixabayFetched?: number, videoTopUp?: unknown[] }} mediaReport
 * @param {object} project
 * @returns {{ pass: boolean, reason?: string }}
 */
export function evaluateHarvestVolumeWithSoftPass(mediaReport, project) {
  if (mediaReport?.volumePass !== false) {
    return { pass: true, reason: 'volume-hard-pass' };
  }
  const segments = project?.script || [];
  const segN = segments.length || 1;
  const media = project?.media || [];
  const videoCount = media.filter((a) => a.type === 'video' || /\.mp4/i.test(a.url || '')).length;
  const videosPerSeg = videoCount / segN;
  const cyber = mediaReport.cyberStockInjected || 0;
  const stockFetched = (mediaReport.pexelsFetched || 0) + (mediaReport.pixabayFetched || 0);
  const topUp = mediaReport.videoTopUp?.length || 0;
  const volume = mediaReport.harvestQuality;
  const minPer = volume?.minPerSegment ?? 6;
  const perSeg = volume?.perSegment ? Object.values(volume.perSegment) : [];
  const counts = perSeg.map((v) => v.count);
  const minCount = counts.length ? Math.min(...counts) : 0;
  const avgCount = counts.length ? counts.reduce((s, v) => s + v, 0) / counts.length : 0;
  const topicBlob = `${project?.topic || ''} ${project?.title || ''}`;

  // Soft-pass A: cyber stills pad + at least 1 video/segment average
  if (cyber >= 6 && videosPerSeg >= 1) {
    return { pass: true, reason: `soft-pass-cyber(${cyber})` };
  }
  // Soft-pass B: stock motion rich — ≥2 videos/seg and live stock or top-up
  const motionMinPerSeg = 2;
  const motionRich = videosPerSeg >= motionMinPerSeg && (stockFetched > 0 || topUp >= segN);
  if (motionRich) {
    return { pass: true, reason: `soft-pass-motion(${videoCount}v/${segN}segs)` };
  }
  // Soft-pass C: uneven but adequate — common on crime/heist after relevance dedupe
  const aggregateOk =
    minCount >= Math.max(2, Math.floor(minPer * 0.5))
    && avgCount >= minPer * 0.75
    && media.length >= segN * Math.max(3, minPer - 2);
  if (aggregateOk) {
    return { pass: true, reason: `soft-pass-aggregate(avg=${avgCount.toFixed(1)}, min=${minCount})` };
  }
  // Soft-pass D: crime/heist with no empty segments and reasonable total fill
  if (
    isCrimeHeistTopic(topicBlob)
    && minCount >= 2
    && media.length >= segN * (minPer - 1)
  ) {
    return { pass: true, reason: `soft-pass-crime-heist(${media.length} assets/${segN} segs)` };
  }
  return { pass: false, reason: 'volume-hard-fail' };
}
