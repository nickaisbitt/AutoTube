import type { MediaCandidate } from '../media';
import type { SourceProvider, SourceProviderConfig } from './types';
import { logger } from '../logger';
import { fetchWithTimeout } from '../../utils/fetchWithTimeout';

interface DailymotionSearchResult {
  url: string;
  thumbnailUrl?: string;
  title?: string;
  duration?: number;
}

export class DailymotionProvider implements SourceProvider {
  readonly name = 'Dailymotion';
  readonly requiresKey = false;

  isAvailable(): boolean {
    return true;
  }

  async search(query: string, config: SourceProviderConfig): Promise<MediaCandidate[]> {
    try {
      const apiUrl = `/api/search-dailymotion?q=${encodeURIComponent(query)}`;
      const response = await fetchWithTimeout(apiUrl, {}, { timeoutMs: 10000, maxRetries: 1, signal: config.signal });

      if (!response.ok) {
        logger.warn('Dailymotion', `API returned status ${response.status} for "${query}"`);
        return [];
      }

      const data = await response.json();
      const results: DailymotionSearchResult[] = data.results || [];

      const candidates: MediaCandidate[] = results.map((item) => ({
        url: item.url,
        thumbnailUrl: item.thumbnailUrl,
        alt: item.title || query,
        source: 'Dailymotion',
        sourceUrl: item.url,
        baseScore: 180,
        query,
        finalScore: 0,
        type: 'video' as const,
        duration: item.duration,
      }));

      logger.info('Dailymotion', `Found ${candidates.length} videos for "${query}"`);
      return candidates;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') throw err;
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      logger.warn('Dailymotion', `Search failed for "${query}"`, err);
      return [];
    }
  }
}
