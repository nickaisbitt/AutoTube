/**
 * Harvest quality gates: topic/segment relevance + per-segment volume.
 */
import { isAirlineTopic, isCovidTopic, isHeistTopic, isHousingTopic, isNursingHomeTopic, isWorkplaceTopic } from './topic-family.mjs';
import { isEvalColdMode } from './eval-flags.mjs';
import { isJunkWebVolumeStillUrl, isUnsafeMediaUrl } from './stock-media-urls.mjs';

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

/** Off-brand visual junk (beetles, puppets, cartoons); allowed only if topic matches. */
export const OFF_BRAND_VISUAL_RE =
  /\b(puppet|muppet|marionette|sock\s*puppet|claymation|stop[\s-]?motion|cartoon|anime|animated\s+character|animation\s+reel|minecraft|fortnite|gameplay|macro\s*insect|beetle|dung\s*beetle|insect|bug\s+macro|larva|caterpillar|spider\s+macro|ant\s+colony|wildlife\s+macro|hud\s+graphic|sci[\s-]?fi\s+hud)\b/i;

/** Blurry / soft-focus stock. */
export const BLURRY_LOW_QUALITY_RE =
  /\b(blurry|out of focus|out-of-focus|defocused|soft focus|low.?res|pixelat|grainy|unfocused)\b/i;

/** Grainy found-footage aesthetics that fight clean captions. */
export const FOUND_FOOTAGE_AESTHETIC_RE =
  /\b(found[\s-]?footage|vhs|film grain|heavy grain|noisy footage|lo-?fi video|retro camcorder aesthetic)\b/i;

/** Washed-out / overexposed stock. */
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
  /\b(camcorder|handheld (camcorder|camera)|person holding (a )?camera|holding (a )?(camcorder|camera)|vintage (video )?camera|filming with (a )?(camcorder|camera|phone)|old (video )?camera|super.?8|home movie camera)\b/i;

/** Generic corporate / architecture filler for serious investigation topics. */
export const GENERIC_CORPORATE_FILLER_RE =
  /\b(corporate handshake|team meeting smiling|empty office|business people walking|stock footage loop|generic corporate|open plan office|open-?plan|glass building skyline|architecture model|architectural model|scale model|conference room|office meeting|skyline timelapse|press conference|news desk|talking head office|office desk laptop|business handshake|coworkers laughing|modern office interior|coworking(?:\s+space)?|boardroom|executive desk|city office window|imac|people working at desks?|office interior|coworking desk|startup office|bright office daylight)\b/i;

/** Press / mic / podcast pads that read as generic explainer stock. */
export const PRESS_MIC_PODCAST_FILLER_RE =
  /\b(podcast microphone|studio microphone|condenser mic|rode mic|asmr mic|radio host desk|interview mic close.?up|microphone only|empty podcast studio|recording booth empty)\b/i;

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

/** Monochrome stock unless the topic explicitly asks for it. */
export const MONOCHROME_STOCK_RE =
  /\b(black[\s-]+and[\s-]+white|b\s*[&/]\s*w|monochrome|gr[ae]yscale)\b/i;

/** Airline life-vest demos read as overused safety-card filler. */
export const AIRLINE_SAFETY_DEMO_STOCK_RE =
  /\b(life\s*(?:vest|jacket)\s*(?:demo|demonstration|safety|instruction|tutorial)|safety\s+demonstration\s+(?:vest|life\s*(?:vest|jacket))|flight\s+attendants?\s+(?:wearing\s+)?life\s*(?:vest|jacket)|life\s*(?:vest|jacket).{0,40}(?:flight\s+attendant|cabin\s+crew|safety\s+demo))\b/i;

/** Metadata that admits generated/warped people or gibberish icons. */
export const AI_LOOKING_STOCK_RE =
  /\b(ai[\s-]?(?:generated|looking)|generated\s+by\s+ai|synthetic\s+(?:face|faces|person|people|human|humans)|uncanny\s+valley|deepfake[\s-]?(?:ish|style|looking)|melted\s+faces?|warped\s+faces?|distorted\s+faces?|deformed\s+faces?|gibberish\s+(?:vest\s+)?(?:icon|icons|text|logo|patch|symbols?)|nonsense\s+(?:text|logo|icon|icons|patch|symbols?)|fake\s+(?:face|faces|human|person|people))\b/i;

