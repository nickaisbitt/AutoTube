// ============================================================================
// Source Provider Registry — Aggregates all providers for parallel querying
// ============================================================================

import type { MediaCandidate } from '../media';
import type { SourceProvider, SourceProviderConfig } from './types';
import type { AppConfig } from '../../types';
import { FlickrProvider } from './flickr';
import { GovPressProvider } from './govPress';
import { logger } from '../logger';

// ---------------------------------------------------------------------------
// Adapter wrappers for existing providers in media.ts
// ---------------------------------------------------------------------------

class DDGLocalAdapter implements SourceProvider {
  readonly name = 'DuckDuckGo Images';
  readonly requiresKey = false;

  isAvailable(): boolean {
    return true;
  }

  async search(query: string, config: SourceProviderConfig): Promise<MediaCandidate[]> {
    const { searchDDGLocal } = await import('../media');
    return searchDDGLocal(query, config.signal);
  }
}

class DDGVideoAdapter implements SourceProvider {
  readonly name = 'DuckDuckGo Video';
  readonly requiresKey = false;

  isAvailable(): boolean {
    return true;
  }

  async search(query: string, config: SourceProviderConfig): Promise<MediaCandidate[]> {
    const { searchDDGVideos } = await import('../media');
    return searchDDGVideos(query, config.signal);
  }
}

class WikimediaAdapter implements SourceProvider {
  readonly name = 'Wikimedia Commons';
  readonly requiresKey = false;

  isAvailable(): boolean {
    return true;
  }

  async search(query: string, config: SourceProviderConfig): Promise<MediaCandidate[]> {
    const { searchWikimedia } = await import('../media');
    return searchWikimedia(query, config.signal);
  }
}

class PicsumAdapter implements SourceProvider {
  readonly name = 'Picsum';
  readonly requiresKey = false;

  isAvailable(): boolean {
    return true;
  }

  async search(query: string): Promise<MediaCandidate[]> {
    const seed = query.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 30);
    const sizes: Array<[number, number]> = [[1920, 1080], [1280, 720]];
    return sizes.map(([w, h], i) => ({
      url: `https://picsum.photos/seed/${seed}-${i}/${w}/${h}`,
      alt: query,
      source: 'Picsum (Unsplash fallback)',
      baseScore: 30,
      query,
      finalScore: 0,
      type: 'image' as const,
      width: w,
      height: h,
    }));
  }
}

// ---------------------------------------------------------------------------
// Registry — free sources only (no Serper, Pexels, Pixabay)
// ---------------------------------------------------------------------------

const allProviders: SourceProvider[] = [
  new DDGLocalAdapter(),
  new DDGVideoAdapter(),
  new WikimediaAdapter(),
  new PicsumAdapter(),
  new FlickrProvider(),
  new GovPressProvider(),
];

export function getAllProviders(): SourceProvider[] {
  return [...allProviders];
}

export function getAvailableProviders(config: AppConfig): SourceProvider[] {
  return allProviders.filter((provider) => {
    const providerConfig = mapAppConfigToProviderConfig(provider, config);
    return provider.isAvailable(providerConfig);
  });
}

export async function queryAllProviders(
  query: string,
  config: AppConfig,
  signal?: AbortSignal,
): Promise<MediaCandidate[]> {
  const available = getAvailableProviders(config);

  const results = await Promise.allSettled(
    available.map(async (provider) => {
      const providerConfig = mapAppConfigToProviderConfig(provider, config, signal);

      const providerSignal = signal
        ? AbortSignal.any([signal, AbortSignal.timeout(6_000)])
        : AbortSignal.timeout(6_000);

      try {
        const candidates = await provider.search(query, { ...providerConfig, signal: providerSignal });
        return candidates;
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') throw err;
        if (err instanceof DOMException && err.name === 'AbortError') throw err;
        logger.warn('ProviderRegistry', `${provider.name} failed for "${query}"`, err);
        return [] as MediaCandidate[];
      }
    }),
  );

  const allCandidates: MediaCandidate[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      allCandidates.push(...result.value);
    }
  }

  return deduplicateCandidates(allCandidates);
}

export function deduplicateCandidates(candidates: MediaCandidate[]): MediaCandidate[] {
  const bestByUrl = new Map<string, MediaCandidate>();

  for (const candidate of candidates) {
    const existing = bestByUrl.get(candidate.url);
    if (!existing || candidate.baseScore > existing.baseScore) {
      bestByUrl.set(candidate.url, candidate);
    }
  }

  return Array.from(bestByUrl.values());
}

function mapAppConfigToProviderConfig(
  provider: SourceProvider,
  config: AppConfig,
  signal?: AbortSignal,
): SourceProviderConfig {
  let apiKey: string | undefined;

  switch (provider.name) {
    case 'Flickr':
      apiKey = config.flickrKey;
      break;
    default:
      apiKey = undefined;
  }

  return { apiKey, signal };
}
