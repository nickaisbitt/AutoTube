// ============================================================================
// Focal Cropper — Smart 16:9 Aspect Ratio Cropping via Reka Edge
// ============================================================================

import { extractJson } from '../utils/extractJson';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import { openRouterMessageText } from '../utils/openRouterMessageText';
import { logger } from './logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FocalPoint {
  x: number; // 0-1 percentage of image width
  y: number; // 0-1 percentage of image height
}

export interface CropMetadata {
  x: number;      // pixels from left
  y: number;      // pixels from top
  width: number;  // crop width in pixels
  height: number; // crop height in pixels
}

export interface FocalCropResult {
  focalPoint: FocalPoint;
  crop: CropMetadata;
  method: 'vision' | 'center';
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum aspect ratio that counts as "already 16:9 enough". */
export const ASPECT_RATIO_MIN = 1.6;

/** Maximum aspect ratio that counts as "already 16:9 enough". */
export const ASPECT_RATIO_MAX = 1.9;

/** Target aspect ratio for cropping. */
export const TARGET_ASPECT_RATIO = 16 / 9;

const OPENROUTER_ENDPOINT = '/api/llm';
const VISION_MODEL = 'xiaomi/mimo-v2.5';
const FOCAL_TIMEOUT_MS = 5_000;
const FOCAL_MAX_RETRIES = 1;

/** Domains that Reka Edge cannot fetch (hotlink-blocking, paywalled, etc.). */
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

// ---------------------------------------------------------------------------
// Pure functions
// ---------------------------------------------------------------------------

/**
 * Check if an image needs cropping based on its aspect ratio.
 * Returns true iff the aspect ratio is outside [1.6, 1.9].
 */
export function needsCropping(width: number, height: number): boolean {
  if (height <= 0 || width <= 0) return true;
  const ratio = width / height;
  return ratio < ASPECT_RATIO_MIN || ratio > ASPECT_RATIO_MAX;
}

/**
 * Compute a 16:9 crop rectangle centered on a focal point,
 * constrained to remain within image boundaries.
 * Pure function — no network calls.
 */
export function computeCropRect(
  imageWidth: number,
  imageHeight: number,
  focalPoint: FocalPoint,
): CropMetadata {
  // Determine the largest 16:9 rectangle that fits within the image
  let cropWidth: number;
  let cropHeight: number;

  if (imageWidth / imageHeight > TARGET_ASPECT_RATIO) {
    // Image is wider than 16:9 — constrain by height
    cropHeight = imageHeight;
    cropWidth = Math.round(cropHeight * TARGET_ASPECT_RATIO);
  } else {
    // Image is taller than 16:9 — constrain by width
    cropWidth = imageWidth;
    cropHeight = Math.round(cropWidth / TARGET_ASPECT_RATIO);
  }

  // Ensure crop dimensions don't exceed image dimensions
  cropWidth = Math.min(cropWidth, imageWidth);
  cropHeight = Math.min(cropHeight, imageHeight);

  // Center the crop on the focal point
  const focalX = focalPoint.x * imageWidth;
  const focalY = focalPoint.y * imageHeight;

  let x = Math.round(focalX - cropWidth / 2);
  let y = Math.round(focalY - cropHeight / 2);

  // Constrain within image bounds
  x = Math.max(0, Math.min(x, imageWidth - cropWidth));
  y = Math.max(0, Math.min(y, imageHeight - cropHeight));

  return { x, y, width: cropWidth, height: cropHeight };
}

/**
 * Compute a center-crop rectangle (fallback when vision model is unavailable).
 * Pure function.
 */
export function computeCenterCrop(
  imageWidth: number,
  imageHeight: number,
): CropMetadata {
  return computeCropRect(imageWidth, imageHeight, { x: 0.5, y: 0.5 });
}

// ---------------------------------------------------------------------------
// Focal point detection via Reka Edge
// ---------------------------------------------------------------------------

/**
 * Strip query parameters from image URLs before sending to vision models.
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
 * Detect the focal point of an image using Reka Edge vision model.
 * Returns null if the API is unavailable or fails.
 * Completes within 5 seconds (timeout enforced).
 */
export async function detectFocalPoint(
  imageUrl: string,
  apiKey: string,
  options?: { signal?: AbortSignal },
): Promise<FocalPoint | null> {
  // Skip URLs that Reka Edge cannot fetch
  const cleaned = cleanImageUrl(imageUrl);
  if (!cleaned.startsWith('http')) return null;

  // Skip domains that Reka Edge cannot access (hotlink-blocking, paywalled, etc.)
  try {
    const hostname = new URL(cleaned).hostname.toLowerCase();
    if (REKA_UNFETCHABLE_DOMAINS.some(d => hostname.includes(d))) return null;
  } catch {
    return null;
  }

  try {
    const system = [
      'You are an image analysis assistant for a video production pipeline.',
      'Identify the primary focal point (main subject) of the provided image.',
      '',
      'Return ONLY a JSON object with x and y coordinates as percentages (0 to 1):',
      '{"x": 0.5, "y": 0.3}',
      '',
      'Where x=0 is the left edge, x=1 is the right edge,',
      'y=0 is the top edge, y=1 is the bottom edge.',
      '',
      'Focus on the most important subject: faces, key objects, or text.',
      'Return ONLY valid JSON, no markdown fences or extra text.',
    ].join('\n');

    const user = [
      { type: 'text', text: 'Identify the focal point of this image:' },
      { type: 'image_url', image_url: { url: cleanImageUrl(imageUrl) } },
    ];

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
          'X-Title': 'AutoTube Focal Cropper',
        },
        body,
      },
      {
        timeoutMs: FOCAL_TIMEOUT_MS,
        maxRetries: FOCAL_MAX_RETRIES,
        signal: options?.signal,
      },
    );

    if (!response.ok) {
      logger.warn('FocalCropper', `API call failed (Status: ${response.status})`);
      return null;
    }

    const data = await response.json();
    const content = openRouterMessageText(data?.choices?.[0]?.message);
    if (!content) {
      logger.warn('FocalCropper', 'API returned empty content');
      return null;
    }

    // Parse the JSON response using robust extraction
    const parsed = extractJson(content.trim()) as Record<string, unknown> | null;
    if (!parsed || typeof parsed !== 'object') return null;

    const x = typeof parsed.x === 'number' ? Math.max(0, Math.min(1, parsed.x)) : 0.5;
    const y = typeof parsed.y === 'number' ? Math.max(0, Math.min(1, parsed.y)) : 0.5;

    return { x, y };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') throw err;
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    logger.warn('FocalCropper', `Focal point detection failed for ${imageUrl}`, err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Full pipeline
// ---------------------------------------------------------------------------

/**
 * Full focal crop pipeline: detect focal point → compute crop.
 * Falls back to center-crop if vision model is unavailable.
 */
export async function focalCrop(
  imageUrl: string,
  imageWidth: number,
  imageHeight: number,
  apiKey: string,
  options?: { signal?: AbortSignal },
): Promise<FocalCropResult> {
  // Try vision-based focal point detection
  if (apiKey) {
    const focalPoint = await detectFocalPoint(imageUrl, apiKey, options);
    if (focalPoint) {
      const crop = computeCropRect(imageWidth, imageHeight, focalPoint);
      return { focalPoint, crop, method: 'vision' };
    }
  }

  // Fallback to center crop
  const centerPoint: FocalPoint = { x: 0.5, y: 0.5 };
  const crop = computeCenterCrop(imageWidth, imageHeight);
  return { focalPoint: centerPoint, crop, method: 'center' };
}
