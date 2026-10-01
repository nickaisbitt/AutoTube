import type { RenderContext2D } from '../renderingShared';

export type InterruptType = 'glitch' | 'static' | 'color_burst' | 'frame_skip' | 'reverse';

export function drawGlitchEffect(
  ctx: RenderContext2D,
  w: number,
  h: number,
  intensity: number,
): void {
  if (w <= 0 || h <= 0 || intensity <= 0) return;

  const ctxAny = ctx as any;
  if (typeof ctxAny.getImageData !== 'function' || typeof ctxAny.putImageData !== 'function') return;

  const clampedIntensity = Math.min(1, Math.max(0, intensity));
  const imageData: ImageData = ctxAny.getImageData(0, 0, w, h);
  const src = new Uint8ClampedArray(imageData.data);
  const dst = imageData.data;

  const bandCount = Math.floor(5 + Math.random() * 11);
  const bandHeight = Math.ceil(h / bandCount);
  const maxOffset = clampedIntensity * 30;

  for (let band = 0; band < bandCount; band++) {
    const yOffset = band * bandHeight;
    const yEnd = Math.min(yOffset + bandHeight, h);
    const offsetX = Math.round((Math.random() * 2 - 1) * maxOffset);

    for (let y = yOffset; y < yEnd; y++) {
      for (let x = 0; x < w; x++) {
        const dstI = (y * w + x) * 4;
        const srcX = Math.min(w - 1, Math.max(0, x - offsetX));
        const srcI = (y * w + srcX) * 4;

        const rSrcX = Math.min(w - 1, Math.max(0, x - offsetX - Math.round(clampedIntensity * 3)));
        const rI = (y * w + rSrcX) * 4;
        dst[dstI] = src[rI];

        dst[dstI + 1] = src[srcI + 1];

        const bSrcX = Math.min(w - 1, Math.max(0, x - offsetX + Math.round(clampedIntensity * 3)));
        const bI = (y * w + bSrcX) * 4;
        dst[dstI + 2] = src[bI + 2];

        dst[dstI + 3] = src[srcI + 3];
      }
    }
  }

  const scanlineCount = Math.floor(clampedIntensity * 20);
  for (let s = 0; s < scanlineCount; s++) {
    const y = Math.floor(Math.random() * h);
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const noise = Math.random() < 0.5 ? 255 : 200;
      dst[i] = noise;
      dst[i + 1] = noise;
      dst[i + 2] = noise;
    }
  }

  ctxAny.putImageData(imageData, 0, 0);
}

export function drawStaticNoise(
  ctx: RenderContext2D,
  w: number,
  h: number,
  density: number,
): void {
  if (w <= 0 || h <= 0 || density <= 0) return;

  const ctxAny = ctx as any;
  if (typeof ctxAny.getImageData !== 'function' || typeof ctxAny.putImageData !== 'function') return;

  const clampedDensity = Math.min(1, Math.max(0, density));
  const imageData: ImageData = ctxAny.getImageData(0, 0, w, h);
  const data = imageData.data;
  const totalPixels = w * h;
  const affectedPixels = Math.floor(totalPixels * clampedDensity);

  for (let p = 0; p < affectedPixels; p++) {
    const pixelIndex = Math.floor(Math.random() * totalPixels);
    const i = pixelIndex * 4;
    const value = Math.floor(Math.random() * 256);
    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
  }

  ctxAny.putImageData(imageData, 0, 0);
}

export function drawColorBurst(
  ctx: RenderContext2D,
  w: number,
  h: number,
  color: string,
  intensity: number,
): void {
  if (w <= 0 || h <= 0 || intensity <= 0) return;

  const clampedIntensity = Math.min(1, Math.max(0, intensity));

  ctx.save();
  ctx.globalAlpha = clampedIntensity * 0.6;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

export function selectInterruptType(pacingScore: number): InterruptType {
  const clamped = Math.min(10, Math.max(0, pacingScore));

  if (clamped >= 8) return 'glitch';
  if (clamped >= 6) return 'color_burst';
  if (clamped >= 4) return 'static';
  if (clamped >= 2) return 'frame_skip';
  return 'reverse';
}
