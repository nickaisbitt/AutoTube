import type { RenderContext2D } from '../renderingShared';

export function drawContrastInversion(
  ctx: RenderContext2D,
  w: number,
  h: number,
  progress: number,
  duration: number,
): void {
  if (w <= 0 || h <= 0 || duration <= 0) return;

  const ctxAny = ctx as any;
  if (typeof ctxAny.getImageData !== 'function' || typeof ctxAny.putImageData !== 'function') return;

  const clampedProgress = Math.min(1, Math.max(0, progress));
  const midpoint = 0.5;

  let blend: number;
  if (clampedProgress <= midpoint) {
    blend = 1.0;
  } else {
    blend = 1.0 - (clampedProgress - midpoint) / midpoint;
  }

  if (blend <= 0) return;

  const imageData: ImageData = ctxAny.getImageData(0, 0, w, h);
  const data = imageData.data;
  const contrastFactor = 1.5;
  const intercept = 128 * (1 - contrastFactor);

  for (let i = 0; i < data.length; i += 4) {
    const invR = 255 - data[i];
    const invG = 255 - data[i + 1];
    const invB = 255 - data[i + 2];

    const contR = Math.min(255, Math.max(0, invR * contrastFactor + intercept));
    const contG = Math.min(255, Math.max(0, invG * contrastFactor + intercept));
    const contB = Math.min(255, Math.max(0, invB * contrastFactor + intercept));

    data[i] = Math.round(data[i] + (contR - data[i]) * blend);
    data[i + 1] = Math.round(data[i + 1] + (contG - data[i + 1]) * blend);
    data[i + 2] = Math.round(data[i + 2] + (contB - data[i + 2]) * blend);
  }

  ctxAny.putImageData(imageData, 0, 0);
}

export function drawSplitContrast(
  ctx: RenderContext2D,
  w: number,
  h: number,
  splitRatio: number,
): void {
  if (w <= 0 || h <= 0) return;

  const clampedRatio = Math.min(1, Math.max(0, splitRatio));
  const splitX = Math.round(w * clampedRatio);

  const ctxAny = ctx as any;
  if (typeof ctxAny.getImageData !== 'function' || typeof ctxAny.putImageData !== 'function') return;

  const imageData: ImageData = ctxAny.getImageData(0, 0, w, h);
  const data = imageData.data;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;

      if (x < splitX) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        data[i] = Math.min(255, Math.round(r * 1.2 + 20));
        data[i + 1] = Math.min(255, Math.round(g * 1.05 + 10));
        data[i + 2] = Math.max(0, Math.round(b * 0.8));
      } else {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        data[i] = Math.max(0, Math.round(r * 0.8));
        data[i + 1] = Math.min(255, Math.round(g * 1.05 + 5));
        data[i + 2] = Math.min(255, Math.round(b * 1.2 + 20));
      }
    }
  }

  ctxAny.putImageData(imageData, 0, 0);
}

export function computeContrastScore(
  imageData: Uint8ClampedArray,
  w: number,
  h: number,
): number {
  if (!imageData || w <= 0 || h <= 0 || imageData.length < 4) return 0;

  let minLum = 255;
  let maxLum = 0;

  for (let i = 0; i < imageData.length; i += 4) {
    const lum = 0.299 * imageData[i] + 0.587 * imageData[i + 1] + 0.114 * imageData[i + 2];
    if (lum < minLum) minLum = lum;
    if (lum > maxLum) maxLum = lum;
  }

  const dynamicRange = maxLum - minLum;
  return Math.min(1, Math.max(0, dynamicRange / 255));
}
