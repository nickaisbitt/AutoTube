/**
 * Node-side vision screening for loop harvest (browser vision is off in fast mode).
 */
import { extractStoryLocation } from './harvest-quality.mjs';

const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const VISION_TIMEOUT_MS = 22_000;
const RATE_LIMIT_DELAY_MS = 200;

const UNFETCHABLE_DOMAINS = [
  'vecteezy.com', 'freepik.com', 'ftcdn.net',
  'usatoday.com', 'cnn.com', 'bbc.com', 'bbc.co.uk',
  'nytimes.com', 'sky.com', '365dm.com',
  'walmartimages.com', 'aimwellbeing.com',
  'spurprotocol.com', 'techgenyz.com', 'alphacoders.com',
  'aestheticwallpapers.io', 'quotefancy.com',
  'as2.ftcdn.net', 'assets-global.website-files.com',
  'imageio.forbes.com',
];

function parseJSONResponse(raw) {
  let cleaned = String(raw || '').trim();
  const fence = /^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/i;
  const m = cleaned.match(fence);
  if (m) cleaned = m[1].trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}') + 1;
  if (start >= 0 && end > start) cleaned = cleaned.substring(start, end);
  return JSON.parse(cleaned);
}

function cleanImageUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.search = '';
    return parsed.href;
  } catch {
    return url;
  }
}

export function isVisionFetchableUrl(url = '') {
  if (!url) return false;
  if (url.startsWith('/') || url.startsWith('data:') || url.startsWith('blob:')) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    const host = parsed.hostname.toLowerCase();
    return !UNFETCHABLE_DOMAINS.some((d) => host.includes(d));
  } catch {
    return false;
  }
}

function visionModel() {
  return process.env.OPENROUTER_VISION_MODEL || 'openai/gpt-4o-mini';
}

function buildHarvestVisionPrompt({ topic, segmentTitle, narration, storyLocation }) {
  const system = [
    'You are a B-roll editor screening images for a short-form news video.',
    'REJECT images that would hurt assembly quality for this story.',
    '',
    'REJECT if ANY of these apply:',
    '  1. Off-topic: lifestyle vlog, dance/tutorial, app UI mockup, social-media how-to graphic',
    '  2. Wrong geography: landmark or city clearly NOT matching the story location',
    '  3. Meme, infographic slide, watermark, blurry thumbnail, or mostly text on plain background',
    '  4. Generic stock unrelated to the crime/news narrative (yoga, moving boxes, sunset landscape)',
    '  5. Fiction movie still, fan art, or AI-generated illustration',
    '',
    'PASS if the image is editorial B-roll that supports the story (museum, police, crowd, jewels, news, Paris/Louvre when relevant).',
    '',
    'Return ONLY JSON:',
    '{"pass":true/false,"relevance_score":1-10,"geo_match":true/false/null,"issues":[],"quality_score":1-10}',
    'geo_match=null when location cannot be determined.',
  ].join('\n');

  const locLine = storyLocation
    ? `Story location: ${storyLocation}. Reject images clearly showing a different country/city/landmark.`
    : 'Infer story location from topic; reject obvious geographic mismatches.';

  const userText = [
    `Topic: ${topic}`,
    segmentTitle ? `Segment: ${segmentTitle}` : '',
    narration ? `Narration excerpt: ${String(narration).slice(0, 280)}` : '',
    locLine,
    'Does this image belong in the final cut?',
  ].filter(Boolean).join('\n');

  return { system, userText };
}

/**
 * @param {string} imageUrl
 * @param {object} ctx
 * @param {string} apiKey
 */
export async function checkHarvestAssetVision(imageUrl, ctx, apiKey) {
  if (!isVisionFetchableUrl(imageUrl)) return null;

  const { system, userText } = buildHarvestVisionPrompt(ctx);
  const body = JSON.stringify({
    model: visionModel(),
    messages: [
      { role: 'system', content: system },
      {
        role: 'user',
        content: [
          { type: 'text', text: userText },
          { type: 'image_url', image_url: { url: cleanImageUrl(imageUrl) } },
        ],
      },
    ],
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VISION_TIMEOUT_MS);

  try {
    const response = await fetch(OPENROUTER_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://autotube.video',
        'X-Title': 'AutoTube Harvest Vision',
      },
      body,
      signal: controller.signal,
    });

    if (!response.ok) return null;

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) return null;

    const parsed = parseJSONResponse(content);
    const relevance = typeof parsed.relevance_score === 'number' ? parsed.relevance_score : 5;
    const quality = typeof parsed.quality_score === 'number' ? parsed.quality_score : 5;
    const geoMatch = parsed.geo_match;
    const issues = Array.isArray(parsed.issues) ? parsed.issues.map(String) : [];

    let pass = Boolean(parsed.pass);
    if (geoMatch === false) pass = false;
    if (relevance < 6) pass = false;
    if (quality < 6) pass = false;

    return { pass, relevance, quality, geoMatch, issues };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Vision-filter harvested stills before timeline build.
 * @param {object[]} media
 * @param {object} project
 * @param {{ apiKey?: string, maxScan?: number, concurrency?: number }} [options]
 */
export async function filterAssetsByVision(media, project, options = {}) {
  const apiKey = options.apiKey?.trim();
  if (!apiKey || !media?.length) {
    return { media: media || [], dropped: [], scanned: 0 };
  }

  const topic = project.topic || project.title || '';
  const storyLocation = extractStoryLocation(topic);
  const segments = Object.fromEntries((project.script || []).map((s) => [s.id, s]));
  const maxScan = options.maxScan ?? 35;
  const concurrency = options.concurrency ?? 3;

  const candidates = media
    .map((asset, idx) => ({ asset, idx }))
    .filter(({ asset }) => asset.type === 'image' && (asset.source || '') !== 'crime-fallback-stock')
    .filter(({ asset }) => isVisionFetchableUrl(asset.url || asset.thumbnailUrl))
    .slice(0, maxScan);

  const dropIdx = new Set();
  const dropped = [];
  let scanned = 0;

  for (let i = 0; i < candidates.length; i += concurrency) {
    const batch = candidates.slice(i, i + concurrency);
    const results = await Promise.all(
      batch.map(async ({ asset, idx }) => {
        const seg = segments[asset.segmentId] || project.script?.[0];
        const url = asset.url || asset.thumbnailUrl;
        const result = await checkHarvestAssetVision(url, {
          topic,
          segmentTitle: seg?.title || '',
          narration: seg?.narration || '',
          storyLocation,
        }, apiKey);
        return { asset, idx, result };
      }),
    );

    for (const { asset, idx, result } of results) {
      if (!result) continue;
      scanned += 1;
      if (!result.pass) {
        dropIdx.add(idx);
        dropped.push({
          url: asset.url,
          segmentId: asset.segmentId,
          reason: `vision reject (rel=${result.relevance}, geo=${result.geoMatch})`,
          issues: result.issues,
        });
      }
    }

    if (i + concurrency < candidates.length) {
      await new Promise((r) => setTimeout(r, RATE_LIMIT_DELAY_MS));
    }
  }

  if (!dropIdx.size) {
    return { media, dropped, scanned };
  }

  return { media: media.filter((_, idx) => !dropIdx.has(idx)), dropped, scanned };
}
