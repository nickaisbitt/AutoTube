import type { RenderContext2D } from '../renderingShared';
import { roundRect, hexToRgba } from '../renderingShared';

export interface TimelineConfig {
  segments: { title: string; duration: number }[];
  accentColor: string;
  showNotches: boolean;
  showLabels: boolean;
  glowIntensity: number;
}

export function computeNotchPositions(
  segments: { duration: number }[],
  totalDuration: number,
): number[] {
  if (totalDuration <= 0 || segments.length === 0) return [];

  const positions: number[] = [];
  let cumulative = 0;

  for (let i = 0; i < segments.length - 1; i++) {
    cumulative += segments[i].duration;
    positions.push(cumulative / totalDuration);
  }

  return positions;
}

export function drawEnhancedTimeline(
  ctx: RenderContext2D,
  config: TimelineConfig,
  globalProgress: number,
  w: number,
  h: number,
): void {
  if (w <= 0 || h <= 0 || config.segments.length === 0) return;

  const barH = 6;
  const barY = h - 40;
  const barX = w * 0.05;
  const barW = w * 0.9;
  const totalDuration = config.segments.reduce((sum, s) => sum + s.duration, 0);

  if (totalDuration <= 0) return;

  ctx.save();

  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  roundRect(ctx, barX, barY, barW, barH, barH / 2);
  ctx.fill();

  const filledW = barW * Math.min(1, Math.max(0, globalProgress));

  if (filledW > 0) {
    const grad = ctx.createLinearGradient(barX, barY, barX + barW, barY);
    grad.addColorStop(0, config.accentColor);
    grad.addColorStop(1, hexToRgba(config.accentColor, 0.6));

    ctx.shadowColor = config.accentColor;
    ctx.shadowBlur = config.glowIntensity * 8;
    ctx.fillStyle = grad;
    roundRect(ctx, barX, barY, filledW, barH, barH / 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  if (config.showNotches) {
    const notchPositions = computeNotchPositions(config.segments, totalDuration);

    for (let i = 0; i < notchPositions.length; i++) {
      const notchX = barX + barW * notchPositions[i];
      const isCurrent = Math.abs(notchPositions[i] - globalProgress) < 0.02;
      const pulseGlow = isCurrent ? Math.sin(Date.now() * 0.005) * 0.3 + 0.7 : 0.5;

      ctx.fillStyle = `rgba(255,255,255,${pulseGlow})`;
      ctx.beginPath();
      ctx.arc(notchX, barY + barH / 2, isCurrent ? 5 : 3, 0, Math.PI * 2);
      ctx.fill();

      if (isCurrent) {
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      if (config.showLabels && config.segments[i]) {
        ctx.fillStyle = `rgba(255,255,255,${isCurrent ? 0.9 : 0.5})`;
        ctx.font = `${isCurrent ? 'bold ' : ''}11px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(config.segments[i].title, notchX, barY + barH + 8, 80);
      }
    }
  }

  ctx.restore();
}
