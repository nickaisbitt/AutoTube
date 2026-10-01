import type { MediaCandidate } from '../media';
import type { SourceProvider, SourceProviderConfig } from './types';
import { logger } from '../logger';
import { fetchWithTimeout } from '../../utils/fetchWithTimeout';

interface VimeoSearchResult {
  url: string;
  thumbnailUrl?: string;
  title?: string;
  duration?: string;
}

export class VimeoProvider implements SourceProvider {
  readonly name = 'Vimeo';
  readonly requiresKey = false;

  isAvailable(): boolean {
    return true;
  }

  async search(query: string, config: SourceProviderConfig): Promise<MediaCandidate[]> {
    try {
      const apiUrl = `/api/search-vimeo?q=${encodeURIComponent(query)}`;
      const response = await fetchWithTimeout(apiUrl, {}, { timeoutMs: 10000, maxRetries: 1, signal: config.signal });

      if (!response.ok) {
        logger.warn('Vimeo', `API returned status ${response.status} for "${query}"`);
        return [];
      }

      const data: { results: VimeoSearchResult[] } = await response.json();
      const results = data.results || [];

      const candidates: MediaCandidate[] = results.map((item, i) => ({
        url: item.url,
        thumbnailUrl: item.thumbnailUrl,
        alt: item.title || query,
        source: 'Vimeo',
        sourceUrl: item.url,
        baseScore: 185 - i,
        query,
        finalScore: 0,
        type: 'video' as const,
      }));

      logger.info('Vimeo', `Found ${candidates.length} videos for "${query}"`);
      return candidates;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') throw err;
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      logger.warn('Vimeo', `Search failed for "${query}"`, err);
      return [];
    }
  }
}
