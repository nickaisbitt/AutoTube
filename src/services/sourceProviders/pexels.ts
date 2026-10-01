// NOTE: Not registered in index.ts. Available for future use if API keys are provided.
// ============================================================================
// Pexels Source Provider — High-Quality Stock Photography
// ============================================================================

import type { MediaCandidate } from '../media';
import type { SourceProvider, SourceProviderConfig } from './types';
import { fetchWithTimeout } from '../../utils/fetchWithTimeout';
import { logger } from '../logger';

// ---------------------------------------------------------------------------
// Pexels API response shapes
// ---------------------------------------------------------------------------

interface PexelsPhoto {
  id: number;
  width: number;
  height: number;
  url: string;
  photographer: string;
  photographer_url: string;
  alt: string;
  src: {
    original: string;
    large2x: string;
    large: string;
    medium: string;
  };
}

interface PexelsSearchResponse {
  photos: PexelsPhoto[];
  total_results: number;
}

// ---------------------------------------------------------------------------
// Provider Implementation
// ---------------------------------------------------------------------------

export class PexelsProvider implements SourceProvider {
  readonly name = 'Pexels';
  readonly requiresKey = true;

  isAvailable(config: SourceProviderConfig): boolean {
    return Boolean(config.apiKey);
  }

  async search(query: string, config: SourceProviderConfig): Promise<MediaCandidate[]> {
    if (!config.apiKey) return [];

    try {
      const maxResults = config.maxResults ?? 15;
      const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${maxResults}`;

      const response = await fetchWithTimeout(
        url,
        {
          headers: {
            Authorization: config.apiKey,
          },
        },
        {
          timeoutMs: 10_000,
          maxRetries: 1,
          signal: config.signal,
        },
      );

      if (!response.ok) {
        logger.warn('Pexels', `API returned status ${response.status} for "${query}"`);
        return [];
      }

      const data: PexelsSearchResponse = await response.json();
      if (!data.photos || !Array.isArray(data.photos)) return [];

      const candidates: MediaCandidate[] = data.photos.map((photo) => ({
        url: photo.src.original || photo.src.large2x,
        thumbnailUrl: photo.src.medium,
        alt: photo.alt || query,
        source: `Pexels · ${photo.photographer}`,
        sourceUrl: photo.url,
        width: photo.width,
        height: photo.height,
        baseScore: 95,
        query,
        finalScore: 0,
        type: 'image' as const,
      }));

      logger.info('Pexels', `Found ${candidates.length} images for "${query}"`);
      return candidates;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') throw err;
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      logger.warn('Pexels', `Search failed for "${query}"`, err);
      return [];
    }
  }
}
