import type { MediaCandidate } from '../media';
import type { SourceProvider, SourceProviderConfig } from './types';
import { fetchWithTimeout } from '../../utils/fetchWithTimeout';
import { logger } from '../logger';

interface GiphyApiResult {
  url: string;
  thumbnailUrl?: string;
  title?: string;
  sourceUrl?: string;
  width?: number;
  height?: number;
}

interface GiphyApiResponse {
  results: GiphyApiResult[];
}

export class GiphyProvider implements SourceProvider {
  readonly name = 'Giphy';
  readonly requiresKey = false;

  isAvailable(): boolean {
    return true;
  }

  async search(query: string, config: SourceProviderConfig): Promise<MediaCandidate[]> {
    try {
      const apiUrl = `/api/search-giphy?q=${encodeURIComponent(query)}`;
      const response = await fetchWithTimeout(
        apiUrl,
        {},
        {
          timeoutMs: 15_000,
          maxRetries: 1,
          signal: config.signal,
        },
      );

      if (!response.ok) return [];

      const data: GiphyApiResponse = await response.json();
      const results = data.results;
      if (!results || results.length === 0) return [];

      const candidates: MediaCandidate[] = [];

      for (const item of results) {
        candidates.push({
          url: item.url,
          thumbnailUrl: item.thumbnailUrl,
          alt: item.title || query,
          source: 'giphy',
          sourceUrl: item.sourceUrl || `https://giphy.com`,
          baseScore: 180,
          query,
          finalScore: 0,
          type: 'video' as const,
          width: item.width,
          height: item.height,
        });
      }

      logger.info('Giphy', `Found ${candidates.length} GIF videos for "${query}"`);
      return candidates;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') throw err;
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      logger.warn('Giphy', `Search failed for "${query}"`, err);
      return [];
    }
  }
}
