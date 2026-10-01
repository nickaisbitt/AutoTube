import type { RenderContext2D } from '../renderingShared';
import { hexToRgba } from '../renderingShared';

export function computeLetterboxHeight(
  pacingScore: number,
  progress: number,
  canvasH: number,
): number {
  if (canvasH <= 0) return 0;

  const basePercent = 0.04;

  if (pacingScore >= 4) {
    const pulse = Math.sin(progress * Math.PI * 6) * 0.01;
    const percent = basePercent + pulse;
    return Math.round(canvasH * Math.max(0.03, Math.min(0.05, percent)));
  }

  return Math.round(canvasH * basePercent);
}

export function drawDynamicLetterbox(
  ctx: RenderContext2D,
  w: number,
  h: number,
  pacingScore: number,
  progress: number,
  accentColor?: string,
): void {
  if (w <= 0 || h <= 0) return;

  const barH = computeLetterboxHeight(pacingScore, progress, h);
  if (barH <= 0) return;

  const accent = accentColor || '#e74c3c';
  const edgeFade = Math.max(4, Math.round(barH * 0.25));

  const topGrad = ctx.createLinearGradient(0, 0, 0, barH + edgeFade);
  topGrad.addColorStop(0, 'rgba(0,0,0,1)');
  topGrad.addColorStop(Math.max(0, barH / (barH + edgeFade) - 0.01), 'rgba(0,0,0,1)');
  topGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = topGrad;
  ctx.fillRect(0, 0, w, barH + edgeFade);

  const botGrad = ctx.createLinearGradient(0, h - barH - edgeFade, 0, h);
  botGrad.addColorStop(0, 'rgba(0,0,0,0)');
  botGrad.addColorStop(Math.min(1, edgeFade / (barH + edgeFade) + 0.01), 'rgba(0,0,0,1)');
  botGrad.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.fillStyle = botGrad;
  ctx.fillRect(0, h - barH - edgeFade, w, barH + edgeFade);

  ctx.fillStyle = hexToRgba(accent, 0.8);
  ctx.fillRect(0, barH, w, 1);
  ctx.fillRect(0, h - barH - 1, w, 1);
}
