// ============================================================================
// Pixabay Video Provider — Free Stock Video Clips
// ============================================================================

import type { MediaCandidate } from '../media';
import type { SourceProvider, SourceProviderConfig } from './types';
import { fetchWithTimeout } from '../../utils/fetchWithTimeout';
import { logger } from '../logger';

interface PixabayVideoHit {
  id: number;
  pageURL: string;
  tags: string;
  duration: number;
  videos: {
    large: { url: string; width: number; height: number; size: number; thumbnail: string };
    medium: { url: string; width: number; height: number; size: number; thumbnail: string };
    small: { url: string; width: number; height: number; size: number; thumbnail: string };
    tiny: { url: string; width: number; height: number; size: number; thumbnail: string };
  };
  user: string;
}

interface PixabayVideoSearchResponse {
  hits: PixabayVideoHit[];
  totalHits: number;
}

export class PixabayVideoProvider implements SourceProvider {
  readonly name = 'Pixabay Videos';
  readonly requiresKey = true;

  isAvailable(config: SourceProviderConfig): boolean {
    return Boolean(config.apiKey);
  }

  async search(query: string, config: SourceProviderConfig): Promise<MediaCandidate[]> {
    if (!config.apiKey) return [];

    try {
      const maxResults = Math.min(config.maxResults ?? 10, 20);
      const url = `https://pixabay.com/api/videos/?key=${encodeURIComponent(config.apiKey)}&q=${encodeURIComponent(query)}&per_page=${maxResults}`;

      const response = await fetchWithTimeout(
        url,
        {},
        { timeoutMs: 10_000, maxRetries: 1, signal: config.signal },
      );

      if (!response.ok) {
        logger.warn('Pixabay Videos', `API returned status ${response.status} for "${query}"`);
        return [];
      }

      const data: PixabayVideoSearchResponse = await response.json();
      if (!data.hits || !Array.isArray(data.hits)) return [];

      const candidates: MediaCandidate[] = [];

      for (const hit of data.hits) {
        // Filter: landscape, under 30s
        if (hit.duration > 30) continue;

        const vid = hit.videos.large || hit.videos.medium;
        if (!vid || !vid.url) continue;

        // Filter landscape
        if (vid.height > vid.width) continue;

        // Filter 1080p+ preferred, 720p minimum
        if (vid.width < 1280) continue;

        candidates.push({
          url: vid.url,
          thumbnailUrl: hit.videos.small?.thumbnail || hit.videos.tiny?.thumbnail,
          alt: hit.tags || query,
          source: `Pixabay Videos · ${hit.user}`,
          sourceUrl: hit.pageURL,
          width: vid.width,
          height: vid.height,
          baseScore: 170,
          query,
          finalScore: 0,
          type: 'video' as const,
          duration: hit.duration,
        });
      }

      logger.info('Pixabay Videos', `Found ${candidates.length} video clips for "${query}"`);
      return candidates;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') throw err;
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      logger.warn('Pixabay Videos', `Search failed for "${query}"`, err);
      return [];
    }
  }
}
