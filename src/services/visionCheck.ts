// ============================================================================
// Vision Check — LLM Quality Inspection via OpenRouter
// ============================================================================

import type { MediaCandidate } from './media';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import { extractJson } from '../utils/extractJson';
import { openRouterMessageText } from '../utils/openRouterMessageText';
import { logger } from './logger';

// ---------------------------------------------------------------------------
// Hard quality threshold — candidates below this quality score are rejected
// ---------------------------------------------------------------------------

export const MIN_QUALITY_SCORE = 7; // 1-10 scale, 7+ = acceptable

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

const OPENROUTER_ENDPOINT = '/api/llm';
const VISION_MODEL = 'xiaomi/mimo-v2.5';
const VISION_TIMEOUT_MS = 20_000;
const VISION_MAX_RETRIES = 2;

export function buildVisionCheckPrompt(imageUrl: string): {
  system: string;
  user: Array<{ type: string; [key: string]: unknown }>;
} {
  const system = [
    'You are an image quality inspector for a professional video production pipeline.',
    'Your job is to REJECT low-quality images and PASS only top-quality ones.',
    '',
    'Be strict. A video shown on a big screen needs crisp, professional images.',
    '',
    'REJECT the image if ANY of these are true:',
    '  1. Blurry, out of focus, or pixelated — no discernible fine detail',
    '  2. Visible text watermarks (Shutterstock, Getty, iStock, Adobe Stock stamps)',
    '  3. Extremely low resolution — looks like a thumbnail or 480p or below',
    '  4. Heavy JPEG compression artifacts (blocky, smeared colors)',
    '  5. Screenshot of a website, social media post, or video frame',
    '  6. AI-generated image with obvious artifacts (weird hands, melted faces, garbled text)',
    '  7. Adult content or graphic violence',
    '  8. Meme format or image macros',
    '  9. Image is mostly text on a plain background (slide, document, tweet)',
    ' 10. Image contains state media branding (RT, Sputnik, CGTN, Xinhua logos)',
    ' 11. Cartoon, anime, puppet, claymation, stop-motion character, or macro insect/bug photography (unless the topic is explicitly about that)',
    '',
    'PASS the image if it is:',
    '  - A sharp, clear real-world photograph suitable for a video background',
    '  - Professional editorial or news photography',
    '  - High resolution with good lighting and composition',
    '  - An official press image, product shot, or institutional photo',
    '  - NOT an illustration, puppet, or animal-macro filler',
    '',
    'Scoring guide:',
    '  quality_score 10: Perfect — crisp, well-composed, professional, high-res',
    '  quality_score 8-9: Great — sharp, good composition, suitable for video',
    '  quality_score 7: Acceptable — decent quality, usable, minor imperfections',
    '  quality_score 5-6: Marginal — noticeable quality issues, only use if nothing better exists',
    '  quality_score 1-4: Poor — blurry, low-res, watermarked, unusable in production',
    '',
    'Return a JSON object:',
    '{"pass": true/false, "confidence": 0-100, "issues": [], "quality_signals": [], "quality_score": 1-10}',
    '',
    'Return ONLY valid JSON.',
  ].join('\n');

  const user: Array<{ type: string; [key: string]: unknown }> = [
    { type: 'text', text: 'Evaluate this image for professional video use:' },
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
 * Check if a URL is fetchable by the vision model (must be an absolute public HTTPS URL).
 */
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

function isModelFetchable(url: string): boolean {
  if (!url) return false;
  if (url.startsWith('/')) return false;
  if (url.startsWith('data:')) return false;
  if (url.startsWith('blob:')) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    const hostname = parsed.hostname.toLowerCase();
    return !UNFETCHABLE_DOMAINS.some(d => hostname.includes(d));
  } catch {
    return false;
  }
}

export async function checkCandidateVision(
  imageUrl: string,
  apiKey: string,
  options?: { signal?: AbortSignal },
): Promise<VisionCheckResult | null> {
  // Skip URLs that the model cannot fetch
  if (!isModelFetchable(imageUrl)) {
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
    const content = openRouterMessageText(data?.choices?.[0]?.message);
    if (!content) {
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
      qualityScore: typeof parsed.quality_score === 'number' ? parsed.quality_score : 3,
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
  const concurrency = options?.concurrency ?? 5;
  const results = new Map<string, VisionCheckResult>();
  const RATE_LIMIT_DELAY_MS = 200;

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

    // Rate limit between batches
    if (i + concurrency < candidates.length) {
      await new Promise((r) => setTimeout(r, RATE_LIMIT_DELAY_MS));
    }
  }

  return results;
}
