// ============================================================================
// Pexels Video Provider — HD Stock Video Clips
// ============================================================================

import type { MediaCandidate } from '../media';
import type { SourceProvider, SourceProviderConfig } from './types';
import { fetchWithTimeout } from '../../utils/fetchWithTimeout';
import { logger } from '../logger';

interface PexelsVideo {
  id: number;
  width: number;
  height: number;
  duration: number;
  url: string;
  image: string;
  video_files: Array<{
    id: number;
    quality: string;
    width: number;
    height: number;
    link: string;
  }>;
}

interface PexelsVideoSearchResponse {
  videos: PexelsVideo[];
  total_results: number;
}

export class PexelsVideoProvider implements SourceProvider {
  readonly name = 'Pexels Videos';
  readonly requiresKey = true;

  isAvailable(config: SourceProviderConfig): boolean {
    return Boolean(config.apiKey);
  }

  async search(query: string, config: SourceProviderConfig): Promise<MediaCandidate[]> {
    if (!config.apiKey) return [];

    try {
      const maxResults = Math.min(config.maxResults ?? 10, 15);
      const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=${maxResults}&size=medium`;

      const response = await fetchWithTimeout(
        url,
        { headers: { Authorization: config.apiKey } },
        { timeoutMs: 10_000, maxRetries: 1, signal: config.signal },
      );

      if (!response.ok) {
        logger.warn('Pexels Videos', `API returned status ${response.status} for "${query}"`);
        return [];
      }

      const data: PexelsVideoSearchResponse = await response.json();
      if (!data.videos || !Array.isArray(data.videos)) return [];

      const candidates: MediaCandidate[] = [];

      for (const video of data.videos) {
        // Filter: landscape, 1080p+, under 30s
        if (video.height > video.width) continue; // portrait
        if (video.duration > 30) continue;

        // Find best HD file (1080p+)
        const hdFile = video.video_files
          .filter(f => f.width >= 1920 && f.height >= 1080)
          .sort((a, b) => b.width - a.width)[0];

        if (!hdFile) continue;

        candidates.push({
          url: hdFile.link,
          thumbnailUrl: video.image,
          alt: `Pexels video: ${query}`,
          source: 'Pexels Videos',
          sourceUrl: video.url,
          width: hdFile.width,
          height: hdFile.height,
          baseScore: 90,
          query,
          finalScore: 0,
          type: 'video' as const,
          duration: video.duration,
        });
      }

      logger.info('Pexels Videos', `Found ${candidates.length} video clips for "${query}"`);
      return candidates;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') throw err;
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      logger.warn('Pexels Videos', `Search failed for "${query}"`, err);
      return [];
    }
  }
}
