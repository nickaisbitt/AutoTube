import type { MediaCandidate } from '../media';
import type { SourceProvider, SourceProviderConfig } from './types';
import { fetchWithTimeout } from '../../utils/fetchWithTimeout';
import { logger } from '../logger';

const SPACE_KEYWORDS = [
  'space', 'nasa', 'planet', 'star', 'galaxy', 'universe', 'cosmos',
  'astronaut', 'rocket', 'satellite', 'orbit', 'mars', 'moon', 'jupiter',
  'saturn', 'nebula', 'asteroid', 'comet', 'telescope', 'hubble', 'webb',
  'iss', 'spacecraft', 'launch', 'mission', 'astronomy', 'astrophysics',
  'science', 'technology', 'tech', 'robot', 'ai', 'quantum', 'physics',
  'chemistry', 'biology', 'research', 'experiment', 'laboratory',
  'innovation', 'engineering', 'stem', 'exploration', 'discovery',
];

function isRelevantTopic(query: string): boolean {
  const lower = query.toLowerCase();
  return SPACE_KEYWORDS.some((kw) => lower.includes(kw));
}

interface NasaProxyResult {
  url: string;
  title?: string;
  nasaId?: string;
  sourceUrl?: string;
}

interface NasaProxyResponse {
  results: NasaProxyResult[];
}

export class NasaProvider implements SourceProvider {
  readonly name = 'NASA';
  readonly requiresKey = false;

  isAvailable(): boolean {
    return true;
  }

  async search(query: string, config: SourceProviderConfig): Promise<MediaCandidate[]> {
    if (!isRelevantTopic(query)) {
      return [];
    }

    try {
      const url = `/api/search-nasa?q=${encodeURIComponent(query)}`;

      const response = await fetchWithTimeout(
        url,
        {},
        {
          timeoutMs: 15_000,
          maxRetries: 1,
          signal: config.signal,
        },
      );

      if (!response.ok) {
        logger.warn('NASA', `Proxy returned status ${response.status} for "${query}"`);
        return [];
      }

      const data: NasaProxyResponse = await response.json();
      const items = data.results;
      if (!items || !Array.isArray(items)) return [];

      const candidates: MediaCandidate[] = [];

      for (const item of items) {
        if (!item.url) continue;

        candidates.push({
          url: item.url,
          alt: item.title || query,
          source: 'NASA (Public Domain)',
          sourceUrl: item.sourceUrl,
          baseScore: 170,
          query,
          finalScore: 0,
          type: 'image' as const,
        });
      }

      logger.info('NASA', `Found ${candidates.length} images for "${query}"`);
      return candidates;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') throw err;
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      logger.warn('NASA', `Search failed for "${query}"`, err);
      return [];
    }
  }
}
