import type { RenderContext2D } from '../renderingShared';
import { roundRect } from '../renderingShared';

export interface TextGridConfig {
  cells: {
    text: string;
    fontSize: number;
    color: string;
    weight: string;
  }[];
  columns: number;
  gap: number;
  padding: number;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function autoFontSize(text: string): number {
  const len = text.length;
  if (len <= 10) return 32;
  if (len <= 20) return 26;
  if (len <= 40) return 20;
  if (len <= 60) return 16;
  return 14;
}

export function createTextGrid(
  items: string[],
  columns: number = 2,
  accentColor: string = '#3498db',
): TextGridConfig {
  const cells = items.map((text, i) => ({
    text,
    fontSize: autoFontSize(text),
    color: i % 2 === 0 ? accentColor : '#ffffff',
    weight: i % 2 === 0 ? 'bold' : 'normal',
  }));

  return {
    cells,
    columns,
    gap: 16,
    padding: 24,
  };
}

export function drawTextGrid(
  ctx: RenderContext2D,
  config: TextGridConfig,
  progress: number,
  w: number,
  h: number,
): void {
  if (w <= 0 || h <= 0 || config.cells.length === 0) return;
  if (progress <= 0 || progress >= 1) return;

  const { cells, columns, gap, padding } = config;
  const rows = Math.ceil(cells.length / columns);
  const totalGapX = gap * (columns - 1);
  const totalGapY = gap * (rows - 1);
  const totalPadX = padding * 2;
  const totalPadY = padding * 2;
  const availableW = w * 0.8 - totalGapX - totalPadX;
  const availableH = h * 0.7 - totalGapY - totalPadY;
  const cellW = availableW / columns;
  const cellH = availableH / rows;
  const startX = (w - (cellW * columns + totalGapX)) / 2;
  const startY = (h - (cellH * rows + totalGapY)) / 2;

  ctx.save();

  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    const col = i % columns;
    const row = Math.floor(i / columns);
    const cellDelay = i * 0.1;
    const cellProgress = Math.max(0, Math.min(1, (progress - cellDelay) / 0.3));

    if (cellProgress <= 0) continue;

    const eased = easeOutCubic(cellProgress);
    const alpha = eased;
    const scale = 0.9 + 0.1 * eased;

    const cx = startX + col * (cellW + gap) + cellW / 2;
    const cy = startY + row * (cellH + gap) + cellH / 2;
    const x = cx - cellW / 2;
    const y = cy - cellH / 2;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.translate(-cx, -cy);

    ctx.fillStyle = 'rgba(20, 20, 30, 0.8)';
    roundRect(ctx, x, y, cellW, cellH, 10);
    ctx.fill();

    const ctxAny = ctx as any;
    ctxAny.strokeStyle = cell.color;
    ctxAny.lineWidth = 1.5;
    roundRect(ctx, x, y, cellW, cellH, 10);
    ctx.stroke();

    ctx.fillStyle = cell.color;
    ctx.font = `${cell.weight} ${cell.fontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(cell.text, cx, cy, cellW - padding);

    ctx.restore();
  }

  ctx.restore();
}
