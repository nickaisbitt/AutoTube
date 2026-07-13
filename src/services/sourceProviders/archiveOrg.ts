import type { MediaCandidate } from '../media';
import type { SourceProvider, SourceProviderConfig } from './types';
import { fetchWithTimeout } from '../../utils/fetchWithTimeout';
import { logger } from '../logger';




export class ArchiveOrgProvider implements SourceProvider {
  readonly name = 'Archive.org';
  readonly requiresKey = false;

  isAvailable(): boolean {
    return true;
  }

  async search(query: string, config: SourceProviderConfig): Promise<MediaCandidate[]> {
    try {
      const proxyUrl = `/api/search-archive?q=${encodeURIComponent(query)}`;

      const response = await fetchWithTimeout(
        proxyUrl,
        {},
        {
          timeoutMs: 15_000,
          maxRetries: 1,
          signal: config.signal,
        },
      );

      if (!response.ok) return [];

      const data = await response.json();
      const items: Array<{ url: string; thumbnailUrl?: string; title: string }> = data.results ?? [];

      const candidates: MediaCandidate[] = items.map((item) => ({
        url: item.url,
        alt: item.title,
        source: 'archive.org',
        sourceUrl: item.url,
        baseScore: 165,
        query,
        finalScore: 0,
        type: 'video' as const,
      }));

      logger.info('Archive.org', `Found ${candidates.length} videos for "${query}"`);
      return candidates;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') throw err;
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      logger.warn('Archive.org', `Search failed for "${query}"`, err);
      return [];
    }
  }
}
