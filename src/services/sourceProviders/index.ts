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
import { isProviderDisabled } from './disabledProviders';
import { searchDDGLocal, searchDDGVideos, searchWikimedia, searchBingImages, searchGoogleImages, searchYandexImages, searchDuckDuckGoImages, searchStaticMap, searchBingVideos, searchGoogleVideos } from '../media';
import { logger } from '../logger';
import { isSafeStockProviderQuery } from '../topicFamilyQueries';

// ---------------------------------------------------------------------------
// Server proxy helper — Pexels & Pixabay
// ---------------------------------------------------------------------------

/**
 * Calls a server-side stock media proxy endpoint.
 * Returns MediaCandidate[] when the server handled the request (key configured),
 * or null when the server is not configured (503) so the caller can fall back to BYOK.
 */
async function tryStockServerProxy(
  endpoint: string,
  query: string,
  type: 'photos' | 'videos',
  signal?: AbortSignal,
): Promise<MediaCandidate[] | null> {
  try {
    const url = `${endpoint}?q=${encodeURIComponent(query)}&type=${type}`;
    const res = await fetch(url, { signal });
    if (res.status === 503) return null; // server has no key configured — fall back to BYOK
    if (!res.ok) return []; // server had key but upstream error — don't fall back
    const data = await res.json() as { results?: MediaCandidate[] };
    return Array.isArray(data.results) ? data.results : [];
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') throw err;
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    return null; // network error — fall back to BYOK
  }
}

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
  // Server proxy (/api/search-pixabay) is always available; BYOK key activates direct calls too
  readonly requiresKey = false;

  isAvailable(): boolean {
    return true;
  }

  async search(query: string, config: SourceProviderConfig): Promise<MediaCandidate[]> {
    // Prefer server proxy (uses PIXABAY_API_KEY server-side; no VITE_* secret in browser)
    const serverResult = await tryStockServerProxy('/api/search-pixabay', query, 'photos', config.signal);
    if (serverResult !== null) return serverResult;
    // BYOK fallback: VITE_PIXABAY_KEY set locally — call Pixabay directly
    if (!config.apiKey) return [];
    return new PixabayProvider().search(query, config);
  }
}

class PexelsAdapter implements SourceProvider {
  readonly name = 'Pexels';
  // Server proxy (/api/search-pexels) is always available; BYOK key activates direct calls too
  readonly requiresKey = false;

  isAvailable(): boolean {
    return true;
  }

