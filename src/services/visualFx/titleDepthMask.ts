import type { RenderContext2D } from '../renderingShared';
import { hexToRgba } from '../renderingShared';

interface Particle {
  x: number;
  y: number;
  depth: number;
}

export function drawCinematicTitle(
  ctx: RenderContext2D,
  title: string,
  x: number,
  y: number,
  fontSize: number,
  accentColor: string,
  maxWidth?: number,
): void {
  if (!title || fontSize <= 0) return;

  const mw = maxWidth || 9999;

  ctx.save();

  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const words = title.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (ctx.measureText(testLine).width > mw && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);

  const lineHeight = fontSize * 1.2;
  const totalHeight = lines.length * lineHeight;
  const startY = y - totalHeight / 2 + lineHeight / 2;

  ctx.shadowColor = hexToRgba(accentColor, 0.6);
  ctx.shadowBlur = fontSize * 0.3;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  const ctxFull = ctx as any;

  for (let i = 0; i < lines.length; i++) {
    const ly = startY + i * lineHeight;

    if (typeof ctxFull.strokeText === 'function') {
      ctxFull.strokeStyle = 'rgba(0,0,0,0.9)';
      ctxFull.lineWidth = Math.max(2, fontSize * 0.06);
      ctxFull.strokeText(lines[i], x, ly);
    }

    const grad = ctx.createLinearGradient(x - mw / 2, ly - fontSize / 2, x + mw / 2, ly + fontSize / 2);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.5, '#f0f0f0');
    grad.addColorStop(1, '#cccccc');
    ctx.fillStyle = grad;
    ctx.fillText(lines[i], x, ly, mw);
  }

  ctx.restore();
}

export function drawDepthMaskedTitle(
  ctx: RenderContext2D,
  title: string,
  canvasW: number,
  canvasH: number,
  progress: number,
  particles: Particle[],
  accentColor?: string,
): void {
  if (!title || canvasW <= 0 || canvasH <= 0) return;

  const accent = accentColor || '#e74c3c';
  const safeParticles = particles || [];

  const bgParticles = safeParticles.filter(p => p.depth > 0.5);
  const fgParticles = safeParticles.filter(p => p.depth <= 0.5);

  ctx.save();
  for (const p of bgParticles) {
    const alpha = 0.3 + (1 - p.depth) * 0.4;
    const radius = 2 + p.depth * 4;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = hexToRgba(accent, 1);
    ctx.beginPath();
    ctx.arc(p.x * canvasW, p.y * canvasH, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  const fadeIn = Math.min(1, progress * 3);
  const fontSize = Math.round(canvasH * 0.08);

  ctx.save();
  ctx.globalAlpha = fadeIn;
  drawCinematicTitle(ctx, title, canvasW / 2, canvasH / 2, fontSize, accent, canvasW * 0.8);
  ctx.restore();

  ctx.save();
  for (const p of fgParticles) {
    const alpha = 0.4 + (1 - p.depth) * 0.5;
    const radius = 3 + (1 - p.depth) * 6;
    ctx.globalAlpha = alpha * fadeIn;
    ctx.fillStyle = hexToRgba(accent, 1);
    ctx.beginPath();
    ctx.arc(p.x * canvasW, p.y * canvasH, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
