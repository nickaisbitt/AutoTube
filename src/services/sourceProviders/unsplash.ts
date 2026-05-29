import type { MediaCandidate } from '../media';
import type { SourceProvider, SourceProviderConfig } from './types';
import { fetchWithTimeout } from '../../utils/fetchWithTimeout';
import { logger } from '../logger';

export class UnsplashProvider implements SourceProvider {
  readonly name = 'Unsplash';
  readonly requiresKey = false;

  isAvailable(): boolean {
    return true;
  }

  async search(query: string, config: SourceProviderConfig): Promise<MediaCandidate[]> {
    try {
      const apiUrl = `/api/search-unsplash?q=${encodeURIComponent(query)}`;
      const response = await fetchWithTimeout(
        apiUrl,
        { headers: { 'Accept': 'application/json' } },
        {
          timeoutMs: 15_000,
          maxRetries: 1,
          signal: config.signal,
        },
      );

      if (!response.ok) return [];

      const data = await response.json();
      const items: Array<{ url: string; thumbnailUrl?: string; title?: string }> = data.results ?? [];
      const candidates: MediaCandidate[] = [];

      for (const item of items) {
        candidates.push({
          url: item.url,
          thumbnailUrl: item.thumbnailUrl,
          alt: item.title || query,
          source: 'unsplash',
          baseScore: 175,
          query,
          finalScore: 0,
          type: 'image' as const,
        });
      }

      logger.info('Unsplash', `Found ${candidates.length} images for "${query}"`);
      return candidates;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') throw err;
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      logger.warn('Unsplash', `Search failed for "${query}"`, err);
      return [];
    }
  }
}
