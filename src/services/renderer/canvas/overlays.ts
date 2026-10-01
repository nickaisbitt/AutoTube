/**
 * Draws a rounded rectangle path with fallback for environments without roundRect.
 */
function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, _r: number,
): void {
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, _r);
  } else {
    ctx.beginPath();
    ctx.rect(x, y, w, h);
  }
}

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

  const words = text.split(' ').filter(w => w.length > 0);
  if (words.length === 0) { ctx.restore(); return; }

  // Elastic ease-out for per-word pop-in
  const elasticOut = (t: number): number => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI / 3)) + 1;
  };

  // Overall fade envelope
  let masterAlpha: number;
  if (progress < 0.15) {
    masterAlpha = progress / 0.15;
  } else if (progress > 0.85) {
    masterAlpha = (1 - progress) / 0.15;
  } else {
    masterAlpha = 1;
  }

  const fontSize = Math.round(width / 14);
  const wordGap = Math.round(fontSize * 0.35);
  const padding = width * 0.08;
  const maxTextWidth = width - padding * 2;

  ctx.font = `900 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;

  // Measure and wrap words into lines
  const lines: string[][] = [];
  let currentLine: string[] = [];
  let currentLineWidth = 0;
  for (const word of words) {
    const wordW = ctx.measureText(word).width;
    const testWidth = currentLine.length > 0 ? currentLineWidth + wordGap + wordW : wordW;
    if (testWidth > maxTextWidth && currentLine.length > 0) {
      lines.push(currentLine);
      currentLine = [word];
      currentLineWidth = wordW;
    } else {
      currentLine.push(word);
      currentLineWidth = testWidth;
    }
  }
  if (currentLine.length > 0) lines.push(currentLine);

  const lineHeight = Math.round(fontSize * 1.3);
  const totalTextHeight = lines.length * lineHeight;
  const startY = (height - totalTextHeight) / 2 + lineHeight / 2;

  // Background card with gradient
  const bgPadX = fontSize * 0.8;
  const bgPadY = fontSize * 0.6;
  const bgWidth = Math.min(maxTextWidth + bgPadX * 2, width * 0.85);
  const bgHeight = totalTextHeight + bgPadY * 2;
  const bgX = (width - bgWidth) / 2;
  const bgY = (height - bgHeight) / 2;

  ctx.globalAlpha = masterAlpha * 0.85;
  const bgGrad = ctx.createLinearGradient(bgX, bgY, bgX, bgY + bgHeight);
  bgGrad.addColorStop(0, 'rgba(10, 10, 30, 0.90)');
  bgGrad.addColorStop(1, 'rgba(20, 10, 40, 0.85)');
  ctx.fillStyle = bgGrad;
  roundedRect(ctx, bgX, bgY, bgWidth, bgHeight, 16);
  ctx.fill();

  // Accent border glow
  ctx.strokeStyle = 'rgba(96, 165, 250, 0.3)';
  ctx.lineWidth = 2;
  roundedRect(ctx, bgX, bgY, bgWidth, bgHeight, 16);
  ctx.stroke();

  // Accent bar at top
  ctx.fillStyle = '#60a5fa';
  ctx.fillRect(bgX + bgPadX, bgY, bgWidth - bgPadX * 2, 3);

  ctx.globalAlpha = masterAlpha;

  // Draw each word with staggered pop-in animation
  let globalWordIdx = 0;
  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    const lineY = startY + lineIdx * lineHeight;

    // Measure line width for centering
    let lineWidth = 0;
    const wordWidths: number[] = [];
    for (const word of line) {
      const ww = ctx.measureText(word).width;
      wordWidths.push(ww);
      lineWidth += ww;
    }
    lineWidth += wordGap * (line.length - 1);

    let curX = (width - lineWidth) / 2;

    for (let wi = 0; wi < line.length; wi++) {
      const word = line[wi];
      const ww = wordWidths[wi];

      // Staggered animation: each word starts 0.08 progress later
      const wordDelay = globalWordIdx * 0.08;
      const wordProgress = Math.max(0, Math.min(1, (progress - wordDelay) / 0.3));
      const easedProgress = elasticOut(wordProgress);

      const wordAlpha = Math.min(1, wordProgress * 3);
      const wordScale = 0.5 + easedProgress * 0.5;
      const wordOffsetY = (1 - easedProgress) * fontSize * 0.5;

      ctx.save();
      ctx.globalAlpha = masterAlpha * wordAlpha;

      const wordCenterX = curX + ww / 2;
      const wordCenterY = lineY + wordOffsetY;
      ctx.translate(wordCenterX, wordCenterY);
      ctx.scale(wordScale, wordScale);
      ctx.translate(-wordCenterX, -wordCenterY);

      // Highlight first and last words in accent color
      const isEmphasis = globalWordIdx === 0 || globalWordIdx === words.length - 1;
      ctx.font = `900 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';

      // Text shadow
      ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
      ctx.shadowBlur = 16;
      ctx.shadowOffsetY = 3;

      ctx.fillStyle = isEmphasis ? '#60a5fa' : '#ffffff';
      ctx.fillText(word, curX, wordCenterY);

      ctx.restore();

      curX += ww + wordGap;
      globalWordIdx++;
    }
  }

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

  // Overall fade envelope
  let opacity: number;
  if (progress < 0.15) {
    opacity = progress / 0.15;
  } else if (progress > 0.85) {
    opacity = (1 - progress) / 0.15;
  } else {
    opacity = 1;
  }

  ctx.globalAlpha = opacity;

  const accentColor = '#00bcd4';
  const accentColorAlt = '#7c3aed';

  // Animated border glow
  const maxBorderWidth = Math.max(2, Math.round(width / 120));
  const borderWidth = maxBorderWidth * Math.min(progress * 2, 1);
  if (borderWidth > 0) {
    ctx.shadowColor = accentColor;
    ctx.shadowBlur = 12;
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = borderWidth;
    const inset = borderWidth / 2;
    ctx.strokeRect(inset, inset, width - borderWidth, height - borderWidth);
    ctx.shadowBlur = 0;
  }

  // Corner brackets with animated length
  const bracketLen = Math.round(width * 0.06) * Math.min(progress * 3, 1);
  const bracketWeight = Math.max(3, Math.round(width / 180));
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = bracketWeight;
  ctx.lineCap = 'round';

  ctx.beginPath(); ctx.moveTo(0, bracketLen); ctx.lineTo(0, 0); ctx.lineTo(bracketLen, 0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(width - bracketLen, 0); ctx.lineTo(width, 0); ctx.lineTo(width, bracketLen); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, height - bracketLen); ctx.lineTo(0, height); ctx.lineTo(bracketLen, height); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(width - bracketLen, height); ctx.lineTo(width, height); ctx.lineTo(width, height - bracketLen); ctx.stroke();

  // Animated mini bar chart in upper-right corner
  const chartX = width * 0.78;
  const chartY = height * 0.12;
  const chartW = width * 0.16;
  const chartH = height * 0.18;
  const barCount = 5;
  const barGap = 4;
  const barW = (chartW - barGap * (barCount - 1)) / barCount;

  ctx.save();
  ctx.globalAlpha = opacity * 0.7;
  // Chart background
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  roundedRect(ctx, chartX - 12, chartY - 12, chartW + 24, chartH + 24, 8);
  ctx.fill();

  for (let i = 0; i < barCount; i++) {
    const barDelay = i * 0.08;
    const barProgress = Math.max(0, Math.min(1, (progress - barDelay) / 0.4));
    const easedBar = 1 - Math.pow(1 - barProgress, 3); // ease-out cubic
    const barHeight = chartH * (0.3 + (Math.sin(i * 1.5 + 0.5) * 0.5 + 0.5) * 0.7) * easedBar;
    const bx = chartX + i * (barW + barGap);
    const by = chartY + chartH - barHeight;

    const barGrad = ctx.createLinearGradient(bx, by, bx, chartY + chartH);
    barGrad.addColorStop(0, accentColor);
    barGrad.addColorStop(1, accentColorAlt);
    ctx.fillStyle = barGrad;
    roundedRect(ctx, bx, by, barW, barHeight, 3);
    ctx.fill();
  }
  ctx.restore();

  // Concept label in the lower-third area
  const fontSize = Math.round(width / 28);
  const labelY = height * 0.78;
  const padding = fontSize * 0.8;

  ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const textMetrics = ctx.measureText(concept);
  const bgWidth = Math.min(textMetrics.width + padding * 2, width * 0.8);
  const bgHeight = fontSize + padding * 2;
  const bgX = (width - bgWidth) / 2;
  const bgY = labelY - bgHeight / 2;

  // Glass-morphism background
  ctx.fillStyle = 'rgba(10, 10, 30, 0.80)';
  roundedRect(ctx, bgX, bgY, bgWidth, bgHeight, 12);
  ctx.fill();

  // Accent border
  ctx.strokeStyle = 'rgba(0, 188, 212, 0.25)';
  ctx.lineWidth = 1;
  roundedRect(ctx, bgX, bgY, bgWidth, bgHeight, 12);
  ctx.stroke();

  // Animated accent underline (grows from center)
  const underlineProgress = Math.min(1, progress * 2);
  const underlineWidth = (bgWidth - padding * 2) * underlineProgress;
  const underlineX = bgX + (bgWidth - underlineWidth) / 2;
  ctx.fillStyle = accentColor;
  ctx.fillRect(underlineX, bgY + bgHeight - 4, underlineWidth, 3);

  // Draw concept text
  ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
  ctx.shadowBlur = 12;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(concept, width / 2, labelY);

  ctx.restore();
}
