import type { MediaAsset } from '../../../types';
import { TECHNICAL_LABEL_KEYWORDS } from '../../captionUtils';

/**
 * Converts a 6-digit hex colour string (e.g. `#e74c3c`) to an `rgba(...)` CSS
 * colour string with the given alpha value.
 *
 * Used by the letterbox bar renderer (Requirements 14.1–14.4).
 */
export function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lineH: number, isBold = false): void {
  let line = '', cy = y;
  for (const word of text.split(' ')) {
    const test = line + word + ' ';
    if (ctx.measureText(test).width > maxW && line) {
      if (isBold) {
        ctx.font = ctx.font.replace('normal', 'bold');
      }
      ctx.fillText(line.trim(), x, cy);
      line = word + ' ';
      cy += lineH;
    } else {
      line = test;
    }
  }
  ctx.fillText(line.trim(), x, cy);
}

/**
 * Draws a Technical_Label badge in the top-left corner of the image area when
 * the asset's `concept` or `alt` field contains a keyword from TECHNICAL_LABEL_KEYWORDS.
 *
 * Implements Requirements 4.1–4.5.
 *
 * @param ctx   Canvas 2D rendering context.
 * @param asset The current MediaAsset (may be undefined).
 * @param barH  Height of the letterbox bar at the top of the frame.
 * @param w     Canvas width in pixels.
 */
export function drawTechnicalLabel(
  ctx: CanvasRenderingContext2D,
  asset: MediaAsset | undefined,
  barH: number,
  _w: number,
): void {
  // Requirement 4.5: if no asset, do nothing
  if (!asset) return;

  const haystack = `${asset.concept ?? ''} ${asset.alt ?? ''}`.toLowerCase();

  // Requirement 4.1 / 4.2: case-insensitive keyword match
  let matchedKeyword: string | undefined;
  for (const kw of TECHNICAL_LABEL_KEYWORDS) {
    if (haystack.includes(kw.toLowerCase())) {
      matchedKeyword = kw;
      break;
    }
  }

  // Requirement 4.5: no match → no label
  if (!matchedKeyword) return;

  // Requirement 4.4: truncate to 40 characters
  const labelText = matchedKeyword.slice(0, 40);

  // Requirement 4.3: measure text, draw background rect, then white text
  ctx.save();
  ctx.font = 'bold 14px sans-serif';
  const textW = ctx.measureText(labelText).width;
  const padX = 8;
  const padY = 4;
  const rectX = 12;
  const rectY = barH + 12;
  const rectW = textW + padX * 2;
  const rectH = 14 + padY * 2; // font size + vertical padding

  ctx.fillStyle = 'rgba(0,0,0,0.70)';
  ctx.fillRect(rectX, rectY, rectW, rectH);

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(labelText, rectX + padX, rectY + padY);
  ctx.restore();
}
