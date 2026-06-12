/**
 * Harvest quality gates: topic/segment relevance + per-segment volume.
 */
export { LOOP_MAX_MIN_ASSETS_PER_SEGMENT } from './assembly-system.mjs';

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
const UNRELIABLE_VIDEO_HOST_RE = /(?:tiktok\.com|vm\.tiktok|tiktokcdn\.com|instagram\.com|x\.com|twitter\.com|facebook\.com|fb\.watch|news\.artnet\.com\/art-world\/)/i;

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

/** Returns true if the asset is a Giphy GIF/loop (not an editorial video clip). */
function isGiphySource(asset = {}) {
  return (
    (asset.source || '').toLowerCase().includes('giphy')
    || /giphy\.com/i.test(`${asset.url || ''} ${asset.sourceUrl || ''}`)
  );
}

/**
 * Like countSegmentVideos but excludes Giphy loops.
 * Used for the suppressGiphy quota check so that Giphy loops can't satisfy the
 * real-video-per-segment quota and cause suppressGiphy to be prematurely cleared.
 * @param {object[]} media @param {string} segmentId
 */
export function countRealSegmentVideos(media = [], segmentId) {
  return media.filter(
    (m) => m.segmentId === segmentId && isVideoLikeAsset(m) && !isGiphySource(m),
  ).length;
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

  // Moving/lifestyle stock — noise for crime/news/heist topics
  { pattern: /\b(?:moving\s+box|cardboard\s+box|packing\s+box|selfie|couple\s+smil|new\s+home|housewarming)\b/i, requires: /\b(?:moving|relocat|real\s+estate|home\s+buy|lifestyle\s+vlog)\b/i },
  { pattern: /\b(?:yoga|workout\s+class|salon|spa\s+day|coffee\s+shop\s+lifestyle)\b/i, requires: /\b(?:fitness|wellness|yoga|lifestyle\s+blog)\b/i },

  // Talking-head lifestyle / dinner / vlog presenters — not news B-roll
  { pattern: /\b(?:what do you want for dinner|dinner tonight|cooking tutorial|recipe video|plain background presenter)\b/i, requires: /\b(?:cooking|recipe|food\s+blog|kitchen|meal\s+prep)\b/i },
  { pattern: /\b(?:woman-asking-a-question|sign-language|recording-a-video-with-her-phone|ring[\s-]?light|content\s+creator\s+setup)\b/i, requires: /\b(?:vlog|lifestyle|tutorial|how\s+to\s+film)\b/i },

  // Lifestyle desk/interview setups and yellow-shirt talking-head stock
  { pattern: /\b(?:yellow[\s-]?shirt[\s-]?(?:man|woman|person|talking|presenter|host)|talking[\s-]?head[\s-]?yellow)\b/i, requires: /\b__autotube_never__\b/i },
  { pattern: /\b(?:desk[\s-]?talking[\s-]?head|talking[\s-]?head[\s-]?desk[\s-]?setup|creator[\s-]?at[\s-]?desk|youtube[\s-]?creator[\s-]?desk|vlog[\s-]?desk[\s-]?setup)\b/i, requires: /\b(?:vlog|creator[\s-]?tips|youtube\s+tips|remote\s+work|home\s+office)\b/i },
  { pattern: /\binterview[\s-]?(?:setup|stock|background|sofa|couch|casual[\s-]?sit)\b|\bsofa[\s-]?interview[\s-]?stock\b/i, requires: /\b(?:news|journalism|interview|crime|police|politics|documentary)\b/i },

  // TikTok "how to go live" UI guides — not heist/news B-roll
  { pattern: /\b(?:how\s+to\s+go\s+live|go\s+live\s+on\s+tiktok|tiktok\s+live\s+streaming\s+guide|onestream\.live|buffer\.com\/resources\/tiktok)\b/i, requires: /\b(?:tutorial|creator\s+tips|marketing\s+guide)\b/i },

  // TikTok promo / "watch free movies" app ads — not crime B-roll
  { pattern: /\b(?:watch\s+free\s+movies?\s+on\s+tiktok|free\s+movies?\s+on\s+tiktok|tiktok\s+movies?\s+free|download\s+tiktok\s+movies?)\b/i, requires: /\b__autotube_never__\b/i },

  // TikTok lifestyle stock — people holding #tiktok signs, generic app promo
  { pattern: /\b#tiktok\b|holding.*tiktok\s+sign|tiktok\s+logo\s+sign|young\s+people.*tiktok/i, requires: /\b__autotube_never__\b/i },

  // Library/archive shelf interiors — not museum heist action B-roll
  { pattern: /\b(?:library\s+shelf|archive\s+shelf|book\s+stack|narrow\s+aisle.*shelf|rows?\s+of\s+books)\b/i, requires: /\b(?:library|book|archive|research|history\s+class)\b/i },

  // Construction scaffolding / billboard unrelated to crime story
  { pattern: /\b(?:scaffolding|construction\s+site\s+banner|building\s+renovation\s+banner|billboard\s+woman)\b/i, requires: /\b(?:construction|renovation|real\s+estate|architecture)\b/i },

  // TikTok app UI mockups / interface overlays — not heist footage
  { pattern: /\btiktok\s+(?:app\s+)?interface\b|tiktok\s+ui\s+overlay|mockup.*tiktok|phone\s+screen.*tiktok\s+logo/i, requires: /\b__autotube_never__\b/i },

  // Cyber / webinar "digital heist" promos — wrong heist for museum crime topics
  { pattern: /\b(?:strategink|digital[\s-]?heist[\s-]?summit|slideshare.*digital[\s-]?heist|data[\s-]?breach(?:es)?|cyber[\s-]?heist|protect\s+your\s+vdr)\b/i, requires: /\b(?:cyber|data\s+protection|webinar|summit|hacker|infosec)\b/i },

  // AI-generated / clipart crime illustrations — not editorial footage
  { pattern: /\bcraiyon\.com|dall[\s-]?e|midjourney|stable[\s-]?diffusion|ai[\s-]?generated|cartoon\s+heist|animated\s+heist|digital\s+illustration|clipart\s+robbery|vector\s+illustration\s+of\s+(?:a\s+)?(?:museum|heist|robbery)/i, requires: /\b__autotube_never__\b/i },

  // Smartphone/social-media lifestyle stock — noise for crime/news
  { pattern: /\b(?:smartphone[\s-]?user[\s-]?engaged|woman[\s-]?art[\s-]?iphone|social[\s-]?media\s+addict|scrolling\s+tiktok)\b/i, requires: /\b(?:phone\s+addiction|social\s+media\s+habit|lifestyle)\b/i },

  // Office/laptop lifestyle presenters — not crime B-roll
  { pattern: /\b(?:woman[\s-]?writing[\s-]?notes|working[\s-]?on[\s-]?laptop|surgical[\s-]?mask.*laptop|office\s+worker\s+stock)\b/i, requires: /\b(?:remote\s+work|office\s+life|productivity\s+tips)\b/i },

  // YouTube preview thumbnails — never editorial B-roll (i.ytimg.com/vi/*/maxresdefault)
  { pattern: /i\.ytimg\.com\/vi\/|\/maxresdefault\.|\/hqdefault\.|\/oar\d*\.jpg|\/sddefault\./i, requires: /\b__autotube_never__\b/i },

  // Other-video episode thumbnails / promo graphics scraped as images
  { pattern: /\b(?:trapping\s+series\s+ep|episode\s+\d+\s+thumbnail|mind\s+style\s+hub|slideshow|infographic)\b/i, requires: /\b(?:trapping|wildlife\s+show|podcast\s+ep)\b/i },

  // Psychology textbook / Freud slides — noise for crime/cult/news topics
  { pattern: /\b(?:freudian\s+defence|defense\s+mechanisms|psychology\s+lecture|psych\s+101)\b/i, requires: /\b(?:psychology|therapy|mental\s+health\s+course)\b/i },

  // Watermarked preview stock — never ship in final render
  { pattern: /gettyimages|shutterstock\s+watermark|alamy\s+watermark|istockphoto.*preview/i, requires: /\b__autotube_never__\b/i },

  // Musicians / creators TikTok marketing guides and social-media tutorial sites
  { pattern: /routenote\.com|musicianwave\.com|sosiakita\.com|distrokid.*tiktok|soundcharts\.com.*tiktok|artists?\s+(?:guide\s+to\s+tiktok|tiktok\s+tips)|musicians?\s+guide\s+to\s+tiktok/i, requires: /\b(?:music|musician|artist|band|singer|record[\s-]?label|indie)\b/i },

  // TikTok music trend / mashup / dance challenge — wrong TikTok for heist/crime news
  { pattern: /\btiktok\s+(?:mashup|music\s+compilation|trend\s+(?:2\d{3}|song|music)|dance\s+challenge(?:\s+\d{4})?|viral\s+(?:dance|music|song)(?:\s+\d{4})?)\b/i, requires: /\b(?:music|dance|entertainment|pop\s+culture|chart|trending\s+music)\b/i },

  // Additional AI-art generator platforms and generic AI-art terms — never editorial B-roll
  { pattern: /artbreeder\.com|nightcafe\.studio|leonardo\.ai|ideogram\.ai|playground\.ai|bing\s+image\s+creator\b|ai[\s-]?art[\s-]?generator|generative[\s-]?ai\s+(?:art|image)\b/i, requires: /\b__autotube_never__\b/i },

  // Motorcycle / vehicle stunt lifestyle stock — not crime/heist B-roll
  { pattern: /\b(?:motorcycle\s+(?:stunt|gang\s+ride|club\s+stock|rider\s+lifestyle)|dirt\s+bike\s+(?:stunt|jump\s+stock)|superbike\s+(?:racing\s+stock|photography\s+stock))\b/i, requires: /\b(?:motorcycle|biker|moto(?:rbike)?|stunt|gang)\b/i },

  // Sunset / golden-hour landscape lifestyle — noise for crime/news topics
  { pattern: /\b(?:golden\s+hour\s+(?:photography|photo)\s+stock|sunset\s+(?:silhouette|landscape)\s+(?:stock|wallpaper|background)|nature\s+landscape\s+stock\s+(?:photo|photography))\b/i, requires: /\b(?:sunset|landscape|nature|travel|outdoor|scenic|photography\s+tips)\b/i },
];

/** Landmark/region tokens that conflict with a topic's primary geography. */
const GEO_MISMATCH_RULES = [
  {
    topic: /\blouvre\b|\bparis\b|\bfrench\s+museum\b|museum\s+heist/i,
    block: /\bflorence\b|\baccademia\b|\buffizi\b|\btuscany\b|\bmichelangelo\b|\bstatue\s+of\s+david\b|\bdavid\s+statue\b|\bgalleria\s+dell[\s']?accademia\b|\brome\b|\bvatican\b|\bvenice\b|\bmilan\b|\bitaly\b/i,
    allowInAsset: /\bparis\b|\blouvre\b|\bfrance\b|\bfrench\b/i,
  },
];

/**
 * Reject assets whose geography contradicts the story location (e.g. Florence David for Louvre heist).
 * @param {string} haystack
 * @param {string} topic
 * @returns {string|null}
 */
export function geoMismatchBlockReason(haystack, topic = '') {
  const context = `${topic}`.toLowerCase();
  const h = `${haystack}`.toLowerCase();
  for (const rule of GEO_MISMATCH_RULES) {
    if (!rule.topic.test(context)) continue;
    if (rule.allowInAsset?.test(h)) continue;
    if (rule.block.test(h)) {
      return 'geo mismatch: landmark outside story location';
    }
  }
  return null;
}

/**
 * @param {string} haystack
 * @param {string} contextText
 * @returns {string|null}
 */
export function offTopicBlockReason(haystack, contextText) {
  const geo = geoMismatchBlockReason(haystack, contextText);
  if (geo) return geo;
  for (const rule of OFF_TOPIC_BLOCKLIST) {
    if (rule.pattern.test(haystack) && !rule.requires.test(contextText)) {
      return `blocklist: ${rule.pattern}`;
    }
  }
  return null;
}

/** URLs to ban after assembly fail — off-topic/lifestyle only, not editorial news images. */
export function collectAssemblyExcludeUrls(project) {
  const topic = `${project?.topic || ''} ${project?.title || ''}`.toLowerCase();
  const out = new Set();
  for (const asset of project?.media || []) {
    const haystack = `${asset?.alt || ''} ${asset?.url || ''} ${asset?.query || ''} ${asset?.sourceUrl || ''}`.toLowerCase();
    if (offTopicBlockReason(haystack, topic)) {
      const key = (asset.sourceUrl || asset.url || '').split('?')[0].toLowerCase();
      if (key) out.add(key);
    }
    if (
      /pexels\.com\/video\/(?:a-young-woman|woman-writing|ring-light|smartphone-user|woman-art-iphone)/i.test(haystack)
      || /\/video\/(?:woman|ring-light|smartphone)/i.test(haystack)
      || /i\.ytimg\.com\/vi\//i.test(haystack)
      || /routenote\.com|musicianwave\.com|sosiakita\.com|distrokid.*tiktok/i.test(haystack)
      || /\btiktok\s+(?:mashup|music\s+compilation|trend\s+2\d{3})\b/i.test(haystack)
      || /artbreeder\.com|nightcafe\.studio|ideogram\.ai|playground\.ai/i.test(haystack)
    ) {
      const key = (asset.sourceUrl || asset.url || '').split('?')[0].toLowerCase();
      if (key) out.add(key);
    }
  }
  return [...out];
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
  // When the topic has very few strong keywords (e.g. "museum heist" → only 2 after
  // filtering WEAK_TOPIC_WORDS), allow a single topic-keyword hit so that legitimate
  // editorial museum/heist images aren't dropped just because the segment's own
  // keywords are all weak words like "stream", "live", "tiktok".
  if (segHits === 0 && topicHits < 2 && corpus.size >= 3) return 0;

  const denom = Math.min(Math.max(corpus.size, 1), 8);
  let score = strongHits / denom;

  if (asset?.type === 'video' || /\.(mp4|webm|mov)/i.test(asset?.url || '') || /\/api\/download-clip/i.test(asset?.url || '')) {
    score += 0.05;
    if (/youtube|vimeo|dailymotion|videos\.pexels|news|documentary|archive\.org/i.test(haystack)) {
      score += 0.12;
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

  // Deprioritize generic tourist pyramid / plaza shots for crime/heist topics.
  if (isCrimeNewsTopic(topic) && /pyramid|france-museum-paris|tourist|plaza|aerial.*louvre|louvre.*exterior/i.test(haystack)) {
    score = Math.max(0, score - 0.2);
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
  // Crime/news topics attract more noise (webinar promos, TikTok guides, AI art) so require
  // at least 2 distinct strong-keyword hits to pass the top-up gate.
  const minHits = isCrimeNewsTopic(topic) ? 2 : 1;
  if (topicHits < minHits) return false;

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

  // Per-segment Giphy cap: keep at most 2 Giphy assets per segment so that non-Giphy
  // editorial images can dominate the pool even when suppressGiphy is false.
  const giphyPerSeg = new Map();
  const keptFiltered = [];
  const giphyDropped = [];
  for (const asset of kept) {
    const isGiphy = (asset.source || '').toLowerCase() === 'giphy';
    if (isGiphy) {
      const segCount = giphyPerSeg.get(asset.segmentId) || 0;
      if (segCount >= 2) {
        giphyDropped.push({ url: asset.url, segmentId: asset.segmentId, score: asset.relevanceScore, reason: 'giphy cap (>2/seg)' });
        continue;
      }
      giphyPerSeg.set(asset.segmentId, segCount + 1);
    }
    keptFiltered.push(asset);
  }

  return { media: keptFiltered, dropped: [...dropped, ...giphyDropped], minScore };
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

/** True when the topic is primarily a crime, heist, or law-enforcement news story. */
export function isCrimeNewsTopic(topic) {
  return /museum|heist|robbery|theft|crime|police|arrest|jewel|stolen|louvre|murder|fraud|scam|chase|surveillance|cctv/i.test(topic);
}

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

/**
 * Remove assets whose normalized URL key already appears in the global pool (cross-segment dedup).
 * Prevents the same image or video being recycled across multiple segment pools.
 * First occurrence wins (preserves the original segment assignment).
 *
 * @param {object[]} media
 * @returns {{ media: object[], dupCount: number }}
 */
export function dedupHarvestByUrl(media) {
  const seen = new Set();
  const kept = [];
  let dupCount = 0;

  for (const asset of media) {
    const raw = asset.url || '';
    // Resolve embedded source URL for proxy paths (/api/download-clip?url=...).
    const embeddedMatch = raw.match(/[?&]url=([^&]+)/i);
    const embedded = embeddedMatch
      ? (() => { try { return decodeURIComponent(embeddedMatch[1]); } catch { return embeddedMatch[1]; } })()
      : '';
    const src = (asset.sourceUrl || '').split('?')[0].toLowerCase().trim();
    const emb = embedded.split('?')[0].toLowerCase().trim();
    const bare = raw.split('?')[0].toLowerCase().trim();
    // Canonical key: embedded > sourceUrl > bare. Skip bare proxy-only paths.
    const key = (emb && !emb.includes('/api/download-clip')) ? emb
      : (src || bare);

    if (!key) { kept.push(asset); continue; }
    if (seen.has(key)) { dupCount++; continue; }
    seen.add(key);
    kept.push(asset);
  }

  return { media: kept, dupCount };
}
