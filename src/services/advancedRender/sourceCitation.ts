import type { RenderContext2D } from '../renderingShared';
import { roundRect } from '../renderingShared';

export interface CitationConfig {
  source: string;
  url?: string;
  fadeInDuration: number;
  holdDuration: number;
  fadeOutDuration: number;
}

export function drawCitationBadge(
  ctx: RenderContext2D,
  config: CitationConfig,
  currentTime: number,
  w: number,
  h: number,
): void {
  if (w <= 0 || h <= 0 || !config.source) return;

  const totalDuration = config.fadeInDuration + config.holdDuration + config.fadeOutDuration;
  if (currentTime < 0 || currentTime > totalDuration) return;

  let alpha = 1;

  if (currentTime < config.fadeInDuration) {
    alpha = currentTime / config.fadeInDuration;
  } else if (currentTime > config.fadeInDuration + config.holdDuration) {
    const fadeOutElapsed = currentTime - config.fadeInDuration - config.holdDuration;
    alpha = 1 - fadeOutElapsed / config.fadeOutDuration;
  }

  if (alpha <= 0) return;

  const badgeText = `Source: ${config.source}`;
  ctx.save();
  ctx.font = '14px sans-serif';
  const textMetrics = ctx.measureText(badgeText);
  const badgeW = textMetrics.width + 28;
  const badgeH = 32;
  const badgeX = w - badgeW - 20;
  const badgeY = h - badgeH - 20;

  ctx.globalAlpha = alpha * 0.85;
  ctx.fillStyle = 'rgba(10, 10, 20, 0.8)';
  roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 6);
  ctx.fill();

  const ctxAny = ctx as any;
  ctxAny.strokeStyle = 'rgba(255,255,255,0.15)';
  ctxAny.lineWidth = 1;
  roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 6);
  ctx.stroke();

  ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = '14px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(badgeText, badgeX + 14, badgeY + badgeH / 2);

  ctx.restore();
}

const CITATION_PATTERNS = [
  /according to ([A-Z][^,.]+)/g,
  /as reported by ([A-Z][^,.]+)/g,
  /data from ([A-Z][^,.]+)/g,
  /research by ([A-Z][^,.]+)/g,
  /a study by ([A-Z][^,.]+)/g,
  /citing ([A-Z][^,.]+)/g,
  /per ([A-Z][^,.]+(?:'s)? (?:report|study|analysis|data|findings))/g,
];

export function extractCitationsFromSegments(
  segments: { narration: string }[],
): { segmentIndex: number; source: string }[] {
  if (!segments || segments.length === 0) return [];

  const results: { segmentIndex: number; source: string }[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < segments.length; i++) {
    const narration = segments[i].narration;
    if (!narration) continue;

    for (const pattern of CITATION_PATTERNS) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = pattern.exec(narration)) !== null) {
        const source = match[1].trim();
        if (source.length < 3 || source.length > 80) continue;

        const key = `${i}:${source}`;
        if (seen.has(key)) continue;
        seen.add(key);

        results.push({ segmentIndex: i, source });
      }
    }
  }

  return results;
}
