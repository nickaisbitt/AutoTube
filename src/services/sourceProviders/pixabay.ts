// ============================================================================
// Pixabay Source Provider — Free Stock Photography
// ============================================================================

import type { MediaCandidate } from '../media';
import type { SourceProvider, SourceProviderConfig } from './types';
import { fetchWithTimeout } from '../../utils/fetchWithTimeout';
import { logger } from '../logger';

// ---------------------------------------------------------------------------
// Pixabay API response shapes
// ---------------------------------------------------------------------------

interface PixabayHit {
  id: number;
  largeImageURL: string;
  webformatURL: string;
  imageWidth: number;
  imageHeight: number;
  tags: string;
  pageURL: string;
  user: string;
}

interface PixabaySearchResponse {
  hits: PixabayHit[];
  totalHits: number;
}

// ---------------------------------------------------------------------------
// Provider Implementation
// ---------------------------------------------------------------------------

export class PixabayProvider implements SourceProvider {
  readonly name = 'Pixabay';
  readonly requiresKey = true;

  isAvailable(config: SourceProviderConfig): boolean {
    return Boolean(config.apiKey);
  }

  async search(query: string, config: SourceProviderConfig): Promise<MediaCandidate[]> {
    if (!config.apiKey) return [];

    try {
      const maxResults = config.maxResults ?? 15;
      const url = `https://pixabay.com/api/?key=${encodeURIComponent(config.apiKey)}&q=${encodeURIComponent(query)}&per_page=${maxResults}&image_type=photo`;

      const response = await fetchWithTimeout(
        url,
        {},
        {
          timeoutMs: 10_000,
          maxRetries: 1,
          signal: config.signal,
        },
      );

      if (!response.ok) {
        logger.warn('Pixabay', `API returned status ${response.status} for "${query}"`);
        return [];
      }

      const data: PixabaySearchResponse = await response.json();
      if (!data.hits || !Array.isArray(data.hits)) return [];

      const candidates: MediaCandidate[] = data.hits.map((hit) => ({
        url: hit.largeImageURL,
        thumbnailUrl: hit.webformatURL,
        alt: hit.tags || query,
        source: `Pixabay · ${hit.user}`,
        sourceUrl: hit.pageURL,
        width: hit.imageWidth,
        height: hit.imageHeight,
        baseScore: 160,
        query,
        finalScore: 0,
        type: 'image' as const,
      }));

      logger.info('Pixabay', `Found ${candidates.length} images for "${query}"`);
      return candidates;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') throw err;
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      logger.warn('Pixabay', `Search failed for "${query}"`, err);
      return [];
    }
  }
}
