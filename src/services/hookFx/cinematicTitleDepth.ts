import type { RenderContext2D } from '../renderingShared';
import { hexToRgba } from '../renderingShared';

interface TitleParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  depth: number;
}

function createTitleParticles(count: number, w: number, h: number): TitleParticle[] {
  const particles: TitleParticle[] = [];
  for (let i = 0; i < count; i++) {
    particles.push({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 20,
      vy: (Math.random() - 0.5) * 15 - 10,
      size: 1 + Math.random() * 3,
      alpha: 0.2 + Math.random() * 0.5,
      depth: Math.random(),
    });
  }
  return particles;
}

function drawBackgroundLayer(
  ctx: RenderContext2D,
  w: number,
  h: number,
  progress: number,
  accentColor: string,
  particles: TitleParticle[],
): void {
  ctx.save();

  const gradient = ctx.createLinearGradient(0, 0, 0, h);
  gradient.addColorStop(0, '#0a0a0a');
  gradient.addColorStop(0.5, '#111111');
  gradient.addColorStop(1, '#0a0a0a');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);

  const bgParticles = particles.filter(p => p.depth > 0.5);
  for (const p of bgParticles) {
    const px = p.x + p.vx * progress;
    const py = p.y + p.vy * progress;
    ctx.globalAlpha = p.alpha * 0.4;
    ctx.fillStyle = hexToRgba(accentColor, 1);
    ctx.beginPath();
    ctx.arc(px, py, p.size * 0.8, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawTitleLayer(
  ctx: RenderContext2D,
  title: string,
  w: number,
  h: number,
  progress: number,
  accentColor: string,
): void {
  if (!title) return;

  const fontSize = Math.round(h * 0.08);
  const revealCount = Math.max(1, Math.ceil(title.length * Math.min(1, progress * 1.5)));
  const visibleText = title.substring(0, revealCount);

  ctx.save();

  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.shadowColor = hexToRgba(accentColor, 0.8);
  ctx.shadowBlur = fontSize * 0.4;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  const words = visibleText.split(' ');
  const lines: string[] = [];
  let currentLine = '';
  const maxWidth = w * 0.8;

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (ctx.measureText(testLine).width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);

  const lineHeight = fontSize * 1.2;
  const totalHeight = lines.length * lineHeight;
  const startY = h / 2 - totalHeight / 2 + lineHeight / 2;

  const fadeIn = Math.min(1, progress * 2);
  ctx.globalAlpha = fadeIn;

  const ctxAny = ctx as any;

  for (let i = 0; i < lines.length; i++) {
    const ly = startY + i * lineHeight;

    if (typeof ctxAny.strokeText === 'function') {
      ctxAny.strokeStyle = 'rgba(0,0,0,0.9)';
      ctxAny.lineWidth = Math.max(2, fontSize * 0.06);
      ctxAny.strokeText(lines[i], w / 2, ly);
    }

    const grad = ctx.createLinearGradient(w * 0.1, ly, w * 0.9, ly);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.5, '#f0f0f0');
    grad.addColorStop(1, '#cccccc');
    ctx.fillStyle = grad;
    ctx.fillText(lines[i], w / 2, ly, maxWidth);
  }

  ctx.restore();
}

function drawForegroundLayer(
  ctx: RenderContext2D,
  _w: number,
  _h: number,
  progress: number,
  accentColor: string,
  particles: TitleParticle[],
): void {
  const fgParticles = particles.filter(p => p.depth <= 0.5);

  ctx.save();
  for (const p of fgParticles) {
    const px = p.x + p.vx * progress;
    const py = p.y + p.vy * progress;
    ctx.globalAlpha = p.alpha * 0.6 * Math.min(1, progress * 2);
    ctx.fillStyle = hexToRgba(accentColor, 1);
    ctx.beginPath();
    ctx.arc(px, py, p.size * 1.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

let cachedParticles: TitleParticle[] | null = null;
let cachedDimensions = '';

export function drawMultiLayerTitle(
  ctx: RenderContext2D,
  title: string,
  w: number,
  h: number,
  progress: number,
  accentColor: string,
): void {
  if (w <= 0 || h <= 0 || !title) return;

  const dimKey = `${w}x${h}`;
  if (!cachedParticles || cachedDimensions !== dimKey) {
    cachedParticles = createTitleParticles(40, w, h);
    cachedDimensions = dimKey;
  }

  const clampedProgress = Math.min(1, Math.max(0, progress));

  drawBackgroundLayer(ctx, w, h, clampedProgress, accentColor, cachedParticles);
  drawTitleLayer(ctx, title, w, h, clampedProgress, accentColor);
  drawForegroundLayer(ctx, w, h, clampedProgress, accentColor, cachedParticles);
}

export function computeTypewriterProgress(
  frameIndex: number,
  totalFrames: number,
  charCount: number,
): number {
  if (totalFrames <= 0 || charCount <= 0) return 0;
  if (frameIndex <= 0) return 0;
  if (frameIndex >= totalFrames) return 1;

  const linearProgress = frameIndex / totalFrames;
  const charsPerFrame = charCount / (totalFrames * 0.7);
  const rawCharProgress = (frameIndex * charsPerFrame) / charCount;

  const eased = linearProgress < 0.5
    ? 2 * linearProgress * linearProgress
    : 1 - Math.pow(-2 * linearProgress + 2, 2) / 2;

  return Math.min(1, Math.max(0, Math.max(eased, Math.min(1, rawCharProgress))));
}
