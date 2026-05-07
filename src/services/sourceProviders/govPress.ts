// ============================================================================
// Government Press Source Provider — Public Domain Official Photography
// ============================================================================

import type { MediaCandidate } from '../media';
import type { SourceProvider, SourceProviderConfig } from './types';
import { fetchWithTimeout } from '../../utils/fetchWithTimeout';
import { logger } from '../logger';

// ---------------------------------------------------------------------------
// Topic keyword matching for activation
// ---------------------------------------------------------------------------

const POLITICAL_KEYWORDS = [
  'president', 'congress', 'senate', 'parliament', 'election', 'vote',
  'democrat', 'republican', 'legislation', 'law', 'policy', 'governor',
  'mayor', 'cabinet', 'white house', 'capitol', 'political', 'politics',
  'diplomat', 'diplomacy', 'ambassador', 'summit', 'treaty',
];

const MILITARY_KEYWORDS = [
  'military', 'army', 'navy', 'air force', 'marine', 'defense', 'defence',
  'pentagon', 'nato', 'war', 'conflict', 'troops', 'soldier', 'weapon',
  'missile', 'nuclear', 'aircraft', 'carrier', 'submarine', 'tank',
  'veteran', 'deployment', 'operation', 'strike', 'drone',
];

const INTERNATIONAL_KEYWORDS = [
  'united nations', 'un ', 'g7', 'g20', 'eu ', 'european union',
  'sanctions', 'trade war', 'tariff', 'embargo', 'foreign affairs',
  'geopolitics', 'international', 'bilateral', 'multilateral',
  'alliance', 'coalition', 'peacekeeping', 'humanitarian',
];

const ALL_KEYWORDS = [...POLITICAL_KEYWORDS, ...MILITARY_KEYWORDS, ...INTERNATIONAL_KEYWORDS];

/**
 * Check if a query matches political/military/international topics.
 */
function isRelevantTopic(query: string): boolean {
  const lower = query.toLowerCase();
  return ALL_KEYWORDS.some((kw) => lower.includes(kw));
}

// ---------------------------------------------------------------------------
// Government photo archive sites
// ---------------------------------------------------------------------------

const GOV_SITES = [
  'defense.gov',
  'whitehouse.gov',
  'nato.int',
  'state.gov',
  'army.mil',
  'navy.mil',
  'af.mil',
];

// ---------------------------------------------------------------------------
// HTML parsing helpers
// ---------------------------------------------------------------------------

/**
 * Extract image URLs from Open Graph meta tags and img tags in HTML.
 */
function extractImagesFromHtml(html: string, baseUrl: string): string[] {
  const images: string[] = [];

  // Extract og:image
  const ogRegex = /<meta\s+(?:[^>]*?)property=["']og:image["']\s+(?:[^>]*?)content=["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = ogRegex.exec(html)) !== null) {
    images.push(match[1]);
  }

  // Also try content before property order
  const ogRegex2 = /<meta\s+(?:[^>]*?)content=["']([^"']+)["']\s+(?:[^>]*?)property=["']og:image["']/gi;
  while ((match = ogRegex2.exec(html)) !== null) {
    images.push(match[1]);
  }

  // Extract large img tags (likely editorial photos)
  const imgRegex = /<img\s+[^>]*src=["']([^"']+)["'][^>]*>/gi;
  while ((match = imgRegex.exec(html)) !== null) {
    const src = match[1];
    if (src && (src.includes('.jpg') || src.includes('.jpeg') || src.includes('.png') || src.includes('.webp'))) {
      // Resolve relative URLs
      try {
        const resolved = new URL(src, baseUrl).href;
        images.push(resolved);
      } catch {
        // Skip invalid URLs
      }
    }
  }

  return images;
}

// ---------------------------------------------------------------------------
// Provider Implementation
// ---------------------------------------------------------------------------

export class GovPressProvider implements SourceProvider {
  readonly name = 'Government Press';
  readonly requiresKey = false;

  isAvailable(): boolean {
    return true;
  }

  async search(query: string, config: SourceProviderConfig): Promise<MediaCandidate[]> {
    // Only activate for relevant topics
    if (!isRelevantTopic(query)) {
      return [];
    }

    const candidates: MediaCandidate[] = [];

    // Use DuckDuckGo proxy with site-specific queries for each gov site
    const siteQueries = GOV_SITES.slice(0, 3).map((site) =>
      this.searchSite(query, site, config),
    );

    const results = await Promise.allSettled(siteQueries);
    for (const result of results) {
      if (result.status === 'fulfilled') {
        candidates.push(...result.value);
      }
    }

    logger.info('GovPress', `Found ${candidates.length} government press images for "${query}"`);
    return candidates;
  }

  private async searchSite(
    query: string,
    site: string,
    config: SourceProviderConfig,
  ): Promise<MediaCandidate[]> {
    try {
      const searchQuery = `site:${site} ${query} photo`;
      const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(searchQuery)}`;

      const response = await fetchWithTimeout(
        url,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; AutoTube/1.0)',
          },
        },
        {
          timeoutMs: 10_000,
          maxRetries: 1,
          signal: config.signal,
        },
      );

      if (!response.ok) return [];

      const html = await response.text();

      // Extract result URLs from DDG HTML results
      const resultUrls: string[] = [];
      const linkRegex = /href=["'](?:\/\/duckduckgo\.com\/l\/\?uddg=)?([^"'&]+)/gi;
      let match: RegExpExecArray | null;
      while ((match = linkRegex.exec(html)) !== null) {
        try {
          const decoded = decodeURIComponent(match[1]);
          if (decoded.includes(site)) {
            resultUrls.push(decoded);
          }
        } catch {
          // Skip malformed URLs
        }
      }

      // For each result page, try to extract images from OG tags
      const candidates: MediaCandidate[] = [];
      const pagesToCheck = resultUrls.slice(0, 3);

      for (const pageUrl of pagesToCheck) {
        try {
          const pageResponse = await fetchWithTimeout(
            pageUrl,
            {
              headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; AutoTube/1.0)',
              },
            },
            {
              timeoutMs: 8_000,
              maxRetries: 1,
              signal: config.signal,
            },
          );

          if (!pageResponse.ok) continue;

          const pageHtml = await pageResponse.text();
          const images = extractImagesFromHtml(pageHtml, pageUrl);

          for (const imageUrl of images.slice(0, 2)) {
            candidates.push({
              url: imageUrl,
              alt: `${site} — ${query}`,
              source: `Government · ${site}`,
              sourceUrl: pageUrl,
              baseScore: 150,
              query,
              finalScore: 0,
              type: 'image' as const,
            });
          }
        } catch {
          // Skip failed page fetches
        }
      }

      return candidates;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') throw err;
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      logger.warn('GovPress', `Site search failed for ${site}`, err);
      return [];
    }
  }
}
