import type { RenderContext2D } from '../renderingShared';

export function drawChromaticAberration(
  ctx: RenderContext2D,
  canvasW: number,
  canvasH: number,
  intensity: number,
): void {
  if (canvasW <= 0 || canvasH <= 0 || intensity === 0) return;

  const ctxAny = ctx as any;
  if (typeof ctxAny.getImageData !== 'function' || typeof ctxAny.putImageData !== 'function') return;

  const scaledIntensity = Math.round(intensity * (canvasW / 1920));
  if (scaledIntensity === 0) return;

  const imageData: ImageData = ctxAny.getImageData(0, 0, canvasW, canvasH);
  const src = new Uint8ClampedArray(imageData.data);
  const dst = imageData.data;
  const shift = scaledIntensity;

  for (let y = 0; y < canvasH; y++) {
    for (let x = 0; x < canvasW; x++) {
      const i = (y * canvasW + x) * 4;

      const rSrcX = Math.min(canvasW - 1, Math.max(0, x - shift));
      const rI = (y * canvasW + rSrcX) * 4;
      dst[i] = src[rI];

      dst[i + 1] = src[i + 1];

      const bSrcX = Math.min(canvasW - 1, Math.max(0, x + shift));
      const bI = (y * canvasW + bSrcX) * 4;
      dst[i + 2] = src[bI + 2];

      dst[i + 3] = src[i + 3];
    }
  }

  ctxAny.putImageData(imageData, 0, 0);
}

export function drawChromaticTransition(
  ctx: RenderContext2D,
  canvasW: number,
  canvasH: number,
  transitionProgress: number,
): void {
  if (canvasW <= 0 || canvasH <= 0) return;
  if (transitionProgress <= 0 || transitionProgress >= 1) return;

  const intensity = Math.sin(transitionProgress * Math.PI) * 8;
  if (intensity < 0.5) return;

  drawChromaticAberration(ctx, canvasW, canvasH, intensity);
}
