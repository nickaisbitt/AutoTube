import type { VideoProject } from '../../types';
import { logger } from '../logger';
import type { ImgCache, RenderableImage } from './orchestrator';
import { IMG_CACHE_MAX } from './orchestrator';

export function evictOldestEntries(cache: ImgCache): void {
  const keys = Object.keys(cache);
  if (keys.length > IMG_CACHE_MAX) {
    const toRemove = keys.slice(0, keys.length - IMG_CACHE_MAX);
    for (const k of toRemove) {
      delete cache[k];
    }
  }
}

export function isCanvasSafeSource(source: string): boolean {
  if (!source) return false;
  if (source.startsWith('data:') || source.startsWith('blob:')) return true;
  // Local dev proxy and relative paths are always safe
  if (source.startsWith('/api/proxy-image') || !/^https?:\/\//i.test(source)) return true;

  try {
    const hostname = new URL(source).hostname;
    return ['images.weserv.nl', 'api.allorigins.win', 'corsproxy.io'].includes(hostname);
  } catch {
    return false;
  }
}

/* @internal */
export function buildImageSources(url: string): string[] {
  if (!/^https?:\/\//i.test(url)) return [url];

  const sources: string[] = [];

  // 1. Local Vite dev-server proxy — eliminates CORS/canvas-taint in development.
  //    In production (static build) this 404s and the next source is tried.
  sources.push(`/api/proxy-image?url=${encodeURIComponent(url)}`);

  // 2. weserv.nl — reliable free image proxy with resize + format conversion
  try {
    sources.push(`https://images.weserv.nl/?url=${encodeURIComponent(url)}&w=1920&output=jpg`);
  } catch {
    // URL encoding failed, skip
  }

  // 3. corsproxy.io — backup CORS proxy
  try {
    sources.push(`https://corsproxy.io/?${encodeURIComponent(url)}`);
  } catch {
    // Skip
  }

  // 4. Direct load — works for images that already have CORS headers
  sources.push(url);

  return sources;
}

export function mkFallback(text: string): HTMLImageElement {
  const c = document.createElement('canvas');
  c.width = 1280; c.height = 720;
  const cx = c.getContext('2d')!;
  cx.fillStyle = '#1e293b';
  cx.fillRect(0, 0, 1280, 720);
  cx.fillStyle = '#475569';
  cx.font = '24px system-ui, sans-serif';
  cx.textAlign = 'center';
  cx.fillText(text.substring(0, 50), 640, 360);
  const img = new Image();
  img.src = c.toDataURL();
  (img as RenderableImage).safeForCanvas = true;
  return img;
}

export function loadImage(url: string, alt: string, blobUrls: string[] = []): Promise<HTMLImageElement> {
  // Try multiple CORS-safe approaches in order of preference
  const sources = buildImageSources(url);

  return new Promise((resolve) => {
    const trySource = (index: number) => {
      if (index >= sources.length) {
        // All sources failed, create a gradient fallback
        logger.warn('Renderer', `All image sources failed for ${url.substring(0, 80)} — using procedural fallback`);
        resolve(mkFallback(alt));
        return;
      }

      const src = sources[index];
      const isSafe = isCanvasSafeSource(src);

      // For proxy/safe sources: fetch as blob → object URL to guarantee canvas safety
      if (isSafe && (src.startsWith('/api/proxy-image') || src.includes('weserv.nl') || src.includes('corsproxy'))) {
        fetch(src)
          .then(r => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.blob();
          })
          .then(blob => {
            const blobUrl = URL.createObjectURL(blob);
            blobUrls.push(blobUrl);
            const img = new Image();
            // Blob URLs are same-origin — do NOT set crossOrigin, it causes taint
            img.onload = () => {
              (img as RenderableImage).safeForCanvas = true;
              (img as RenderableImage).naturalW = img.naturalWidth;
              (img as RenderableImage).naturalH = img.naturalHeight;
              resolve(img);
            };
            img.onerror = () => {
              URL.revokeObjectURL(blobUrl);
              logger.warn('Renderer', `Image blob load failed (source ${index + 1}/${sources.length}): ${src.substring(0, 80)}`);
              trySource(index + 1);
            };
            img.src = blobUrl;
          })
          .catch(() => {
            logger.warn('Renderer', `Image fetch failed (source ${index + 1}/${sources.length}): ${src.substring(0, 80)}`);
            trySource(index + 1);
          });
        return;
      }

      const img = new Image();
      // Only set crossOrigin for sources that support it and won't taint the canvas
      // weserv.nl, corsproxy all return CORS headers
      if (isSafe) img.crossOrigin = 'anonymous';
      img.referrerPolicy = 'no-referrer';
      img.decoding = 'async';
      
      const timeout = setTimeout(() => {
        img.onerror = null;
        img.onload = null;
        logger.warn('Renderer', `Image load timeout (source ${index + 1}/${sources.length}): ${src.substring(0, 80)}`);
        trySource(index + 1);
      }, 4000);

      img.onload = () => {
        clearTimeout(timeout);
        (img as RenderableImage).safeForCanvas = isCanvasSafeSource(src);
        resolve(img);
      };
      
      img.onerror = () => {
        clearTimeout(timeout);
        logger.warn('Renderer', `Image load error (source ${index + 1}/${sources.length}): ${src.substring(0, 80)}`);
        trySource(index + 1);
      };
      
      img.src = src;
    };

    trySource(0);
  });
}

export async function preload(project: VideoProject, cache: ImgCache, blobUrls: string[], signal?: AbortSignal, onProgress?: (pct: number, msg: string) => void): Promise<void> {
  // Overall preload timeout: 30s max to prevent indefinite hangs
  const PRELOAD_TIMEOUT_MS = 30_000;
  const deadline = Date.now() + PRELOAD_TIMEOUT_MS;

  // MR-6 fix: batch preloads 10 at a time to avoid saturating the browser
  // connection pool (typically 6 connections/host). Previously all images
  // fired concurrently, causing repeated 4s timeouts on large projects.
  const BATCH_SIZE = 10;
  const assets = project.media;

  const preloadOne = async (a: (typeof assets)[number]) => {
    if (signal?.aborted) return;
    if (Date.now() > deadline) {
      logger.warn('Renderer', `Preload timeout — skipping remaining images`);
      return;
    }
    if (!cache[a.url]) {
      const imageUrl = a.type === 'video' ? (a.thumbnailUrl || a.url) : a.url;
      try {
        const img = await loadImage(imageUrl, a.alt, blobUrls);
        logger.info('Renderer', `Preloaded: ${imageUrl.substring(0,60)} safeForCanvas=${(img as RenderableImage).safeForCanvas} w=${img.naturalWidth} h=${img.naturalHeight}`);
        cache[a.url] = img;
        evictOldestEntries(cache);
      } catch (err) {
        logger.warn('Renderer', `Preload failed for ${imageUrl.substring(0,60)}: ${(err as Error).message}`);
        // Use fallback image so rendering can continue
        cache[a.url] = mkFallback(a.alt);
      }
    }
  };

  const totalBatches = Math.max(1, Math.ceil(assets.length / BATCH_SIZE));
  let batchIndex = 0;

  for (let i = 0; i < assets.length; i += BATCH_SIZE) {
    if (signal?.aborted || Date.now() > deadline) break;
    await Promise.all(assets.slice(i, i + BATCH_SIZE).map(preloadOne));
    batchIndex++;
    const loaded = Math.min(i + BATCH_SIZE, assets.length);
    const pct = 2 + (batchIndex / totalBatches) * 8;
    onProgress?.(Math.round(pct), `Preloading image ${loaded}/${assets.length}...`);
  }
}