  async search(query: string, config: SourceProviderConfig): Promise<MediaCandidate[]> {
    // Prefer server proxy (uses PEXELS_API_KEY server-side; no VITE_* secret in browser)
    const serverResult = await tryStockServerProxy('/api/search-pexels', query, 'photos', config.signal);
    if (serverResult !== null) return serverResult;
    // BYOK fallback: VITE_PEXELS_KEY set locally — call Pexels directly
    if (!config.apiKey) return [];
    return new PexelsProvider().search(query, config);
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
  // Video providers: server proxy preferred (PIXABAY_API_KEY / PEXELS_API_KEY server-side);
  // BYOK VITE_* key falls back to direct calls when server is not configured.
  {
    name: 'Pexels Videos' as const,
    requiresKey: false,
    isAvailable: () => true,
    search: async (query: string, config: SourceProviderConfig) => {
      const serverResult = await tryStockServerProxy('/api/search-pexels', query, 'videos', config.signal);
      if (serverResult !== null) return serverResult;
      if (!config.apiKey) return [];
      return new PexelsVideoProvider().search(query, config);
    },
  } satisfies SourceProvider,
  {
    name: 'Pixabay Videos' as const,
    requiresKey: false,
    isAvailable: () => true,
    search: async (query: string, config: SourceProviderConfig) => {
      const serverResult = await tryStockServerProxy('/api/search-pixabay', query, 'videos', config.signal);
      if (serverResult !== null) return serverResult;
      if (!config.apiKey) return [];
      return new PixabayVideoProvider().search(query, config);
    },
  } satisfies SourceProvider,
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
  return allProviders.filter((p) => !isProviderDisabled(p.name));
}

export function getAvailableProviders(config: AppConfig): SourceProvider[] {
  return allProviders.filter((provider) => {
    if (isProviderDisabled(provider.name)) return false;
    const providerConfig = mapAppConfigToProviderConfig(provider, config);
    return provider.isAvailable(providerConfig);
  });
}

function isPexelsPixabayProvider(provider: SourceProvider): boolean {
  return /^(Pexels|Pixabay)(?: Videos)?$/.test(provider.name);
}

export async function queryAllProviders(
  query: string,
  config: AppConfig,
  signal?: AbortSignal,
): Promise<MediaCandidate[]> {
  const available = getAvailableProviders(config);

  const results = await Promise.allSettled(
    available.map(async (provider) => {
      if (isPexelsPixabayProvider(provider) && !isSafeStockProviderQuery(query)) {
        logger.info('ProviderRegistry', `Skipping ${provider.name} for unsafe stock query "${query}"`);
        return [] as MediaCandidate[];
      }
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
      apiKey = config.pexelsKey;
      break;
    case 'Pixabay':
    case 'Pixabay Videos':
      apiKey = config.pixabayKey;
      break;
    default:
      apiKey = undefined;
  }

  return { apiKey, signal };
}

export interface ProviderHealthReport {
  name: string;
  status: 'success' | 'failed' | 'skipped' | 'timeout';
  resultCount: number;
  durationMs: number;
  error?: string;
}

export interface ProvidersResult {
  candidates: MediaCandidate[];
  health: ProviderHealthReport[];
}

export async function queryAllProvidersWithHealth(
  query: string,
  config: AppConfig,
  signal?: AbortSignal,
): Promise<ProvidersResult> {
  const health: ProviderHealthReport[] = [];

  // Report skipped providers
  for (const provider of allProviders) {
    const providerConfig = mapAppConfigToProviderConfig(provider, config);
    if (!provider.isAvailable(providerConfig)) {
      health.push({
        name: provider.name,
        status: 'skipped',
        resultCount: 0,
        durationMs: 0,
        error: provider.requiresKey ? 'API key not configured' : 'Provider unavailable',
      });
    }
  }

  const available = getAvailableProviders(config);

  const results = await Promise.allSettled(
    available.map(async (provider) => {
      if (isPexelsPixabayProvider(provider) && !isSafeStockProviderQuery(query)) {
        health.push({
          name: provider.name,
          status: 'skipped',
          resultCount: 0,
          durationMs: 0,
          error: 'Unsafe stock query',
        });
        return [] as MediaCandidate[];
      }
      const providerConfig = mapAppConfigToProviderConfig(provider, config, signal);
      const start = performance.now();

      const providerSignal = signal
        ? AbortSignal.any([signal, AbortSignal.timeout(8_000)])
        : AbortSignal.timeout(8_000);

      try {
        const candidates = await provider.search(query, { ...providerConfig, signal: providerSignal });
        const durationMs = Math.round(performance.now() - start);
        health.push({
          name: provider.name,
          status: 'success',
          resultCount: candidates.length,
          durationMs,
        });
        return candidates;
      } catch (err) {
        const durationMs = Math.round(performance.now() - start);
        if (err instanceof Error && err.name === 'AbortError') {
          health.push({ name: provider.name, status: 'timeout', resultCount: 0, durationMs, error: 'Request timed out' });
          throw err;
        }
        if (err instanceof DOMException && err.name === 'AbortError') {
          health.push({ name: provider.name, status: 'timeout', resultCount: 0, durationMs, error: 'Request timed out' });
          throw err;
        }
        const errorMsg = err instanceof Error ? err.message : String(err);
        health.push({ name: provider.name, status: 'failed', resultCount: 0, durationMs, error: errorMsg });
        logger.warn('ProviderRegistry', `${provider.name} failed for "${query}": ${errorMsg}`);
        return [] as MediaCandidate[];
      }
    }),
  );

  if (signal?.aborted) return { candidates: [], health };

  const allCandidates: MediaCandidate[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      allCandidates.push(...result.value);
    }
  }

  const deduplicated = deduplicateCandidates(allCandidates);
  const filtered = filterWatermarked(deduplicated);

  // Log summary
  const succeeded = health.filter(h => h.status === 'success').length;
  const failed = health.filter(h => h.status === 'failed').length;
  const skipped = health.filter(h => h.status === 'skipped').length;
  logger.info('ProviderRegistry', `Query "${query}": ${succeeded} succeeded, ${failed} failed, ${skipped} skipped → ${filtered.length} candidates`);

  return { candidates: filtered, health };
}

