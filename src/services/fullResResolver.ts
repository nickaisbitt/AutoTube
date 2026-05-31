// ============================================================================
// Full-Resolution URL Resolver — Extracts HD images from source pages
// ============================================================================

import type { MediaCandidate } from './media';
import { MediaCache } from './mediaCache';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import { logger } from './logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ResolveResult {
  resolvedUrl: string;
  width?: number;
  height?: number;
  changed: boolean;
}

export interface ResolverOptions {
  signal?: AbortSignal;
  cache?: MediaCache;
  /** Max concurrent requests to the same domain. Default: 2 */
  domainConcurrency?: number;
  /** Timeout per page fetch in ms. Default: 8000 */
  timeoutMs?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_DOMAIN_CONCURRENCY = 2;
const ROBOTS_TIMEOUT_MS = 3_000;
const MIN_USEFUL_WIDTH = 1200;

// ---------------------------------------------------------------------------
// robots.txt cache (session-scoped)
// ---------------------------------------------------------------------------

const robotsCache = new Map<string, boolean>();

/**
 * Check robots.txt for a domain. Returns true if fetching is allowed.
 * Results are cached for the session. Returns true (allowed) on failure.
 */
export async function checkRobotsTxt(
  domain: string,
  options?: { signal?: AbortSignal; timeoutMs?: number },
): Promise<boolean> {
  const cached = robotsCache.get(domain);
  if (cached !== undefined) return cached;

  try {
    const url = `/api/proxy-page?url=${encodeURIComponent(`https://${domain}/robots.txt`)}`;
    const response = await fetchWithTimeout(
      url,
      {},
      {
        timeoutMs: options?.timeoutMs ?? ROBOTS_TIMEOUT_MS,
        maxRetries: 1,
        signal: options?.signal,
      },
    );

    if (!response.ok) {
      // No robots.txt or error — assume allowed
      robotsCache.set(domain, true);
      return true;
    }

    const text = await response.text();

    // Simple robots.txt parser: check if our user-agent or * is disallowed from /
    const lines = text.split('\n');
    let inRelevantBlock = false;
    let allowed = true;

    for (const rawLine of lines) {
      const line = rawLine.trim().toLowerCase();
      if (line.startsWith('user-agent:')) {
        const agent = line.substring('user-agent:'.length).trim();
        inRelevantBlock = agent === '*' || agent.includes('autotube');
      } else if (inRelevantBlock && line.startsWith('disallow:')) {
        const path = line.substring('disallow:'.length).trim();
        if (path === '/' || path === '/*') {
          allowed = false;
          break;
        }
      }
    }

    robotsCache.set(domain, allowed);
    logger.info('Resolver', `robots.txt for ${domain}: ${allowed ? 'allowed' : 'blocked'}`);
    return allowed;
  } catch (err) {
    // On failure, assume allowed (permissive default)
    if (err instanceof Error && err.name === 'AbortError') throw err;
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    robotsCache.set(domain, true);
    return true;
  }
}

// ---------------------------------------------------------------------------
// WordPress dimension stripping
// ---------------------------------------------------------------------------

/**
 * Strip WordPress dimension suffixes from image URLs.
 * e.g., "photo-1024x768.jpg" → "photo.jpg"
 * Idempotent: applying twice produces the same result as once.
 */
export function stripWordPressDimensions(url: string): string {
  // Match -NNNxNNN before the file extension
  return url.replace(/-\d+x\d+(\.\w+)(?=$|\?|#)/, '$1');
}

// ---------------------------------------------------------------------------
// srcset parser
// ---------------------------------------------------------------------------

/**
 * Parse a srcset attribute string and return the URL with the largest width descriptor.
 */
export function parseSrcset(srcset: string): { url: string; width: number } | null {
  const entries: Array<{ url: string; width: number }> = [];

  const parts = srcset.split(',').map((s) => s.trim()).filter(Boolean);
  for (const part of parts) {
    const tokens = part.split(/\s+/);
    if (tokens.length < 2) continue;
    const url = tokens[0];
    const descriptor = tokens[tokens.length - 1];
    const widthMatch = descriptor.match(/^(\d+)w$/);
    if (widthMatch) {
      entries.push({ url, width: parseInt(widthMatch[1], 10) });
    }
  }

  if (entries.length === 0) return null;

  // Return the entry with the largest width
  entries.sort((a, b) => b.width - a.width);
  return entries[0];
}

// ---------------------------------------------------------------------------
// HTML extraction — pure function
// ---------------------------------------------------------------------------

/**
 * Extract the highest-resolution image URL from an HTML document string.
 * Pure function — no network calls.
 *
 * Resolution strategy (in order of priority):
 * 1. Parse <meta property="og:image"> for hero image
 * 2. Parse srcset attributes, select largest width descriptor
 * 3. Parse JSON-LD structured data for image objects
 * 4. Find <img> elements ≥1200px wide within article body
 *
 * Returns the best candidate or null if no upgrade found.
 */
export function extractBestImageUrl(
  html: string,
  _originalUrl: string,
  baseUrl: string,
): { url: string; width?: number; height?: number } | null {
  const candidates: Array<{ url: string; width?: number; height?: number; priority: number }> = [];

  // Strategy 1: og:image meta tags
  const ogImageRegex = /<meta\s+[^>]*?(?:property|name)=["']og:image["'][^>]*?content=["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = ogImageRegex.exec(html)) !== null) {
    const resolved = resolveUrl(match[1], baseUrl);
    if (resolved) {
      candidates.push({ url: resolved, priority: 100 });
    }
  }
  // Also try content-first order
  const ogImageRegex2 = /<meta\s+[^>]*?content=["']([^"']+)["'][^>]*?(?:property|name)=["']og:image["']/gi;
  while ((match = ogImageRegex2.exec(html)) !== null) {
    const resolved = resolveUrl(match[1], baseUrl);
    if (resolved) {
      candidates.push({ url: resolved, priority: 100 });
    }
  }

  // og:image:width / og:image:height
  const ogWidthMatch = html.match(/<meta\s+[^>]*?(?:property|name)=["']og:image:width["'][^>]*?content=["'](\d+)["']/i)
    || html.match(/<meta\s+[^>]*?content=["'](\d+)["'][^>]*?(?:property|name)=["']og:image:width["']/i);
  const ogHeightMatch = html.match(/<meta\s+[^>]*?(?:property|name)=["']og:image:height["'][^>]*?content=["'](\d+)["']/i)
    || html.match(/<meta\s+[^>]*?content=["'](\d+)["'][^>]*?(?:property|name)=["']og:image:height["']/i);

  if (ogWidthMatch && ogHeightMatch && candidates.length > 0) {
    const ogCandidate = candidates[candidates.length - 1];
    ogCandidate.width = parseInt(ogWidthMatch[1], 10);
    ogCandidate.height = parseInt(ogHeightMatch[1], 10);
  }

  // Strategy 2: srcset attributes
  const srcsetRegex = /srcset=["']([^"']+)["']/gi;
  while ((match = srcsetRegex.exec(html)) !== null) {
    const best = parseSrcset(match[1]);
    if (best && best.width >= MIN_USEFUL_WIDTH) {
      const resolved = resolveUrl(best.url, baseUrl);
      if (resolved) {
        candidates.push({ url: resolved, width: best.width, priority: 90 });
      }
    }
  }

  // Strategy 3: JSON-LD structured data
  const jsonLdRegex = /<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  while ((match = jsonLdRegex.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1]);
      const images = extractJsonLdImages(data);
      for (const img of images) {
        const resolved = resolveUrl(img, baseUrl);
        if (resolved) {
          candidates.push({ url: resolved, priority: 80 });
        }
      }
    } catch {
      // Invalid JSON-LD — skip
    }
  }

  // Strategy 4: <img> tags with width ≥ 1200px
  const imgRegex = /<img\s+[^>]*?src=["']([^"']+)["'][^>]*?>/gi;
  while ((match = imgRegex.exec(html)) !== null) {
    const tag = match[0];
    const src = match[1];
    const widthMatch = tag.match(/width=["']?(\d+)/i);
    const width = widthMatch ? parseInt(widthMatch[1], 10) : undefined;
    const heightMatch = tag.match(/height=["']?(\d+)/i);
    const height = heightMatch ? parseInt(heightMatch[1], 10) : undefined;

    if (width && width >= MIN_USEFUL_WIDTH) {
      const resolved = resolveUrl(src, baseUrl);
      if (resolved) {
        candidates.push({ url: resolved, width, height, priority: 70 });
      }
    }

    // Also check srcset on this img tag
    const imgSrcsetMatch = tag.match(/srcset=["']([^"']+)["']/i);
    if (imgSrcsetMatch) {
      const best = parseSrcset(imgSrcsetMatch[1]);
      if (best && best.width >= MIN_USEFUL_WIDTH) {
        const resolved = resolveUrl(best.url, baseUrl);
        if (resolved) {
          candidates.push({ url: resolved, width: best.width, priority: 85 });
        }
      }
    }
  }

  if (candidates.length === 0) return null;

  // Sort by: priority first, then by width (largest wins)
  candidates.sort((a, b) => {
    if (a.priority !== b.priority) return b.priority - a.priority;
    return (b.width ?? 0) - (a.width ?? 0);
  });

  // Apply WordPress dimension stripping to the best candidate
  const best = candidates[0];
  best.url = stripWordPressDimensions(best.url);

  return { url: best.url, width: best.width, height: best.height };
}

// ---------------------------------------------------------------------------
// Single candidate resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a single candidate's full-resolution URL from its source page.
 * Falls back to original URL if source page is unreachable or no upgrade found.
 */
export async function resolveFullResolution(
  candidate: MediaCandidate,
  options?: ResolverOptions,
): Promise<ResolveResult> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const originalUrl = candidate.url;

  // Need a sourceUrl to resolve from
  if (!candidate.sourceUrl) {
    return { resolvedUrl: originalUrl, changed: false };
  }

  // Check cache first
  if (options?.cache) {
    const cached = options.cache.getCachedResolution(originalUrl);
    if (cached) return cached;
  }

  try {
    // Extract domain for robots.txt check
    const domain = new URL(candidate.sourceUrl).hostname;
    const allowed = await checkRobotsTxt(domain, { signal: options?.signal });
    if (!allowed) {
      logger.info('Resolver', `Skipping ${domain} — blocked by robots.txt`);
      return { resolvedUrl: originalUrl, changed: false };
    }

    // Fetch the source page via the dev server proxy to avoid CORS
    const proxyUrl = `/api/proxy-page?url=${encodeURIComponent(candidate.sourceUrl)}`;
    const response = await fetchWithTimeout(
      proxyUrl,
      {},
      {
        timeoutMs,
        maxRetries: 1,
        signal: options?.signal,
      },
    );

    if (!response.ok) {
      return { resolvedUrl: originalUrl, changed: false };
    }

    const html = await response.text();
    const baseUrl = candidate.sourceUrl;

    // Try to extract a better image URL
    const extracted = extractBestImageUrl(html, originalUrl, baseUrl);

    if (extracted && extracted.url !== originalUrl) {
      const result: ResolveResult = {
        resolvedUrl: extracted.url,
        width: extracted.width,
        height: extracted.height,
        changed: true,
      };

      // Cache the result
      if (options?.cache) {
        options.cache.setCachedResolution(originalUrl, result);
      }

      logger.info('Resolver', `Upgraded: ${originalUrl} → ${extracted.url}`);
      return result;
    }

    // No upgrade found — return original
    const noChange: ResolveResult = { resolvedUrl: originalUrl, changed: false };
    if (options?.cache) {
      options.cache.setCachedResolution(originalUrl, noChange);
    }
    return noChange;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') throw err;
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    logger.warn('Resolver', `Failed to resolve ${originalUrl}`, err);
    return { resolvedUrl: originalUrl, changed: false };
  }
}

// ---------------------------------------------------------------------------
// Batch resolution with per-domain rate limiting
// ---------------------------------------------------------------------------

/**
 * Batch-resolve the top N candidates with per-domain rate limiting.
 * Respects robots.txt before fetching each domain.
 */
export async function batchResolve(
  candidates: MediaCandidate[],
  options?: ResolverOptions,
): Promise<Map<string, ResolveResult>> {
  const maxConcurrency = options?.domainConcurrency ?? DEFAULT_DOMAIN_CONCURRENCY;
  const results = new Map<string, ResolveResult>();

  // Process each domain's queue with concurrency limit
  const domainSemaphores = new Map<string, number>();

  const resolveWithLimit = async (candidate: MediaCandidate): Promise<void> => {
    const domain = extractDomain(candidate.sourceUrl || candidate.url);

    // Wait for a slot in the domain semaphore
    while ((domainSemaphores.get(domain) ?? 0) >= maxConcurrency) {
      await new Promise((r) => setTimeout(r, 100));
      if (options?.signal?.aborted) return;
    }

    domainSemaphores.set(domain, (domainSemaphores.get(domain) ?? 0) + 1);

    try {
      const result = await resolveFullResolution(candidate, options);
      results.set(candidate.url, result);
    } finally {
      domainSemaphores.set(domain, (domainSemaphores.get(domain) ?? 0) - 1);
    }
  };

  // Run all resolutions in parallel (domain concurrency is enforced internally)
  await Promise.allSettled(candidates.map(resolveWithLimit));

  return results;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Resolve a potentially relative URL against a base URL.
 */
function resolveUrl(url: string, baseUrl: string): string | null {
  try {
    return new URL(url, baseUrl).href;
  } catch {
    return null;
  }
}

/**
 * Extract domain from a URL string.
 */
function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return 'unknown';
  }
}

/**
 * Extract image URLs from JSON-LD structured data.
 */
function extractJsonLdImages(data: unknown): string[] {
  const images: string[] = [];

  if (!data || typeof data !== 'object') return images;

  if (Array.isArray(data)) {
    for (const item of data) {
      images.push(...extractJsonLdImages(item));
    }
    return images;
  }

  const obj = data as Record<string, unknown>;

  // Check for image property
  if (typeof obj.image === 'string') {
    images.push(obj.image);
  } else if (Array.isArray(obj.image)) {
    for (const img of obj.image) {
      if (typeof img === 'string') {
        images.push(img);
      } else if (img && typeof img === 'object' && typeof (img as Record<string, unknown>).url === 'string') {
        images.push((img as Record<string, unknown>).url as string);
      }
    }
  } else if (obj.image && typeof obj.image === 'object') {
    const imgObj = obj.image as Record<string, unknown>;
    if (typeof imgObj.url === 'string') {
      images.push(imgObj.url);
    }
  }

  // Check for thumbnailUrl
  if (typeof obj.thumbnailUrl === 'string') {
    images.push(obj.thumbnailUrl);
  }

  // Recurse into @graph
  if (Array.isArray(obj['@graph'])) {
    for (const item of obj['@graph']) {
      images.push(...extractJsonLdImages(item));
    }
  }

  return images;
}