/** Overused COVID masked passenger loops outside COVID stories. */
export const COVID_MASKED_CABIN_COUPLE_RE =
  /\b(?=.*\b(covid(?:-?19)?|coronavirus|pandemic)\b)(?=.*\bmask(?:ed|s|ing)?\b)(?=.*\b(?:airplane|aircraft|plane|flight|cabin)\b)(?=.*\b(?:couple|passengers?|travellers?|travelers?)\b).+/i;

/** Dark airplane-window vignettes that usually become dead opener stock. */
export const AIRPLANE_CABIN_WINDOW_RE =
  /\b((?:airplane|aircraft|plane|flight|cabin)\s+window|window\s+(?:seat|view).{0,80}(?:airplane|aircraft|plane|flight|cabin)|(?:airplane|aircraft|plane|flight|cabin).{0,80}window\s+(?:seat|view)?)\b/i;

export const DARK_WINDOW_TONE_RE =
  /\b(night|dark|silhouette|black|shadowy|dim(?:ly)? lit|low light)\b/i;

/** Airline paperwork that is explicitly aviation/safety related, not generic desk stock. */
export const AIRLINE_DOCUMENT_EVIDENCE_RE =
  /\b(faa|f\.a\.a\.|ntsb|n\.t\.s\.b\.|aviation|aircraft|airplane|aeroplane|airline|flight|cockpit|cabin(?:[-\s]?pressure)?|oxygen\s*mask|pressure\s*gauge|cabin\s+pressure\s+gauge|maintenance\s+log|aircraft\s+maintenance|aviation\s+maintenance|airworthiness|safety\s+report|incident\s+report|pilot|flight\s+attendant|hangar|tarmac|runway)\b/i;

/** Mail and paperwork pads that routinely masquerade as airline investigation B-roll. */
export const AIRLINE_MAIL_PAPERWORK_RE =
  /\b(u\.?\s*s\.?\s*mail|usps|postal[-\s]+service|post(?:al)?[-\s]+office(?:[-\s]+box)?|p\.?\s*o\.?\s*box|mail[-\s]*box(?:es)?|mailbox(?:es)?|blue[-\s]+mailbox|letter[-\s]*box(?:es)?)\b/i;

export const AIRLINE_MAGNIFYING_DOCUMENTS_RE =
  /\b(?:magnifying[-\s]+glass|loupe)\b.{0,90}\b(documents?|paperwork|papers?|reports?|contracts?|files?|forms?|invoices?|financial|desk)\b|\b(documents?|paperwork|papers?|reports?|contracts?|files?|forms?|invoices?|financial|desk)\b.{0,90}\b(?:magnifying[-\s]+glass|loupe)\b/i;

export const AIRLINE_FINANCIAL_PAPERWORK_RE =
  /\b(financial\s+reports?|finance\s+reports?|financial\s+report\s+pads?|stock\s+(?:chart|charts|market\s+chart|market\s+charts|market\s+graph|market\s+graphs)|stock-chart|accounting\s+desk|accountant\s+desk|accounting\s+paperwork|balance\s+sheet|income\s+statement|profit\s+and\s+loss|p\s*&\s*l\s+statement|ledger|tax\s+forms?|invoice\s+paperwork|business\s+report\s+charts?|financial\s+(?:chart|charts|graph|graphs)|market\s+analysis\s+paperwork|calculator.{0,30}(?:paperwork|financial|reports?))\b/i;

export const AIRLINE_GENERIC_DESK_PAPERWORK_RE =
  /(?=.*\b(desk|desktop|office\s+table|tabletop|conference\s+table|clipboard|legal\s+pad|notepad)\b)(?=.*\b(paperwork|documents?|papers?|reports?|forms?|folders?|files?|contracts?|invoices?|spreadsheets?|charts?|report\s+pads?)\b).+/i;

