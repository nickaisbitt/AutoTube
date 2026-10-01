import type { ScriptSegment, SceneLayoutType } from '../../../types';
import { wrapTitleText, type SafeZone } from '../../renderingShared';

/**
 * Draws a procedural fallback background for scene layouts when no image is available.
 */
function drawSceneLayoutFallback(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  segType: string,
): void {
  const palettes: Record<string, { bg: string[]; accent: string }> = {
    intro:      { bg: ['#1a1a3e', '#2a1a5e', '#1a2a4e'], accent: '#e74c3c' },
    section:    { bg: ['#1a1a3e', '#1a2a5e', '#1a3a6e'], accent: '#3498db' },
    transition: { bg: ['#2a2a1a', '#3a2a1a', '#2a1a1a'], accent: '#f39c12' },
    outro:      { bg: ['#1a2a2a', '#1a3a2a', '#1a2a3a'], accent: '#2ecc71' },
  };
  const p = palettes[segType] || palettes.section;

  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, p.bg[0]);
  grad.addColorStop(0.5, p.bg[1]);
  grad.addColorStop(1, p.bg[2]);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

/**
 * Extracts the most prominent stat/number from narration text.
 * Returns the matched string or null.
 */
function extractStatFromNarration(text: string): string | null {
  if (!text) return null;
  const patterns = [
    /\$[\d,.]+\s*(billion|million|trillion)?/i,
    /\d+(\.\d+)?%/,
    /\d[\d,]*\s*(billion|million|trillion)/i,
  ];
  for (const pat of patterns) {
    const m = text.match(pat);
    if (m) return m[0];
  }
  return null;
}

/**
 * drawSceneStatCard — large number/stat centered with accent background.
 * Used for segments with statistical content (dollar amounts, percentages, large numbers).
 *
 * Requirements 3.1, 3.5, 4.1, 5.3
 */
