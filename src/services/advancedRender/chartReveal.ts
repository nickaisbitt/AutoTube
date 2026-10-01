import type { RenderContext2D } from '../renderingShared';

export type RevealStyle = 'left_to_right' | 'bottom_to_top' | 'fade_in' | 'highlight';

export function drawProgressiveReveal(
  ctx: RenderContext2D,
  image: any,
  progress: number,
  style: RevealStyle,
  w: number,
  h: number,
): void {
  if (w <= 0 || h <= 0 || !image) return;
  if (progress <= 0 || progress >= 1) return;

  ctx.save();

  switch (style) {
    case 'left_to_right': {
      const revealW = w * progress;
      ctx.beginPath();
      ctx.rect(0, 0, revealW, h);
      ctx.clip();
      ctx.drawImage(image, 0, 0, w, h);
      break;
    }

    case 'bottom_to_top': {
      const revealH = h * progress;
      const startY = h - revealH;
      ctx.beginPath();
      ctx.rect(0, startY, w, revealH);
      ctx.clip();
      ctx.drawImage(image, 0, 0, w, h);
      break;
    }

    case 'fade_in': {
      ctx.globalAlpha = progress;
      ctx.drawImage(image, 0, 0, w, h);
      break;
    }

    case 'highlight': {
      ctx.globalAlpha = 0.3;
      ctx.drawImage(image, 0, 0, w, h);

      ctx.globalAlpha = 1.0;
      const revealW = w * progress;
      ctx.beginPath();
      ctx.rect(0, 0, revealW, h);
      ctx.clip();
      ctx.drawImage(image, 0, 0, w, h);
      break;
    }
  }

  ctx.restore();
}

const CHART_KEYWORDS = /\b(chart|graph|diagram|plot|figure|statistics|infographic|data\s*vis)\b/i;

export function isChartAsset(url: string, alt: string): boolean {
  if (!url && !alt) return false;
  const combined = `${url || ''} ${alt || ''}`;
  return CHART_KEYWORDS.test(combined);
}
