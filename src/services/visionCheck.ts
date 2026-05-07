// ============================================================================
// Vision Check — Reka Edge Quality Inspection via OpenRouter
// ============================================================================

import type { MediaCandidate } from './media';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import { extractJson } from '../utils/extractJson';
import { logger } from './logger';

// ---------------------------------------------------------------------------
// Blocking & Go Criteria
// ---------------------------------------------------------------------------

export const VISION_BLOCKING_CRITERIA: string[] = [
  'visible watermarks or stock photo text overlays',
  'state media branding or logos (RT, Sputnik, CGTN, TASS, Xinhua, PressTV)',
  'meme text overlays or Impact font captions',
  'adult or graphic violence content',
  'extremely low resolution or heavily compressed/artifacted images',
  'screenshots of social media posts',
  'AI-generated images with obvious artifacts',
];

export const VISION_GO_CRITERIA: string[] = [
  'professional editorial photography',
  'high resolution and sharp detail',
  'relevant subject matter',
  'clean background or professional setting',
  'official or institutional imagery',
  'news wire quality',
];

// ---------------------------------------------------------------------------
// Result Interface
// ---------------------------------------------------------------------------

export interface VisionCheckResult {
  pass: boolean;
  confidence: number;
  issues: string[];
  qualitySignals: string[];
  qualityScore: number;
}

// ---------------------------------------------------------------------------
// Prompt Builder
// ---------------------------------------------------------------------------

const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const VISION_MODEL = 'rekaai/reka-edge';
const VISION_TIMEOUT_MS = 20_000;
const VISION_MAX_RETRIES = 2;

export function buildVisionCheckPrompt(imageUrl: string): {
  system: string;
  user: Array<{ type: string; [key: string]: unknown }>;
} {
  const system = [
    'You are an image quality inspector for a professional video production pipeline.',
    'Look at the provided image carefully and evaluate it honestly.',
    '',
    'ONLY flag an issue if you can CLEARLY SEE it in the image. Do NOT guess or assume.',
    '',
    'BLOCKING criteria (ONLY flag if you can visually confirm it):',
    '  1. Visible text watermarks overlaid on the image (e.g., "Shutterstock", "Getty", agency names stamped on the photo)',
    '  2. Visible logos of state media outlets burned into the image (RT logo, Sputnik logo, CGTN bug)',
    '  3. Meme-style text overlaid on the image (Impact font, top/bottom text format)',
    '  4. Explicit adult content or extreme graphic violence',
    '  5. Image is so blurry or pixelated that no details are discernible',
    '  6. The image is clearly a screenshot of a social media post (showing tweet UI, Facebook post UI)',
    '  7. Obvious AI generation artifacts (extra fingers, melted faces, gibberish text)',
    '',
    'IMPORTANT: Most news photos, editorial images, and stock photos should PASS.',
    'A photo having a small channel logo in the corner is NOT a watermark.',
    'A photo of a press conference is NOT state media branding.',
    'A medical or scientific image is NOT adult content.',
    '',
    'Return a JSON object:',
    '{"pass": true/false, "confidence": 0-100, "issues": [], "quality_signals": [], "quality_score": 1-10}',
    '',
    'If the image looks like a normal, usable photo, set pass to true.',
    'Return ONLY valid JSON.',
  ].join('\n');

  const user: Array<{ type: string; [key: string]: unknown }> = [
    { type: 'text', text: 'Evaluate this image:' },
    { type: 'image_url', image_url: { url: cleanImageUrl(imageUrl) } },
  ];

  return { system, user };
}

// ---------------------------------------------------------------------------
// Single Candidate Vision Check
// ---------------------------------------------------------------------------

/**
 * Strip query parameters from image URLs before sending to vision models.
 * Reka Edge cannot fetch URLs with query params (e.g., Wikimedia utm_ params).
 */
function cleanImageUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.search = '';
    return parsed.href;
  } catch {
    return url;
  }
}

/**
 * Check if a URL is fetchable by Reka Edge (must be an absolute public HTTPS URL).
 * Local proxy URLs, relative URLs, data URLs, and known hotlink-blocking domains cannot be fetched by Reka.
 */
