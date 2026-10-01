import { logger } from '../logger';

const MAX_CACHE_SIZE = 100;

const sharedImageCache = new Map<string, HTMLImageElement>();
const accessOrder: string[] = [];

let cacheHits = 0;
let cacheMisses = 0;

function touch(key: string): void {
  const idx = accessOrder.indexOf(key);
  if (idx !== -1) {
    accessOrder.splice(idx, 1);
  }
  accessOrder.push(key);
}

function evictLRU(): void {
  while (sharedImageCache.size >= MAX_CACHE_SIZE && accessOrder.length > 0) {
    const oldest = accessOrder.shift()!;
    if (sharedImageCache.has(oldest)) {
      sharedImageCache.delete(oldest);
    }
  }
}

export function getCachedImage(url: string): HTMLImageElement | undefined {
  const img = sharedImageCache.get(url);
  if (img) {
    cacheHits++;
    touch(url);
    return img;
  }
  cacheMisses++;
  return undefined;
}

export function cacheImage(url: string, img: HTMLImageElement): void {
  if (sharedImageCache.size >= MAX_CACHE_SIZE) {
    evictLRU();
  }
  sharedImageCache.set(url, img);
  touch(url);
}

export function getCacheStats(): { hits: number; misses: number; size: number } {
  return { hits: cacheHits, misses: cacheMisses, size: sharedImageCache.size };
}

export function clearAssetCache(): void {
  sharedImageCache.clear();
  accessOrder.length = 0;
  cacheHits = 0;
  cacheMisses = 0;
  logger.info('AssetCache', 'Cache cleared');
}
