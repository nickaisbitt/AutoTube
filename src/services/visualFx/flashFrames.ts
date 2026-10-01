import type { RenderContext2D } from '../renderingShared';
import { hexToRgba } from '../renderingShared';

export function computeFlashIntensity(
  frameInFlash: number,
  totalFlashFrames: number,
): number {
  if (totalFlashFrames <= 0) return 0;
  if (frameInFlash < 0 || frameInFlash >= totalFlashFrames) return 0;

  const center = (totalFlashFrames - 1) / 2;
  const sigma = totalFlashFrames / 3;
  const x = frameInFlash - center;
  return Math.exp(-(x * x) / (2 * sigma * sigma));
}

export function shouldInjectFlash(
  frameIndex: number,
  retentionBeats: { type: string; frameIndex: number }[],
): boolean {
  if (!retentionBeats || retentionBeats.length === 0) return false;

  for (const beat of retentionBeats) {
    if (frameIndex >= beat.frameIndex && frameIndex < beat.frameIndex + 3) {
      return true;
    }
  }
  return false;
}

export function drawFlashFrame(
  ctx: RenderContext2D,
  w: number,
  h: number,
  flashType: 'white' | 'color' | 'invert',
  intensity: number,
  accentColor?: string,
): void {
  if (w <= 0 || h <= 0 || intensity <= 0) return;

  const clampedIntensity = Math.min(1, Math.max(0, intensity));

  switch (flashType) {
    case 'white': {
      ctx.save();
      ctx.globalAlpha = clampedIntensity * 0.6;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
      break;
    }
    case 'color': {
      const accent = accentColor || '#e74c3c';
      ctx.save();
      ctx.globalAlpha = clampedIntensity * 0.5;
      ctx.fillStyle = hexToRgba(accent, 1);
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
      break;
    }
    case 'invert': {
      const ctxAny = ctx as any;
      if (typeof ctxAny.getImageData !== 'function' || typeof ctxAny.putImageData !== 'function') return;

      const imageData: ImageData = ctxAny.getImageData(0, 0, w, h);
      const data = imageData.data;
      const blend = clampedIntensity;

      for (let i = 0; i < data.length; i += 4) {
        const invR = 255 - data[i];
        const invG = 255 - data[i + 1];
        const invB = 255 - data[i + 2];
        data[i] = Math.round(data[i] + (invR - data[i]) * blend);
        data[i + 1] = Math.round(data[i + 1] + (invG - data[i + 1]) * blend);
        data[i + 2] = Math.round(data[i + 2] + (invB - data[i + 2]) * blend);
      }

      ctxAny.putImageData(imageData, 0, 0);
      break;
    }
  }
}
