import type { RenderContext2D } from '../renderingShared';
import { hexToRgba } from '../renderingShared';

export interface MetricGroup {
  metrics: { value: string; label: string }[];
  revealDelay: number;
  layout: 'horizontal' | 'vertical' | 'grid';
}

export function extractMetricsFromText(
  text: string,
): { value: string; label: string }[] {
  if (!text) return [];

  const metrics: { value: string; label: string }[] = [];

  const percentRegex = /(\d+(?:\.\d+)?%)/g;
  const dollarRegex = /(\$[\d,.]+(?:\s*(?:billion|million|trillion|thousand))?)/gi;
  const largeNumRegex = /(\d{1,3}(?:,\d{3})+(?:\s*(?:billion|million|trillion|thousand))?)/gi;
  const multiplierRegex = /(\d+(?:\.\d+)?x)/gi;

  let match: RegExpExecArray | null;

  while ((match = percentRegex.exec(text)) !== null) {
    const contextStart = Math.max(0, match.index - 40);
    const contextEnd = Math.min(text.length, match.index + match[0].length + 40);
    const context = text.substring(contextStart, contextEnd).trim();
    metrics.push({ value: match[0], label: extractLabel(context, match[0]) });
  }

  while ((match = dollarRegex.exec(text)) !== null) {
    const contextStart = Math.max(0, match.index - 40);
    const contextEnd = Math.min(text.length, match.index + match[0].length + 40);
    const context = text.substring(contextStart, contextEnd).trim();
    metrics.push({ value: match[0], label: extractLabel(context, match[0]) });
  }

  while ((match = largeNumRegex.exec(text)) !== null) {
    const alreadyCaptured = metrics.some(m => m.value === match![0]);
    if (!alreadyCaptured) {
      const contextStart = Math.max(0, match.index - 40);
      const contextEnd = Math.min(text.length, match.index + match[0].length + 40);
      const context = text.substring(contextStart, contextEnd).trim();
      metrics.push({ value: match[0], label: extractLabel(context, match[0]) });
    }
  }

  while ((match = multiplierRegex.exec(text)) !== null) {
    const contextStart = Math.max(0, match.index - 40);
    const contextEnd = Math.min(text.length, match.index + match[0].length + 40);
    const context = text.substring(contextStart, contextEnd).trim();
    metrics.push({ value: match[0], label: extractLabel(context, match[0]) });
  }

  return metrics;
}

function extractLabel(context: string, value: string): string {
  const withoutValue = context.replace(value, '').trim();
  const words = withoutValue.split(/\s+/).filter(w => w.length > 2);
  const labelWords = words.slice(0, 4);
  return labelWords.length > 0 ? labelWords.join(' ') : 'metric';
}

export function groupMetricsByThree(
  metrics: { value: string; label: string }[],
): MetricGroup[] {
  if (!metrics || metrics.length === 0) return [];

  const groups: MetricGroup[] = [];

  for (let i = 0; i < metrics.length; i += 3) {
    const chunk = metrics.slice(i, i + 3);
    const layout: MetricGroup['layout'] = chunk.length <= 2 ? 'vertical' : 'horizontal';

    groups.push({
      metrics: chunk,
      revealDelay: i * 0.1,
      layout: chunk.length === 4 ? 'grid' : layout,
    });
  }

  return groups;
}

export function drawMetricGroup(
  ctx: RenderContext2D,
  group: MetricGroup,
  progress: number,
  w: number,
  h: number,
  accentColor: string,
): void {
  if (w <= 0 || h <= 0 || !group.metrics || group.metrics.length === 0) return;

  const clampedProgress = Math.min(1, Math.max(0, progress));
  const metricCount = group.metrics.length;
  const revealDelayPerMetric = 0.3;

  const valueFontSize = Math.round(h * 0.06);
  const labelFontSize = Math.round(h * 0.025);

  ctx.save();

  if (group.layout === 'horizontal') {
    const slotWidth = w / metricCount;

    for (let i = 0; i < metricCount; i++) {
      const metricProgress = Math.max(0, Math.min(1, (clampedProgress - i * revealDelayPerMetric / 2) * 2));
      if (metricProgress <= 0) continue;

      const metric = group.metrics[i];
      const cx = slotWidth * i + slotWidth / 2;
      const cy = h / 2;

      ctx.globalAlpha = metricProgress;

      ctx.font = `bold ${valueFontSize}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(metric.value, cx, cy - valueFontSize * 0.4);

      ctx.font = `${labelFontSize}px sans-serif`;
      ctx.fillStyle = '#cccccc';
      ctx.fillText(metric.label, cx, cy + valueFontSize * 0.5);

      const underlineWidth = ctx.measureText(metric.value).width;
      const underlineProgress = Math.max(0, (metricProgress - 0.5) * 2);
      if (underlineProgress > 0) {
        ctx.fillStyle = hexToRgba(accentColor, 1);
        ctx.fillRect(
          cx - underlineWidth / 2,
          cy + valueFontSize * 0.15,
          underlineWidth * underlineProgress,
          3,
        );
      }
    }
  } else if (group.layout === 'vertical') {
    const slotHeight = h / (metricCount + 1);

    for (let i = 0; i < metricCount; i++) {
      const metricProgress = Math.max(0, Math.min(1, (clampedProgress - i * revealDelayPerMetric / 2) * 2));
      if (metricProgress <= 0) continue;

      const metric = group.metrics[i];
      const cx = w / 2;
      const cy = slotHeight * (i + 1);

      ctx.globalAlpha = metricProgress;

      ctx.font = `bold ${valueFontSize}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(metric.value, cx, cy - valueFontSize * 0.3);

      ctx.font = `${labelFontSize}px sans-serif`;
      ctx.fillStyle = '#cccccc';
      ctx.fillText(metric.label, cx, cy + valueFontSize * 0.4);

      const underlineWidth = ctx.measureText(metric.value).width;
      const underlineProgress = Math.max(0, (metricProgress - 0.5) * 2);
      if (underlineProgress > 0) {
        ctx.fillStyle = hexToRgba(accentColor, 1);
        ctx.fillRect(
          cx - underlineWidth / 2,
          cy + valueFontSize * 0.05,
          underlineWidth * underlineProgress,
          3,
        );
      }
    }
  } else {
    const cols = 2;
    const rows = Math.ceil(metricCount / cols);
    const cellW = w / cols;
    const cellH = h / (rows + 1);

    for (let i = 0; i < metricCount; i++) {
      const metricProgress = Math.max(0, Math.min(1, (clampedProgress - i * revealDelayPerMetric / 2) * 2));
      if (metricProgress <= 0) continue;

      const metric = group.metrics[i];
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = cellW * col + cellW / 2;
      const cy = cellH * (row + 1);

      ctx.globalAlpha = metricProgress;

      const gridValueSize = Math.round(valueFontSize * 0.8);
      ctx.font = `bold ${gridValueSize}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(metric.value, cx, cy - gridValueSize * 0.3);

      ctx.font = `${labelFontSize}px sans-serif`;
      ctx.fillStyle = '#cccccc';
      ctx.fillText(metric.label, cx, cy + gridValueSize * 0.4);

      const underlineWidth = ctx.measureText(metric.value).width;
      const underlineProgress = Math.max(0, (metricProgress - 0.5) * 2);
      if (underlineProgress > 0) {
        ctx.fillStyle = hexToRgba(accentColor, 1);
        ctx.fillRect(
          cx - underlineWidth / 2,
          cy + gridValueSize * 0.05,
          underlineWidth * underlineProgress,
          3,
        );
      }
    }
  }

  ctx.restore();
}
