// ============================================================================
// Source Provider Registry — Aggregates all providers for parallel querying
// ============================================================================

import type { MediaCandidate } from '../media';
import type { SourceProvider, SourceProviderConfig } from './types';
import type { AppConfig } from '../../types';
import { FlickrProvider } from './flickr';
import { GovPressProvider } from './govPress';
import { PixabayProvider } from './pixabay';
import { PexelsProvider } from './pexels';
import { NasaProvider } from './nasa';
import { VimeoProvider } from './vimeo';
import { DailymotionProvider } from './dailymotion';
import { GiphyProvider } from './giphy';
import { UnsplashProvider } from './unsplash';
import { ArchiveOrgProvider } from './archiveOrg';
import { HybridScraperProvider } from './hybridScraper';
import { PexelsVideoProvider } from './pexelsVideo';
import { PixabayVideoProvider } from './pixabayVideo';
import { DeepHarvestProvider } from './deepHarvest';
import { filterWatermarked } from './watermarkFilter';
import { searchDDGLocal, searchDDGVideos, searchWikimedia, searchBingImages, searchGoogleImages, searchYandexImages, searchDuckDuckGoImages, searchStaticMap, searchBingVideos, searchGoogleVideos } from '../media';
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
    return searchWikimedia(query, config.signal);
  }
}

class PicsumAdapter implements SourceProvider {
  readonly name = 'Picsum';
  readonly requiresKey = false;

  isAvailable(): boolean {
    return true;
  }

  async search(query: string, config: SourceProviderConfig): Promise<MediaCandidate[]> {
    if (config.signal?.aborted) return [];
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

class BingImagesAdapter implements SourceProvider {
  readonly name = 'Bing Images';
  readonly requiresKey = false;

  isAvailable(): boolean {
    return true;
  }

  async search(query: string, config: SourceProviderConfig): Promise<MediaCandidate[]> {
    return searchBingImages(query, config.signal);
  }
}

class GoogleImagesAdapter implements SourceProvider {
  readonly name = 'Google Images';
  readonly requiresKey = false;

  isAvailable(): boolean {
    return true;
  }

  async search(query: string, config: SourceProviderConfig): Promise<MediaCandidate[]> {
    return searchGoogleImages(query, config.signal);
  }
}

class YandexImagesAdapter implements SourceProvider {
  readonly name = 'Startpage Images';
  readonly requiresKey = false;

  isAvailable(): boolean {
    return true;
  }

  async search(query: string, config: SourceProviderConfig): Promise<MediaCandidate[]> {
    return searchYandexImages(query, config.signal);
  }
}

class DuckDuckGoImagesAdapter implements SourceProvider {
  readonly name = 'DuckDuckGo Images';
  readonly requiresKey = false;

  isAvailable(): boolean {
    return true;
  }

  async search(query: string, config: SourceProviderConfig): Promise<MediaCandidate[]> {
    return searchDuckDuckGoImages(query, config.signal);
  }
}

class StaticMapAdapter implements SourceProvider {
  readonly name = 'OpenStreetMap';
  readonly requiresKey = false;

  isAvailable(): boolean {
    return true;
  }

  async search(query: string, config: SourceProviderConfig): Promise<MediaCandidate[]> {
    return searchStaticMap(query, config.signal);
  }
}

class BingVideosAdapter implements SourceProvider {
  readonly name = 'Bing Videos';
  readonly requiresKey = false;

  isAvailable(): boolean {
    return true;
  }

  async search(query: string, config: SourceProviderConfig): Promise<MediaCandidate[]> {
    return searchBingVideos(query, config.signal);
  }
}

class GoogleVideosAdapter implements SourceProvider {
  readonly name = 'Google Videos';
  readonly requiresKey = false;

  isAvailable(): boolean {
    return true;
  }

  async search(query: string, config: SourceProviderConfig): Promise<MediaCandidate[]> {
    return searchGoogleVideos(query, config.signal);
  }
}

class PixabayAdapter implements SourceProvider {
  readonly name = 'Pixabay';
  readonly requiresKey = true;

  isAvailable(config: SourceProviderConfig): boolean {
    return Boolean(config.apiKey);
  }

  async search(query: string, config: SourceProviderConfig): Promise<MediaCandidate[]> {
    const provider = new PixabayProvider();
    return provider.search(query, config);
  }
}

class PexelsAdapter implements SourceProvider {
  readonly name = 'Pexels';
  readonly requiresKey = true;

  isAvailable(config: SourceProviderConfig): boolean {
    return Boolean(config.apiKey);
  }

  async search(query: string, config: SourceProviderConfig): Promise<MediaCandidate[]> {
    const provider = new PexelsProvider();
    return provider.search(query, config);
  }
}

// ---------------------------------------------------------------------------
// Registry — all source providers
// ---------------------------------------------------------------------------

const allProviders: SourceProvider[] = [
  new DDGLocalAdapter(),
  new DDGVideoAdapter(),
  new WikimediaAdapter(),
  new PicsumAdapter(),
  new BingImagesAdapter(),
  new GoogleImagesAdapter(),
  new YandexImagesAdapter(),
  new DuckDuckGoImagesAdapter(),
  new BingVideosAdapter(),
  new GoogleVideosAdapter(),
  new StaticMapAdapter(),
  new FlickrProvider(),
  new GovPressProvider(),
  new PixabayAdapter(),
  new PexelsAdapter(),
  new PexelsVideoProvider(),
  new PixabayVideoProvider(),
  new NasaProvider(),
  new VimeoProvider(),
  new DailymotionProvider(),
  new GiphyProvider(),
  new UnsplashProvider(),
  new ArchiveOrgProvider(),
  new HybridScraperProvider(),
  new DeepHarvestProvider(),
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
        ? AbortSignal.any([signal, AbortSignal.timeout(8_000)])
        : AbortSignal.timeout(8_000);

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

  if (signal?.aborted) return [];

  const allCandidates: MediaCandidate[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      allCandidates.push(...result.value);
    }
  }

  const deduplicated = deduplicateCandidates(allCandidates);
  return filterWatermarked(deduplicated);
}

export function deduplicateCandidates(candidates: MediaCandidate[]): MediaCandidate[] {
  const bestByUrl = new Map<string, MediaCandidate>();
  const seenByQueryAndUrl = new Set<string>();

  for (const candidate of candidates) {
    const key = `${candidate.query}::${candidate.url}`;
    if (seenByQueryAndUrl.has(key)) continue;
    seenByQueryAndUrl.add(key);

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
    case 'Pexels':
    case 'Pexels Videos':
      apiKey = (config as unknown as Record<string, unknown>).pexelsKey as string | undefined;
      break;
    case 'Pixabay':
    case 'Pixabay Videos':
      apiKey = (config as unknown as Record<string, unknown>).pixabayKey as string | undefined;
      break;
    default:
      apiKey = undefined;
  }

  return { apiKey, signal };
}
