// ============================================================================
// Government Press Source Provider — Public Domain Official Photography
// ============================================================================

import type { MediaCandidate } from '../media';
import type { SourceProvider, SourceProviderConfig } from './types';
import { fetchWithTimeout } from '../../utils/fetchWithTimeout';
import { logger } from '../logger';

// ---------------------------------------------------------------------------
// Topic keyword matching for activation
// ---------------------------------------------------------------------------

const POLITICAL_KEYWORDS = [
  'president', 'congress', 'senate', 'parliament', 'election', 'vote',
  'democrat', 'republican', 'legislation', 'law', 'policy', 'governor',
  'mayor', 'cabinet', 'white house', 'capitol', 'political', 'politics',
  'diplomat', 'diplomacy', 'ambassador', 'summit', 'treaty',
];

const MILITARY_KEYWORDS = [
  'military', 'army', 'navy', 'air force', 'marine', 'defense', 'defence',
  'pentagon', 'nato', 'war', 'conflict', 'troops', 'soldier', 'weapon',
  'missile', 'nuclear', 'aircraft', 'carrier', 'submarine', 'tank',
  'veteran', 'deployment', 'operation', 'strike', 'drone',
];

const INTERNATIONAL_KEYWORDS = [
  'united nations', 'un', 'g7', 'g20', 'eu', 'european union',
  'sanctions', 'trade war', 'tariff', 'embargo', 'foreign affairs',
  'geopolitics', 'international', 'bilateral', 'multilateral',
  'alliance', 'coalition', 'peacekeeping', 'humanitarian',
];

const ALL_KEYWORDS = [...POLITICAL_KEYWORDS, ...MILITARY_KEYWORDS, ...INTERNATIONAL_KEYWORDS];

/**
 * Check if a query matches political/military/international topics.
 */
function isRelevantTopic(query: string): boolean {
  const lower = query.toLowerCase();
  return ALL_KEYWORDS.some((kw) => {
    const trimmed = kw.trim();
    return lower.includes(trimmed);
  });
}

// ---------------------------------------------------------------------------
// Provider Implementation
// ---------------------------------------------------------------------------

export class GovPressProvider implements SourceProvider {
  readonly name = 'Government Press';
  readonly requiresKey = false;

  isAvailable(): boolean {
    return true;
  }

  async search(query: string, config: SourceProviderConfig): Promise<MediaCandidate[]> {
    if (!isRelevantTopic(query)) {
      return [];
    }

    try {
      const apiUrl = `/api/search-govpress?q=${encodeURIComponent(query)}`;

      const response = await fetchWithTimeout(
        apiUrl,
        {},
        {
          timeoutMs: 15_000,
          maxRetries: 1,
          signal: config.signal,
        },
      );

      if (!response.ok) {
        logger.warn('GovPress', `API returned ${response.status}`);
        return [];
      }

      const data = await response.json();
      const results = data.results || [];

      const candidates: MediaCandidate[] = results.map((item: { url: string; title?: string; sourceUrl?: string }) => ({
        url: item.url,
        alt: item.title || query,
        source: 'Government Press',
        sourceUrl: item.sourceUrl || item.url,
        baseScore: 150,
        query,
        finalScore: 0,
        type: 'image' as const,
      }));

      logger.info('GovPress', `Found ${candidates.length} government press images for "${query}"`);
      return candidates;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') throw err;
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      logger.warn('GovPress', `Search failed for "${query}"`, err);
      return [];
    }
  }
}