function airlinePaperworkJunkReason(haystack, contextText) {
  if (!isAirlineTopic(contextText)) return null;
  if (AIRLINE_MAIL_PAPERWORK_RE.test(haystack)) return 'generic mail/postal stock for airline';
  if (AIRLINE_MAGNIFYING_DOCUMENTS_RE.test(haystack)) return 'generic magnifying-glass document stock for airline';
  if (AIRLINE_FINANCIAL_PAPERWORK_RE.test(haystack)) return 'generic financial/report paperwork for airline';
  if (AIRLINE_DOCUMENT_EVIDENCE_RE.test(haystack)) return null;
  if (AIRLINE_GENERIC_DESK_PAPERWORK_RE.test(haystack)) return 'generic desk paperwork for airline';
  return null;
}

/**
 * @param {string} haystack
 * @param {string} contextText
 * @returns {string|null}
 */
export function genericStockJunkReason(haystack, contextText = '') {
  const h = String(haystack || '');
  const ctx = String(contextText || '').toLowerCase();
  if (!h.trim()) return null;

  if (FOUND_FOOTAGE_AESTHETIC_RE.test(h)) return 'grainy/found-footage stock';
  if (BLURRY_LOW_QUALITY_RE.test(h)) return 'blurry/low-quality stock';
  if (OVEREXPOSED_STOCK_RE.test(h)) return 'overexposed/washed-out stock';
  if (AI_LOOKING_STOCK_RE.test(h)) return 'AI-looking/deepfake-ish stock';
  if (AIRLINE_SAFETY_DEMO_STOCK_RE.test(h)) return 'generic life-vest/safety-demo stock';
  if (AIRPLANE_CABIN_WINDOW_RE.test(h) && DARK_WINDOW_TONE_RE.test(h)) {
    return 'dark airplane/cabin-window stock';
  }
  const airlinePaperworkJunk = airlinePaperworkJunkReason(h, ctx);
  if (airlinePaperworkJunk) return airlinePaperworkJunk;
  if (MONOCHROME_STOCK_RE.test(h) && !MONOCHROME_STOCK_RE.test(ctx)) {
    return 'black-and-white/monochrome stock';
  }
  if (COVID_MASKED_CABIN_COUPLE_RE.test(h) && !isCovidTopic(ctx)) {
    return 'overused COVID masked airplane-cabin passenger stock';
  }
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
  if (GENERIC_CORPORATE_FILLER_RE.test(h) && !isWorkplaceTopic(ctx)) {
    return 'generic corporate/architecture filler';
  }
  if (
    PRESS_MIC_PODCAST_FILLER_RE.test(h)
    && !/\b(podcast|radio|interview|microphone|broadcast|asmr|studio)\b/i.test(ctx)
  ) {
    return 'generic press/mic/podcast filler';
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
    && !/\b(cctv|surveillance|podcast|recording studio)\b/i.test(ctx)
  ) {
    // Query text alone ("documentary") is not enough to exempt camcorder junk.
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
  if (isUnsafeMediaUrl(asset?.url || '')) return false;
  if (isJunkWebVolumeStillUrl(asset?.url || '')) return false;
  const blob = `${asset?.source || ''} ${asset?.query || ''} ${asset?.id || ''}`.toLowerCase();
  return /volume top-up|stock pool|stock-video|cyber-stock|stock video pool|topup-|stock-topup-/i.test(blob);
}

/** Synthetic harvest queries that never describe the media they fetched. */
const SYNTHETIC_QUERY_RE = /^(stock-video|stock-pool)\b/i;

const PROVIDER_ALT_PREFIX_RE =
  /^(?:pexels|pixabay|unsplash|archive\.org|mixkit|coverr)(?:\s+(?:video|photo|image|still))?\s*:\s*/i;
const PROVIDER_ALT_ONLY_RE =
  /^(?:pexels|pixabay|unsplash|archive\.org|mixkit|coverr)(?:\s+(?:video|photo|image|still))?$/i;

const CRIME_HEIST_EVIDENCE_RE =
  /airport|runway|terminal|vault|safe|security|diamond|jewel|cargo|guard|heist|plane|aviation|warehouse|investigation|documentary|news/i;
const AIRLINE_AVIATION_EVIDENCE_RE =
  /\b(airplane|aircraft|aviation|cabin|cockpit|oxygen\s*mask|hangar|runway|tarmac|boarding|flight\s*attendant|pilot\s*cockpit)\b/i;

/** The search string an asset was fetched with (synthetic pool queries dropped). */
export function assetSearchQueryText(asset) {
  const query = String(asset?.query || '').trim();
  if (!query || SYNTHETIC_QUERY_RE.test(query)) return '';
  return query.toLowerCase();
}

/**
 * What the media itself claims to show. The query used to fetch an asset is
 * excluded on purpose: providers echo the search string back into `alt`, which
 * lets a football clip certify itself as "worried passenger face". Query text
 * may only strengthen an asset that already has visual evidence.
 *
 * @param {object} asset
 * @returns {string}
 */
export function visualEvidenceBlob(asset) {
  const rawAlt = String(asset?.alt || '').trim();
  const query = assetSearchQueryText(asset);
  let alt = PROVIDER_ALT_ONLY_RE.test(rawAlt)
    ? ''
    : rawAlt.replace(PROVIDER_ALT_PREFIX_RE, '').toLowerCase();
  if (alt && query) {
    alt = alt.split(query).join(' ');
  }
  return `${alt} ${asset?.title || ''} ${asset?.sourceUrl || ''} ${asset?.url || ''} ${asset?.thumbnailUrl || ''}`
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
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

  const visual = visualEvidenceBlob(asset);
  const queryForScore = assetSearchQueryText(asset);
  if (!visual) return 0;

  const contextText = `${topic} ${segText}`.toLowerCase();
  // Junk/off-brand gates still read the query: a fetch string that admits junk fails closed.
  if (offTopicBlockReason(`${visual} ${queryForScore}`.trim(), contextText)) return 0;

  const countHits = (keywords, text) => keywords.reduce((n, kw) => (text.includes(kw) ? n + 1 : n), 0);
  const visualTopicHits = countHits(strongTopicKws, visual);
  const visualSegHits = countHits(segKeywords, visual);
  const combined = queryForScore ? `${visual} ${queryForScore}` : visual;
  const topicHits = countHits(strongTopicKws, combined);
  const segHits = countHits(segKeywords, combined);

  // The query never establishes relevance on its own — the media must show something topical.
  if (visualTopicHits + visualSegHits === 0) {
    if (isCrimeHeistTopic(topic) && CRIME_HEIST_EVIDENCE_RE.test(visual)) return 0.35;
    if (isAirlineTopic(topic) && AIRLINE_AVIATION_EVIDENCE_RE.test(visual)) return 0.4;
    return 0;
  }
  if (segHits === 0 && topicHits < 2) {
    if (isCrimeHeistTopic(topic) && CRIME_HEIST_EVIDENCE_RE.test(visual)) return 0.3;
    if (isAirlineTopic(topic) && AIRLINE_AVIATION_EVIDENCE_RE.test(visual)) return 0.35;
    return 0;
  }

  const denom = Math.min(Math.max(corpus.size, 1), 8);
  let score = (topicHits + segHits) / denom;

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
    } else if (isAirlineTopic(topic) && AIRLINE_AVIATION_EVIDENCE_RE.test(visualEvidenceBlob(asset))) {
      // Keyword essay matching misses short aviation stock alts, but the aviation
      // token has to come from the media itself — never from the search query.
      kept.push({ ...asset, relevanceScore: 0.35 });
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

/** Volume padding gets a discount on the relevance floor, never a bypass. */
export const VOLUME_PADDING_MIN_RELEVANCE = 0.2;

/**
 * Re-attach volume-padding assets dropped by relevance so per-segment counts hold.
 * @param {object[]} media
 * @param {object[]} padding
 */
export function mergeVolumePadding(media, padding, project = null) {
  let pad = padding || [];
  if (project && pad.length) {
    const topicBlob = `${project.topic || ''} ${project.title || ''}`;
    const topicKeywords = extractKeywords(topicBlob, 12);
    const segments = Object.fromEntries((project.script || []).map((s) => [s.id, s]));
    pad = pad.filter((asset) => {
      const blob = `${asset.alt || ''} ${asset.query || ''} ${asset.source || ''} ${asset.url || ''}`;
      if (isOffBrandVisual(blob, topicBlob)) return false;
      if (isGenericStockJunk(blob, topicBlob)) return false;
      // Padding must still be topical, or thin segments become a laundering channel
      // for off-topic media the relevance filter just dropped.
      const seg = segments[asset.segmentId] || project.script?.[0];
      return (
        scoreAssetRelevance(asset, seg, topicBlob, topicKeywords) >= VOLUME_PADDING_MIN_RELEVANCE
      );
    });
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
  const volumePass = mediaReport?.volumePass;
  if (volumePass === true) {
    return { pass: true, reason: 'volume-hard-pass' };
  }
  if (volumePass !== false) {
    // A missing verdict is not a pass: without a volume check there is nothing to soft-pass.
    return { pass: false, reason: 'volume-unknown-fail-closed' };
  }
  const segments = project?.script || [];
  const segN = segments.length || 1;
  const media = project?.media || [];
  const uniqueVideos = [];
  const seenVideoKeys = new Set();
  for (const asset of media) {
    if (!(asset.type === 'video' || /\.mp4/i.test(asset.url || ''))) continue;
    const key = String(asset.url || asset.id || `${asset.segmentId || ''}:${asset.alt || ''}:${asset.query || ''}`).split('?')[0];
    if (!key || seenVideoKeys.has(key)) continue;
    seenVideoKeys.add(key);
    uniqueVideos.push(asset);
  }
  const videoCount = uniqueVideos.length;
  const videosPerSeg = videoCount / segN;
  const cyber = mediaReport.cyberStockInjected || 0;
  // Archive.org is a first-class keyless motion source (airline cold eval without Pexels).
  const stockFetched =
    (mediaReport.pexelsFetched || 0)
    + (mediaReport.pixabayFetched || 0)
    + (mediaReport.archiveLiveFetched || 0);
  const topUp = mediaReport.videoTopUp?.length || 0;
  const volume = mediaReport.harvestQuality;
  const minPer = volume?.minPerSegment ?? 6;
  const perSeg = volume?.perSegment ? Object.values(volume.perSegment) : [];
  const counts = perSeg.map((v) => v.count);
  const minCount = counts.length ? Math.min(...counts) : 0;
  const avgCount = counts.length ? counts.reduce((s, v) => s + v, 0) / counts.length : 0;
  const topicBlob = `${project?.topic || ''} ${project?.title || ''}`;
  const hasStockKeys = Boolean(
    process.env.PEXELS_API_KEY
      || process.env.VITE_PEXELS_KEY
      || process.env.PIXABAY_API_KEY
      || process.env.VITE_PIXABAY_KEY,
  );
  const liveStockPresent =
    stockFetched > 0
    || uniqueVideos.some((a) =>
      /pexels|pixabay|archive\.org|Archive\.org live/i.test(`${a.source || ''} ${a.url || ''}`),
    );
  const stockKeyMotionAvailable = hasStockKeys || liveStockPresent;
  const genericJunkVideos = uniqueVideos.filter((asset) => {
    const blob = `${asset.alt || ''} ${asset.query || ''} ${asset.source || ''} ${asset.title || ''} ${asset.url || ''}`;
    return isGenericStockJunk(blob, topicBlob);
  }).length;
  const uniqueTopicalVideos = videoCount - genericJunkVideos;
  const genericJunkRatio = videoCount ? genericJunkVideos / videoCount : 0;
  if (isAirlineTopic(topicBlob)) {
    const airlineSoftFail = airlineSoftPassMotionFailureReason(project, {
      genericJunkRatio,
      genericJunkVideos,
      uniqueVideos,
      videoCount,
    });
    if (airlineSoftFail) {
      return { pass: false, reason: airlineSoftFail };
    }
    // Never soft-pass a slideshow pool — need enough unique motion for dense cuts.
    // Without Pexels/Pixabay keys the only motion source is keyless Archive.org, which
    // cannot reach the stock-key floor; drop to ~one clip per segment and charge the
    // discount to the aviation-evidence majority below.
    const stockKeyAirlineVideos = Math.max(12, segN * 2);
    const minAirlineVideos = hasStockKeys
      ? stockKeyAirlineVideos
      : Math.max(AIRLINE_KEYLESS_SOFT_PASS_MIN_VIDEOS, segN);
    if (videoCount < minAirlineVideos) {
      return {
        pass: false,
        reason: `soft-pass-motion-airline-thin(${videoCount}/${minAirlineVideos} videos)`,
      };
    }
    if (!hasStockKeys && videoCount < stockKeyAirlineVideos) {
      // A discounted pool is only earned by visual aviation evidence (alt/title/URL),
      // never by the query we searched with.
      const strongVideos = countAirlineStrongVideos(uniqueVideos);
      const strongNeeded = Math.max(
        AIRLINE_SOFT_PASS_MIN_STRONG_VIDEOS,
        Math.ceil(videoCount / 2),
      );
      if (strongVideos < strongNeeded) {
        return {
          pass: false,
          reason: `soft-pass-motion-airline-keyless-evidence(${strongVideos}/${strongNeeded} videos)`,
        };
      }
    }
    if (stockFetched > 0 || topUp >= segN || liveStockPresent) {
      return { pass: true, reason: `soft-pass-motion-airline(${videoCount}v/${segN}segs)` };
    }
    // Airline harvests are judged by the airline gate alone — falling through to the
    // generic soft-passes would let stills/aggregate counts launder an untested pool.
    return {
      pass: false,
      reason: `soft-pass-motion-airline-no-live-motion(${videoCount}v/${segN}segs)`,
    };
  }

  // No soft-pass may launder a junk-dominated video pool, whichever path would fire.
  if (videoCount > 0 && genericJunkRatio > SOFT_PASS_GENERIC_JUNK_RATIO_MAX) {
    return {
      pass: false,
      reason: `soft-pass-motion-generic-junk(${genericJunkVideos}/${videoCount} videos)`,
    };
  }

  // Soft-pass A: cyber stills + ≥1 video/seg
  if (cyber >= 6 && videosPerSeg >= 1) {
    return { pass: true, reason: `soft-pass-cyber(${cyber})` };
  }
  // Soft-pass B: ≥2 videos/seg + live stock/top-up
  const motionMinPerSeg = 2;
  const motionRich = videosPerSeg >= motionMinPerSeg && (stockFetched > 0 || topUp >= segN);
  if (motionRich) {
    if (stockKeyMotionAvailable && uniqueTopicalVideos < 16) {
      return {
        pass: false,
        reason: `soft-pass-motion-unique-video-floor(${uniqueTopicalVideos}/16 topical videos)`,
      };
    }
    return { pass: true, reason: `soft-pass-motion(${videoCount}v/${segN}segs)` };
  }
  // Soft-pass C: uneven but adequate
  const aggregateOk =
    minCount >= Math.max(2, Math.floor(minPer * 0.5))
    && avgCount >= minPer * 0.75
    && media.length >= segN * Math.max(3, minPer - 2);
  if (aggregateOk) {
    return { pass: true, reason: `soft-pass-aggregate(avg=${avgCount.toFixed(1)}, min=${minCount})` };
  }
  // Soft-pass C2 (cold): no empty segs + enough unique motion for dense cuts
  if (
    isEvalColdMode()
    && minCount >= 2
    && avgCount >= 3
    && media.length >= segN * 3
    && videoCount >= Math.max(segN * 3, 9)
    && (stockFetched > 0 || topUp > 0)
  ) {
    return { pass: true, reason: `soft-pass-cold-thin(avg=${avgCount.toFixed(1)}, min=${minCount}, v=${videoCount})` };
  }
  // Soft-pass D: crime/heist, no empty segs
  if (
    isCrimeHeistTopic(topicBlob)
    && minCount >= 2
    && media.length >= segN * (minPer - 1)
  ) {
    return { pass: true, reason: `soft-pass-crime-heist(${media.length} assets/${segN} segs)` };
  }
  return { pass: false, reason: 'volume-hard-fail' };
}

/** Shared junk ceiling for every non-airline soft-pass path. */
const SOFT_PASS_GENERIC_JUNK_RATIO_MAX = 0.4;

const AIRLINE_SOFT_PASS_MIN_STRONG_VIDEOS = 4;
/** Keyless airline runs fill from Archive.org only, so the motion floor is per-segment. */
const AIRLINE_KEYLESS_SOFT_PASS_MIN_VIDEOS = 6;
const AIRLINE_SOFT_PASS_GENERIC_JUNK_RATIO_MAX = 0.25;
const AIRLINE_SOFT_PASS_HARD_JUNK_RATIO_MAX = 0.12;

const AIRLINE_HARD_REJECT_PATTERNS = [
  {
    reason: 'medical-patient-nurse',
    pattern:
      /\b(hospital\s+patient|medical\s+patient|patient\s+(?:bed|ward|room|monitor|care)|nurses?|nursing\s+station|doctor|surgeon|surgery|icu|iv\s+drip|hospital\s+bed|ambulance\s+stretcher)\b/i,
  },
  {
    reason: 'mail-mailbox',
    pattern:
      /\b(mailbox(?:es)?|mail\s+(?:carrier|truck|delivery|sorting|room|bag|slot)|postal\s+(?:worker|truck|service|delivery)|post\s+office|letters?\s+in\s+(?:a\s+)?mailbox)\b/i,
  },
  {
    reason: 'financial-reports',
    pattern:
      /\b(financial\s+reports?|annual\s+reports?|quarterly\s+reports?|financial\s+statements?|spreadsheet\s+reports?)\b/i,
  },
];

const AIRLINE_STRONG_CABIN_RE =
  /\b(?:airplane|aircraft|plane|flight|airline)\s+cabin\b|\bcabin\s+(?:interior|pressure|altitude|crew|passengers?|oxygen|mask|overhead)\b/i;
const AIRLINE_STRONG_COCKPIT_RE = /\bcockpit\b|\bflight\s+deck\b/i;
const AIRLINE_STRONG_OXYGEN_RE = /\boxygen\s*masks?\b|\bdeployed\s+masks?\b/i;
const AIRLINE_STRONG_AIRCRAFT_RE =
  /\b(aircraft|airplane|aeroplane|plane|jet|airliner|fuselage|flight|aviation)\b/i;
const AIRLINE_STRONG_HANGAR_RE = /\bhangar\b/i;
const AIRLINE_STRONG_RUNWAY_RE = /\brunway\b|\btarmac\b/i;

function uniqueVideoAssets(media = []) {
  const uniqueVideos = [];
  const seenVideoKeys = new Set();
  for (const asset of media) {
    if (!(asset.type === 'video' || /\.mp4/i.test(asset.url || ''))) continue;
    const key = String(asset.url || asset.id || `${asset.segmentId || ''}:${asset.alt || ''}:${asset.query || ''}`).split('?')[0];
    if (!key || seenVideoKeys.has(key)) continue;
    seenVideoKeys.add(key);
    uniqueVideos.push(asset);
  }
  return uniqueVideos;
}

function airlineVideoBlob(asset = {}) {
  return `${asset.alt || ''} ${asset.title || ''} ${asset.source || ''} ${asset.sourceUrl || ''} ${asset.url || ''} ${asset.query || ''}`;
}

function airlineHardRejectReason(asset = {}) {
  const blob = airlineVideoBlob(asset);
  for (const { reason, pattern } of AIRLINE_HARD_REJECT_PATTERNS) {
    if (pattern.test(blob)) return reason;
  }
  return null;
}

function isAirlineStrongVideo(asset = {}) {
  // Rejections read the full blob (query included) so junk fails closed…
  if (
    airlineHardRejectReason(asset)
    || isGenericStockJunk(airlineVideoBlob(asset), 'airline cabin pressure')
  ) {
    return false;
  }
  // …but aviation proof has to come from the media, not the string we searched with.
  const blob = visualEvidenceBlob(asset);
  if (!blob) return false;
  if (AIRLINE_STRONG_CABIN_RE.test(blob)) return true;
  if (AIRLINE_STRONG_COCKPIT_RE.test(blob)) return true;
  if (AIRLINE_STRONG_OXYGEN_RE.test(blob)) return true;
  if (AIRLINE_STRONG_HANGAR_RE.test(blob) && AIRLINE_STRONG_AIRCRAFT_RE.test(blob)) return true;
  if (AIRLINE_STRONG_RUNWAY_RE.test(blob) && AIRLINE_STRONG_AIRCRAFT_RE.test(blob)) return true;
  if (
    /\b(airplane cabin|pilot cockpit|flight attendant airplane|passenger oxygen mask|oxygen mask deploy|maintenance hangar|mechanic tools aircraft|cabin pressure gauge|airport runway plane|aircraft maintenance|airplane|aircraft|cockpit|hangar|runway|tarmac|boarding)\b/i.test(
      blob,
    )
  ) {
    return true;
  }
  return false;
}

/**
 * Unique videos carrying real aviation visual evidence (hard-junk pads already excluded).
 *
 * @param {object[]} [uniqueVideos]
 */
export function countAirlineStrongVideos(uniqueVideos = []) {
  return uniqueVideos.filter(isAirlineStrongVideo).length;
}

export function airlineSoftPassMotionFailureReason(project, stats = {}) {
  const topicBlob = `${project?.topic || ''} ${project?.title || ''}`;
  if (!isAirlineTopic(topicBlob)) return null;

  const uniqueVideos = stats.uniqueVideos || uniqueVideoAssets(project?.media || []);
  const videoCount = stats.videoCount ?? uniqueVideos.length;

  const hardJunkVideos = uniqueVideos.filter((asset) => airlineHardRejectReason(asset));
  const hardJunkRatio = videoCount ? hardJunkVideos.length / videoCount : 0;
  // Fail closed on a junk-dominated pool, but don't nuke a clean top-up over 1–2 leftovers.
  if (
    hardJunkVideos.length >= 3
    || (videoCount > 0 && hardJunkRatio > AIRLINE_SOFT_PASS_HARD_JUNK_RATIO_MAX)
  ) {
    const reason = airlineHardRejectReason(hardJunkVideos[0]) || 'hard-junk';
    return `soft-pass-motion-airline-junk(${reason}:${hardJunkVideos.length}/${videoCount})`;
  }

  const cleanVideos = uniqueVideos.filter((asset) => !airlineHardRejectReason(asset));
  const genericJunkVideos = stats.genericJunkVideos ?? cleanVideos.filter((asset) => (
    isGenericStockJunk(airlineVideoBlob(asset), topicBlob)
  )).length;
  const cleanCount = cleanVideos.length || videoCount;
  const genericJunkRatio = stats.genericJunkRatio ?? (cleanCount ? genericJunkVideos / cleanCount : 0);
  if (genericJunkRatio > AIRLINE_SOFT_PASS_GENERIC_JUNK_RATIO_MAX) {
    return `soft-pass-motion-airline-generic-junk(${genericJunkVideos}/${cleanCount} videos)`;
  }

  const strongVideos = countAirlineStrongVideos(cleanVideos);
  if (strongVideos < AIRLINE_SOFT_PASS_MIN_STRONG_VIDEOS) {
    return `soft-pass-motion-airline-aviation-strong-floor(${strongVideos}/${AIRLINE_SOFT_PASS_MIN_STRONG_VIDEOS} videos)`;
  }

  return null;
}
