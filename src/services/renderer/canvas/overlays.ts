/**
 * Draws a large animated text overlay centred on the canvas.
 *
 * The overlay fades in at the start and fades out at the end of the progress
 * range, with a slight zoom effect for visual interest. A semi-transparent
 * dark background is drawn behind the text for readability.
 *
 * Uses `ctx.save()` / `ctx.restore()` so no canvas state is mutated beyond
 * the overlay drawing itself.
 *
 * Requirement 10.4
 *
 * @param ctx      - A valid 2D rendering context.
 * @param width    - Canvas width in pixels (> 0).
 * @param height   - Canvas height in pixels (> 0).
 * @param text     - The text to display (non-empty string).
 * @param progress - Animation progress in [0, 1].
 */
export function drawKineticTextOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  text: string,
  progress: number,
): void {
  ctx.save();

  // ── Animate opacity: fade in during first 20%, full during middle, fade out last 20% ──
  let opacity: number;
  if (progress < 0.2) {
    opacity = progress / 0.2;
  } else if (progress > 0.8) {
    opacity = (1 - progress) / 0.2;
  } else {
    opacity = 1;
  }

  // ── Animate scale: slight zoom from 0.9 → 1.05 over progress ──
  const scale = 0.9 + progress * 0.15;

  // ── Font size based on canvas width ──
  const fontSize = Math.round(width / 15);
  const padding = width * 0.1;
  const maxTextWidth = width - padding * 2;

  ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // ── Truncate text to fit within canvas width with padding ──
  let displayText = text;
  let measured = ctx.measureText(displayText);
  if (measured.width > maxTextWidth && displayText.length > 3) {
    while (measured.width > maxTextWidth && displayText.length > 3) {
      displayText = displayText.slice(0, -1);
      measured = ctx.measureText(displayText + '…');
    }
    displayText = displayText + '…';
  }

  // ── Apply scale transform around canvas centre ──
  ctx.translate(width / 2, height / 2);
  ctx.scale(scale, scale);
  ctx.translate(-width / 2, -height / 2);

  ctx.globalAlpha = opacity;

  // ── Semi-transparent dark background behind text for readability ──
  const textMetrics = ctx.measureText(displayText);
  const bgPadX = fontSize * 0.6;
  const bgPadY = fontSize * 0.4;
  const bgWidth = textMetrics.width + bgPadX * 2;
  const bgHeight = fontSize + bgPadY * 2;
  const bgX = (width - bgWidth) / 2;
  const bgY = (height - bgHeight) / 2;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.fillRect(bgX, bgY, bgWidth, bgHeight);

  // ── Draw text centred in white ──
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 2;
  ctx.fillText(displayText, width / 2, height / 2);

  ctx.restore();
}

/**
 * Draws a data-emphasis overlay with accent borders and a concept label.
 *
 * The overlay features animated cyan/teal accent borders around the canvas
 * edges and a concept label in the lower-third area with a semi-transparent
 * background, styled for an infographic / data-visualization aesthetic.
 *
 * Uses `ctx.save()` / `ctx.restore()` so no canvas state is mutated beyond
 * the overlay drawing itself.
 *
 * Requirement 10.5
 *
 * @param ctx      - A valid 2D rendering context.
 * @param width    - Canvas width in pixels (> 0).
 * @param height   - Canvas height in pixels (> 0).
 * @param concept  - A string describing the data concept to display.
 * @param progress - Animation progress in [0, 1].
 */
export function drawDiagramOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  concept: string,
  progress: number,
): void {
  ctx.save();

  // ── Animate opacity: fade in during first 20%, full during middle, fade out last 20% ──
  let opacity: number;
  if (progress < 0.2) {
    opacity = progress / 0.2;
  } else if (progress > 0.8) {
    opacity = (1 - progress) / 0.2;
  } else {
    opacity = 1;
  }

  ctx.globalAlpha = opacity;

  // ── Accent borders — animated border width based on progress ──
  const maxBorderWidth = Math.max(2, Math.round(width / 120));
  const borderWidth = maxBorderWidth * Math.min(progress * 2, 1); // grows to full in first half
  const accentColor = '#00bcd4'; // cyan/teal

  if (borderWidth > 0) {
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = borderWidth;
    const inset = borderWidth / 2;
    ctx.strokeRect(inset, inset, width - borderWidth, height - borderWidth);
  }

  // ── Corner accents — small L-shaped brackets at each corner ──
  const bracketLen = Math.round(width * 0.06);
  const bracketWeight = Math.max(2, Math.round(width / 200));
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = bracketWeight;

  // Top-left
  ctx.beginPath();
  ctx.moveTo(0, bracketLen);
  ctx.lineTo(0, 0);
  ctx.lineTo(bracketLen, 0);
  ctx.stroke();

  // Top-right
  ctx.beginPath();
  ctx.moveTo(width - bracketLen, 0);
  ctx.lineTo(width, 0);
  ctx.lineTo(width, bracketLen);
  ctx.stroke();

  // Bottom-left
  ctx.beginPath();
  ctx.moveTo(0, height - bracketLen);
  ctx.lineTo(0, height);
  ctx.lineTo(bracketLen, height);
  ctx.stroke();

  // Bottom-right
  ctx.beginPath();
  ctx.moveTo(width - bracketLen, height);
  ctx.lineTo(width, height);
  ctx.lineTo(width, height - bracketLen);
  ctx.stroke();

  // ── Concept label in the lower-third area ──
  const fontSize = Math.round(width / 30);
  const labelY = height * 0.78;
  const padding = fontSize * 0.6;

  ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const textMetrics = ctx.measureText(concept);
  const bgWidth = textMetrics.width + padding * 2;
  const bgHeight = fontSize + padding * 2;
  const bgX = (width - bgWidth) / 2;
  const bgY = labelY - bgHeight / 2;

  // Semi-transparent dark background behind label
  ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
  ctx.fillRect(bgX, bgY, bgWidth, bgHeight);

  // Accent underline below the label background
  ctx.fillStyle = accentColor;
  const underlineHeight = Math.max(2, Math.round(fontSize * 0.1));
  ctx.fillRect(bgX, bgY + bgHeight, bgWidth, underlineHeight);

  // Draw concept text in white
  ctx.fillStyle = '#ffffff';
  ctx.fillText(concept, width / 2, labelY);

  ctx.restore();
}