const REKA_UNFETCHABLE_DOMAINS = [
  'vecteezy.com', 'freepik.com', 'ftcdn.net', 'adobe.com',
  'usatoday.com', 'cnn.com', 'bbc.com', 'bbc.co.uk',
  'nytimes.com', 'sky.com', '365dm.com',
  'walmartimages.com', 'aimwellbeing.com',
  'spurprotocol.com', 'techgenyz.com', 'alphacoders.com',
  'aestheticwallpapers.io', 'quotefancy.com',
  'as2.ftcdn.net', 'assets-global.website-files.com',
  'imageio.forbes.com',
];

function isRekaFetchable(url: string): boolean {
  if (!url) return false;
  if (url.startsWith('/')) return false;
  if (url.startsWith('data:')) return false;
  if (url.startsWith('blob:')) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    const hostname = parsed.hostname.toLowerCase();
    return !REKA_UNFETCHABLE_DOMAINS.some(d => hostname.includes(d));
  } catch {
    return false;
  }
}

export async function checkCandidateVision(
  imageUrl: string,
  apiKey: string,
  options?: { signal?: AbortSignal },
): Promise<VisionCheckResult | null> {
  // Skip URLs that Reka Edge cannot fetch (relative, proxy, data URLs)
  if (!isRekaFetchable(imageUrl)) {
    return null;
  }

  try {
    const { system, user } = buildVisionCheckPrompt(imageUrl);

    const body = JSON.stringify({
      model: VISION_MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    });

    const response = await fetchWithTimeout(
      OPENROUTER_ENDPOINT,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://autotube.video',
          'X-Title': 'AutoTube Vision Check',
        },
        body,
      },
      {
        timeoutMs: VISION_TIMEOUT_MS,
        maxRetries: VISION_MAX_RETRIES,
        signal: options?.signal,
      },
    );

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      logger.warn('VisionCheck', `API call failed (Status: ${response.status})`, errText);
      return null;
    }

    const data = await response.json();
    const content: unknown = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      logger.warn('VisionCheck', 'API returned empty content in response');
      return null;
    }

    // Parse the JSON response (handles fences, prose wrapping, truncation)
    const parsed = extractJson(content) as Record<string, unknown> | null;
    if (!parsed || typeof parsed !== 'object') {
      logger.warn('VisionCheck', 'JSON extraction failed, returning null');
      return null;
    }

    return {
      pass: Boolean(parsed.pass),
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
      issues: Array.isArray(parsed.issues) ? parsed.issues.map(String) : [],
      qualitySignals: Array.isArray(parsed.quality_signals) ? parsed.quality_signals.map(String) : [],
      qualityScore: typeof parsed.quality_score === 'number' ? parsed.quality_score : 5,
    };
  } catch (err) {
    // Re-throw AbortError for cancellation support
    if (err instanceof Error && err.name === 'AbortError') {
      throw err;
    }
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw err;
    }
    logger.warn('VisionCheck', `Vision check failed for ${imageUrl}`, err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Batch Vision Check
// ---------------------------------------------------------------------------

export async function batchVisionCheck(
  candidates: MediaCandidate[],
  apiKey: string,
  options?: { signal?: AbortSignal; concurrency?: number },
): Promise<Map<string, VisionCheckResult>> {
  const concurrency = options?.concurrency ?? 3;
  const results = new Map<string, VisionCheckResult>();

  // Process in batches of `concurrency`
  for (let i = 0; i < candidates.length; i += concurrency) {
    if (options?.signal?.aborted) break;

    const batch = candidates.slice(i, i + concurrency);
    const settled = await Promise.allSettled(
      batch.map((c) => checkCandidateVision(c.url, apiKey, { signal: options?.signal })),
    );

    for (let j = 0; j < settled.length; j++) {
      const result = settled[j];
      const candidate = batch[j];
      if (result.status === 'fulfilled' && result.value !== null) {
        results.set(candidate.url, result.value);
      }
    }
  }

  return results;
}