export function drawSceneStatCard(
  ctx: CanvasRenderingContext2D,
  seg: ScriptSegment,
  img: HTMLImageElement | undefined,
  w: number,
  h: number,
  safeZone: SafeZone,
): void {
  // Draw background image if available, otherwise procedural gradient
  if (img) {
    const iw = img.naturalWidth || img.width || 1280;
    const ih = img.naturalHeight || img.height || 720;
    const scale = Math.max(w / iw, h / ih);
    const dw = iw * scale, dh = ih * scale;
    ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
  } else {
    drawSceneLayoutFallback(ctx, w, h, seg.type);
  }

  // Semi-transparent dark overlay covering the full frame for contrast
  const overlay = ctx.createLinearGradient(0, 0, 0, h);
  overlay.addColorStop(0, 'rgba(0,0,0,0.75)');
  overlay.addColorStop(0.5, 'rgba(0,0,0,0.65)');
  overlay.addColorStop(1, 'rgba(0,0,0,0.75)');
  ctx.fillStyle = overlay;
  ctx.fillRect(0, 0, w, h);

  // Extract the stat from narration
  const stat = extractStatFromNarration(seg.narration);
  const displayStat = stat || seg.title;

  // Accent background pill behind the stat
  const accentColors: Record<string, string> = { intro: '#e74c3c', section: '#3498db', transition: '#f39c12', outro: '#2ecc71' };
  const accent = accentColors[seg.type] || '#3498db';

  ctx.save();
  ctx.font = `bold ${Math.round(h * 0.1)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const statW = ctx.measureText(displayStat).width;
  const pillPadX = 40;
  const pillPadY = 20;
  const pillW = statW + pillPadX * 2;
  const pillH = Math.round(h * 0.1) + pillPadY * 2;
  const pillX = (w - pillW) / 2;
  const pillY = h * 0.35 - pillH / 2;

  // Draw accent pill
  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.85;
  ctx.fillRect(pillX, pillY, pillW, pillH);
  ctx.globalAlpha = 1.0;

  // Draw stat text
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur = 12;
  ctx.fillText(displayStat, w / 2, h * 0.35);
  ctx.restore();

  // Draw segment title below the stat within safe zone
  ctx.save();
  const titleFontSize = Math.round(h * 0.035);
  ctx.font = `bold ${titleFontSize}px sans-serif`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.8)';
  ctx.shadowBlur = 8;
  const titleY = Math.min(h * 0.52, h - safeZone.bottom - 80);
  const { lines: titleLines, fontSize: wrappedFontSize } = wrapTitleText(ctx, seg.title, w, titleFontSize);
  ctx.font = `bold ${wrappedFontSize}px sans-serif`;
  const lineHeight = wrappedFontSize * 1.3;
  for (let i = 0; i < titleLines.length; i++) {
    ctx.fillText(titleLines[i], w / 2, titleY + i * lineHeight);
  }
  ctx.restore();

  // Draw narration excerpt in the lower portion within safe zone
  if (seg.narration) {
    const maxNarrationY = h - safeZone.bottom - 20;
    const narrationY = Math.min(h * 0.65, maxNarrationY);
    ctx.save();
    ctx.font = `${Math.round(h * 0.025)}px sans-serif`;
    ctx.fillStyle = '#d4d4d8';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = 6;
    const excerpt = seg.narration.substring(0, 80) + (seg.narration.length > 80 ? '...' : '');
    ctx.fillText(excerpt, w / 2, narrationY);
    ctx.restore();
  }
}

/**
 * drawSceneQuoteCard — narration excerpt in large italic font with attribution.
 * Used for human story segments or segments with notable quotes.
 *
 * Requirements 3.1, 3.5, 4.1, 5.3
 */
export function drawSceneQuoteCard(
  ctx: CanvasRenderingContext2D,
  seg: ScriptSegment,
  img: HTMLImageElement | undefined,
  w: number,
  h: number,
  safeZone: SafeZone,
): void {
  // Draw background image if available
  if (img) {
    const iw = img.naturalWidth || img.width || 1280;
    const ih = img.naturalHeight || img.height || 720;
    const scale = Math.max(w / iw, h / ih);
    const dw = iw * scale, dh = ih * scale;
    ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
  } else {
    drawSceneLayoutFallback(ctx, w, h, seg.type);
  }

  // Dark gradient overlay for text contrast
  const overlay = ctx.createLinearGradient(0, 0, 0, h);
  overlay.addColorStop(0, 'rgba(0,0,0,0.70)');
  overlay.addColorStop(0.4, 'rgba(0,0,0,0.60)');
  overlay.addColorStop(1, 'rgba(0,0,0,0.80)');
  ctx.fillStyle = overlay;
  ctx.fillRect(0, 0, w, h);

  // Extract a quote-worthy excerpt from narration (first sentence or first 120 chars)
  let quoteText = '';
  if (seg.narration) {
    const firstSentence = seg.narration.match(/^[^.!?]+[.!?]/);
    quoteText = firstSentence ? firstSentence[0] : seg.narration.substring(0, 120);
    if (quoteText.length > 120) quoteText = quoteText.substring(0, 117) + '...';
  }

  const maxTextW = w - safeZone.left - safeZone.right - 80;
  const fontSize = Math.round(h * 0.04);

  // Opening quote mark
  ctx.save();
  ctx.font = `bold ${Math.round(h * 0.12)}px serif`;
  ctx.fillStyle = '#e74c3c';
  ctx.globalAlpha = 0.6;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('\u201C', safeZone.left + 20, safeZone.top + h * 0.15);
  ctx.restore();

  // Quote text — large italic font, word-wrapped within safe zone
  if (quoteText) {
    ctx.save();
    ctx.font = `italic ${fontSize}px sans-serif`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = 12;

    // Simple word wrapping
    const words = quoteText.split(' ');
    const lines: string[] = [];
    let currentLine = '';
    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      if (ctx.measureText(testLine).width > maxTextW && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) lines.push(currentLine);

    const lineHeight = fontSize * 1.5;
    const startY = h * 0.38 - (lines.length * lineHeight) / 2;
    for (let i = 0; i < lines.length; i++) {
      const lineY = Math.max(safeZone.top + fontSize, Math.min(startY + i * lineHeight, h - safeZone.bottom - fontSize));
      ctx.fillText(lines[i], w / 2, lineY);
    }
    ctx.restore();
  }

  // Attribution line — segment title as the source
  ctx.save();
  ctx.font = `${Math.round(h * 0.022)}px sans-serif`;
  ctx.fillStyle = '#a1a1aa';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const attrY = Math.min(h * 0.62, h - safeZone.bottom - 40);
  ctx.fillText(`— ${seg.title.substring(0, 50)}`, w / 2, attrY);
  ctx.restore();
}

/**
 * drawSceneLeftTextRightImage — 40/60 split with text left, image right.
 * Used for section segments to provide visual variety.
 *
 * Requirements 3.1, 3.5, 4.1, 5.3
 */
export function drawSceneLeftTextRightImage(
  ctx: CanvasRenderingContext2D,
  seg: ScriptSegment,
  img: HTMLImageElement | undefined,
  w: number,
  h: number,
  safeZone: SafeZone,
): void {
  const splitX = Math.round(w * 0.4); // 40% text, 60% image

  // Left panel: dark gradient background
  const leftGrad = ctx.createLinearGradient(0, 0, splitX, 0);
  leftGrad.addColorStop(0, '#1a1a3e');
  leftGrad.addColorStop(1, '#1a2a5e');
  ctx.fillStyle = leftGrad;
  ctx.fillRect(0, 0, splitX, h);

  // Right panel: image or procedural fallback
  if (img) {
    const iw = img.naturalWidth || img.width || 1280;
    const ih = img.naturalHeight || img.height || 720;
    const rightW = w - splitX;
    const scale = Math.max(rightW / iw, h / ih);
    const dw = iw * scale, dh = ih * scale;
    ctx.save();
    ctx.beginPath();
    ctx.rect(splitX, 0, rightW, h);
    ctx.clip();
    ctx.drawImage(img, splitX + (rightW - dw) / 2, (h - dh) / 2, dw, dh);
    ctx.restore();
  } else {
    // Procedural fallback for right panel
    const palettes: Record<string, string[]> = {
      intro: ['#2a1a5e', '#1a2a5e'], section: ['#1a2a5e', '#1a3a6e'],
      transition: ['#3a2a1a', '#2a1a1a'], outro: ['#1a3a2a', '#1a2a3a'],
    };
    const p = palettes[seg.type] || palettes.section;
    const rightGrad = ctx.createLinearGradient(splitX, 0, w, h);
    rightGrad.addColorStop(0, p[0]);
    rightGrad.addColorStop(1, p[1]);
    ctx.fillStyle = rightGrad;
    ctx.fillRect(splitX, 0, w - splitX, h);
  }

  // Semi-transparent gradient overlay on the right panel edge for blending
  const blendGrad = ctx.createLinearGradient(splitX - 20, 0, splitX + 40, 0);
  blendGrad.addColorStop(0, 'rgba(10,10,26,1)');
  blendGrad.addColorStop(1, 'rgba(10,10,26,0)');
  ctx.fillStyle = blendGrad;
  ctx.fillRect(splitX - 20, 0, 60, h);

  // Text area within left panel safe zone
  const textLeft = safeZone.left + 20;
  const textMaxW = splitX - textLeft - 30;

  // Accent line
  const accentColors: Record<string, string> = { intro: '#e74c3c', section: '#3498db', transition: '#f39c12', outro: '#2ecc71' };
  const accent = accentColors[seg.type] || '#3498db';
  ctx.fillStyle = accent;
  ctx.fillRect(textLeft, safeZone.top + h * 0.2, 60, 3);

  // Segment title — word-wrapped using wrapTitleText
  ctx.save();
  const titleFontSize = Math.round(h * 0.04);
  ctx.font = `bold ${titleFontSize}px sans-serif`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.shadowColor = 'rgba(0,0,0,0.8)';
  ctx.shadowBlur = 8;

  // Word-wrap title within text area
  const titleWords = seg.title.split(' ');
  const titleLines: string[] = [];
  let titleLine = '';
  for (const word of titleWords) {
    const test = titleLine ? `${titleLine} ${word}` : word;
    if (ctx.measureText(test).width > textMaxW && titleLine) {
      titleLines.push(titleLine);
      titleLine = word;
    } else {
      titleLine = test;
    }
  }
  if (titleLine) titleLines.push(titleLine);

  const titleStartY = safeZone.top + h * 0.25;
  for (let i = 0; i < Math.min(titleLines.length, 3); i++) {
    ctx.fillText(titleLines[i], textLeft, titleStartY + i * (titleFontSize * 1.3));
  }
  ctx.restore();

  // Narration excerpt below title
  if (seg.narration) {
    ctx.save();
    const narFontSize = Math.round(h * 0.022);
    ctx.font = `${narFontSize}px sans-serif`;
    ctx.fillStyle = '#d4d4d8';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 4;

    const narStartY = titleStartY + Math.min(titleLines.length, 3) * (titleFontSize * 1.3) + 20;
    const narWords = seg.narration.split(' ');
    const narLines: string[] = [];
    let narLine = '';
    for (const word of narWords) {
      const test = narLine ? `${narLine} ${word}` : word;
      if (ctx.measureText(test).width > textMaxW && narLine) {
        narLines.push(narLine);
        narLine = word;
      } else {
        narLine = test;
      }
    }
    if (narLine) narLines.push(narLine);

    const maxLines = 6;
    const maxNarY = h - safeZone.bottom - narFontSize;
    for (let i = 0; i < Math.min(narLines.length, maxLines); i++) {
      const lineY = narStartY + i * (narFontSize * 1.5);
      if (lineY > maxNarY) break;
      ctx.fillText(narLines[i], textLeft, lineY);
    }
    ctx.restore();
  }
}

/**
 * drawSceneLowerThirdOverlay — full-bleed image with text overlay in bottom third.
 * Used for transition segments and segments with strong imagery.
 *
 * Requirements 3.1, 3.5, 4.1, 5.3
 */
export function drawSceneLowerThirdOverlay(
  ctx: CanvasRenderingContext2D,
  seg: ScriptSegment,
  img: HTMLImageElement | undefined,
  w: number,
  h: number,
  safeZone: SafeZone,
): void {
  // Full-bleed background image
  if (img) {
    const iw = img.naturalWidth || img.width || 1280;
    const ih = img.naturalHeight || img.height || 720;
    const scale = Math.max(w / iw, h / ih);
    const dw = iw * scale, dh = ih * scale;
    ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
  } else {
    drawSceneLayoutFallback(ctx, w, h, seg.type);
  }

  // Dark gradient overlay on the bottom third for text contrast
  const overlayTop = Math.round(h * 0.6);
  const overlay = ctx.createLinearGradient(0, overlayTop, 0, h);
  overlay.addColorStop(0, 'rgba(0,0,0,0)');
  overlay.addColorStop(0.3, 'rgba(0,0,0,0.55)');
  overlay.addColorStop(1, 'rgba(0,0,0,0.85)');
  ctx.fillStyle = overlay;
  ctx.fillRect(0, overlayTop, w, h - overlayTop);

  // Accent line above the text area
  const accentColors: Record<string, string> = { intro: '#e74c3c', section: '#3498db', transition: '#f39c12', outro: '#2ecc71' };
  const accent = accentColors[seg.type] || '#f39c12';
  const textAreaTop = Math.round(h * 0.72);
  ctx.fillStyle = accent;
  ctx.fillRect(safeZone.left + 20, textAreaTop - 8, 80, 3);

  // Segment title in the lower third — wrapped with wrapTitleText
  ctx.save();
  const titleFontSize = Math.round(h * 0.038);
  ctx.font = `bold ${titleFontSize}px sans-serif`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.shadowColor = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur = 12;
  const titleY = Math.min(textAreaTop, h - safeZone.bottom - titleFontSize * 2.5);
  ctx.fillText(seg.title.substring(0, 50), safeZone.left + 20, titleY);
  ctx.restore();

  // Narration excerpt below the title
  if (seg.narration) {
    ctx.save();
    const narFontSize = Math.round(h * 0.022);
    ctx.font = `${narFontSize}px sans-serif`;
    ctx.fillStyle = '#d4d4d8';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = 6;
    const narY = Math.min(titleY + titleFontSize + 10, h - safeZone.bottom - narFontSize - 10);
    const excerpt = seg.narration.substring(0, 100) + (seg.narration.length > 100 ? '...' : '');
    ctx.fillText(excerpt, safeZone.left + 20, narY);
    ctx.restore();
  }
}

/**
 * drawSceneCenteredText — current default layout with safe zone enforcement.
 * Text is centered on the frame with a semi-transparent overlay for contrast.
 *
 * Requirements 3.1, 3.5, 4.1, 5.3
 */
export function drawSceneCenteredText(
  ctx: CanvasRenderingContext2D,
  seg: ScriptSegment,
  img: HTMLImageElement | undefined,
  w: number,
  h: number,
  safeZone: SafeZone,
): void {
  // Draw background image if available
  if (img) {
    const iw = img.naturalWidth || img.width || 1280;
    const ih = img.naturalHeight || img.height || 720;
    const scale = Math.max(w / iw, h / ih);
    const dw = iw * scale, dh = ih * scale;
    ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
  } else {
    drawSceneLayoutFallback(ctx, w, h, seg.type);
  }

  // Semi-transparent dark gradient overlay behind the center text area
  const centerOverlayTop = Math.round(h * 0.25);
  const centerOverlayBottom = Math.round(h * 0.75);
  const overlay = ctx.createLinearGradient(0, centerOverlayTop, 0, centerOverlayBottom);
  overlay.addColorStop(0, 'rgba(0,0,0,0)');
  overlay.addColorStop(0.15, 'rgba(0,0,0,0.55)');
  overlay.addColorStop(0.85, 'rgba(0,0,0,0.55)');
  overlay.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = overlay;
  ctx.fillRect(0, centerOverlayTop, w, centerOverlayBottom - centerOverlayTop);

  // Segment title centered — wrapped with wrapTitleText
  ctx.save();
  const titleFontSize = Math.round(h * 0.042);
  ctx.font = `bold ${titleFontSize}px sans-serif`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur = 14;
  const titleY = Math.max(safeZone.top + titleFontSize, Math.min(h * 0.38, h - safeZone.bottom - titleFontSize * 3));
  const { lines: titleLines, fontSize: wrappedFontSize } = wrapTitleText(ctx, seg.title, w, titleFontSize);
  ctx.font = `bold ${wrappedFontSize}px sans-serif`;
  const lineHeight = wrappedFontSize * 1.3;
  for (let i = 0; i < titleLines.length; i++) {
    ctx.fillText(titleLines[i], w / 2, titleY + i * lineHeight);
  }
  ctx.restore();

  // Accent line below title
  const accentColors: Record<string, string> = { intro: '#e74c3c', section: '#3498db', transition: '#f39c12', outro: '#2ecc71' };
  const accent = accentColors[seg.type] || '#9b59b6';
  ctx.fillStyle = accent;
  const lastTitleLineY = titleY + (titleLines.length - 1) * lineHeight;
  ctx.fillRect((w - 100) / 2, lastTitleLineY + titleFontSize * 0.8, 100, 3);

  // Narration excerpt centered below the accent line
  if (seg.narration) {
    ctx.save();
    const narFontSize = Math.round(h * 0.025);
    ctx.font = `${narFontSize}px sans-serif`;
    ctx.fillStyle = '#d4d4d8';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = 6;

    // Word-wrap narration within safe zone
    const maxTextW = w - safeZone.left - safeZone.right;
    const words = seg.narration.split(' ');
    const lines: string[] = [];
    let currentLine = '';
    for (const word of words) {
      const test = currentLine ? `${currentLine} ${word}` : word;
      if (ctx.measureText(test).width > maxTextW && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = test;
      }
    }
    if (currentLine) lines.push(currentLine);

    const narLineHeight = narFontSize * 1.5;
    const narStartY = lastTitleLineY + titleFontSize * 1.5;
    const maxLines = 4;
    const maxNarY = h - safeZone.bottom - narFontSize;
    for (let i = 0; i < Math.min(lines.length, maxLines); i++) {
      const lineY = narStartY + i * narLineHeight;
      if (lineY > maxNarY) break;
      ctx.fillText(lines[i], w / 2, lineY);
    }
    ctx.restore();
  }
}

/**
 * Scene layout dispatch map for the browser renderer.
 * Maps SceneLayoutType values to their drawing functions.
 */
export const SCENE_LAYOUT_DISPATCH: Record<SceneLayoutType, (
  ctx: CanvasRenderingContext2D,
  seg: ScriptSegment,
  img: HTMLImageElement | undefined,
  w: number,
  h: number,
  safeZone: SafeZone,
) => void> = {
  'stat-card': drawSceneStatCard,
  'quote-card': drawSceneQuoteCard,
  'left-text-right-image': drawSceneLeftTextRightImage,
  'lower-third-overlay': drawSceneLowerThirdOverlay,
  'centered-text': drawSceneCenteredText,
};
