// ============================================================================
// Flickr Source Provider — Creative Commons Photography
// ============================================================================

import type { MediaCandidate } from '../media';
import type { SourceProvider, SourceProviderConfig } from './types';
import { fetchWithTimeout } from '../../utils/fetchWithTimeout';
import { logger } from '../logger';

// ---------------------------------------------------------------------------
// Flickr API response shapes
// ---------------------------------------------------------------------------

interface FlickrPhoto {
  id: string;
  owner: string;
  secret: string;
  server: string;
  farm: number;
  title: string;
  url_l?: string;
  url_o?: string;
  width_l?: string | number;
  height_l?: string | number;
  width_o?: string | number;
  height_o?: string | number;
  o_width?: string | number;
  o_height?: string | number;
  license: string;
}

interface FlickrSearchResponse {
  photos: {
    photo: FlickrPhoto[];
    total: number;
  };
  stat: string;
}

// ---------------------------------------------------------------------------
// License mapping for attribution
// ---------------------------------------------------------------------------

const LICENSE_NAMES: Record<string, string> = {
  '1': 'CC BY-NC-SA 2.0',
  '2': 'CC BY-NC 2.0',
  '3': 'CC BY-NC-ND 2.0',
  '4': 'CC BY 2.0',
  '5': 'CC BY-SA 2.0',
  '6': 'CC BY-ND 2.0',
  '9': 'CC0 1.0',
  '10': 'Public Domain Mark',
};

// ---------------------------------------------------------------------------
// Provider Implementation
// ---------------------------------------------------------------------------

export class FlickrProvider implements SourceProvider {
  readonly name = 'Flickr';
  readonly requiresKey = true;

  isAvailable(config: SourceProviderConfig): boolean {
    return Boolean(config.apiKey);
  }

  async search(query: string, config: SourceProviderConfig): Promise<MediaCandidate[]> {
    if (!config.apiKey) return [];

    try {
      const maxResults = config.maxResults ?? 15;
      const url =
        `https://api.flickr.com/services/rest/?method=flickr.photos.search` +
        `&api_key=${encodeURIComponent(config.apiKey)}` +
        `&text=${encodeURIComponent(query)}` +
        `&license=1,2,3,4,5,6,9,10` +
        `&extras=url_l,url_o,o_dims` +
        `&per_page=${maxResults}` +
        `&format=json&nojsoncallback=1` +
        `&sort=relevance`;

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
        logger.warn('Flickr', `API returned status ${response.status} for "${query}"`);
        return [];
      }

      const data: FlickrSearchResponse = await response.json();
      if (data.stat !== 'ok' || !data.photos?.photo) return [];

      const candidates: MediaCandidate[] = data.photos.photo
        .map((photo) => {
          // Prefer original URL, fall back to large
          const imageUrl = photo.url_o || photo.url_l;
          if (!imageUrl) return null;

          const width = Number(photo.o_width || photo.width_o || photo.width_l) || undefined;
          const height = Number(photo.o_height || photo.height_o || photo.height_l) || undefined;
          const licenseName = LICENSE_NAMES[photo.license] || 'CC';

          return {
            url: imageUrl,
            alt: photo.title || query,
            source: `Flickr ${licenseName}`,
            sourceUrl: `https://www.flickr.com/photos/${photo.owner}/${photo.id}`,
            width,
            height,
            baseScore: 140,
            query,
            finalScore: 0,
            type: 'image' as const,
          } satisfies MediaCandidate;
        })
        .filter((c): c is MediaCandidate => c !== null);

      logger.info('Flickr', `Found ${candidates.length} CC-licensed images for "${query}"`);
      return candidates;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') throw err;
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      logger.warn('Flickr', `Search failed for "${query}"`, err);
      return [];
    }
  }
}
