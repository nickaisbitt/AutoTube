import type { MediaCandidate } from '../media';
import type { SourceProvider, SourceProviderConfig } from './types';
import { fetchWithTimeout } from '../../utils/fetchWithTimeout';
import { logger } from '../logger';

const BASE_SCORE = 170;

export class HybridScraperProvider implements SourceProvider {
  readonly name = 'HybridScraper';
  readonly requiresKey = false;

  isAvailable(_config: SourceProviderConfig): boolean {
    return true;
  }

  async search(query: string, config: SourceProviderConfig): Promise<MediaCandidate[]> {
    try {
      const url = `/api/search-hybrid?q=${encodeURIComponent(query)}`;
      const response = await fetchWithTimeout(url, {}, {
        timeoutMs: 30_000,
        maxRetries: 1,
        signal: config.signal,
      });

      if (!response.ok) {
        logger.warn('HybridScraper', `Proxy returned HTTP ${response.status} for "${query}"`);
        return [];
      }

      const data = await response.json() as { results?: Array<{ url: string; thumbnailUrl?: string; title?: string; sourceUrl?: string; width?: number; height?: number }> };
      const items = data.results ?? [];

      const candidates: MediaCandidate[] = items.map((item) => ({
        url: item.url,
        alt: item.title || query,
        source: 'HybridScraper (Proxy)',
        sourceUrl: item.sourceUrl || item.url,
        baseScore: BASE_SCORE,
        query,
        finalScore: 0,
        type: 'image' as const,
      }));

      logger.info('HybridScraper', `Got ${candidates.length} images from proxy for "${query}"`);
      return candidates;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') throw err;
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      logger.warn('HybridScraper', `Search failed for "${query}"`, err);
      return [];
    }
  }
}
