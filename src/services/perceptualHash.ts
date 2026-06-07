/**
 * Lightweight 8×8 average-hash for visual dedup at harvest time (browser).
 */

const HASH_SIZE = 8;

function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) return 64;
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d += 1;
  return d;
}

function aHashFromImageData(data: ImageData): string | null {
  const { width, height, data: px } = data;
  if (width < HASH_SIZE || height < HASH_SIZE) return null;

  const stepX = width / HASH_SIZE;
  const stepY = height / HASH_SIZE;
  const samples: number[] = [];

  for (let y = 0; y < HASH_SIZE; y++) {
    for (let x = 0; x < HASH_SIZE; x++) {
      const sx = Math.min(width - 1, Math.floor(x * stepX + stepX / 2));
      const sy = Math.min(height - 1, Math.floor(y * stepY + stepY / 2));
      const i = (sy * width + sx) * 4;
      const gray = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      samples.push(gray);
    }
  }

  const avg = samples.reduce((s, v) => s + v, 0) / samples.length;
  return samples.map((v) => (v >= avg ? '1' : '0')).join('');
}

/**
 * Compute aHash from an image URL (uses thumbnail when available).
 */
export async function computeImageAHash(imageUrl: string, signal?: AbortSignal): Promise<string | null> {
  if (!imageUrl || typeof document === 'undefined') return null;

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.referrerPolicy = 'no-referrer';

    const timeout = window.setTimeout(() => resolve(null), 12_000);

    img.onload = () => {
      window.clearTimeout(timeout);
      try {
        const canvas = document.createElement('canvas');
        canvas.width = HASH_SIZE;
        canvas.height = HASH_SIZE;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0, HASH_SIZE, HASH_SIZE);
        const imageData = ctx.getImageData(0, 0, HASH_SIZE, HASH_SIZE);
        resolve(aHashFromImageData(imageData));
      } catch {
        resolve(null);
      }
    };

    img.onerror = () => {
      window.clearTimeout(timeout);
      resolve(null);
    };

    if (signal?.aborted) {
      window.clearTimeout(timeout);
      resolve(null);
      return;
    }
    signal?.addEventListener('abort', () => {
      window.clearTimeout(timeout);
      resolve(null);
    }, { once: true });

    img.src = imageUrl;
  });
}

/** Hamming distance below this => visually duplicate (of 64 bits). */
export const VISUAL_DUP_MAX_DISTANCE = 10;

export function isVisuallySimilar(hashA: string | null | undefined, hashB: string | null | undefined): boolean {
  if (!hashA || !hashB) return false;
  return hammingDistance(hashA, hashB) <= VISUAL_DUP_MAX_DISTANCE;
}

export function isSimilarToAny(hash: string | null, registry: string[]): boolean {
  if (!hash) return false;
  return registry.some((h) => isVisuallySimilar(hash, h));
}
