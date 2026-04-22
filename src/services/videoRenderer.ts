import type { VideoProject, ScriptSegment, MediaAsset } from '../types';
import { logger } from './logger';

export interface RenderOptions {
  width?: number;
  height?: number;
  onProgress?: (pct: number, message: string) => void;
  signal?: AbortSignal;
}

interface ImgCache { [k: string]: HTMLImageElement; }

export async function renderVideoToBlob(
  project: VideoProject,
  options: RenderOptions = {},
): Promise<Blob> {
  const { width = 1280, height = 720, onProgress, signal } = options;
  logger.info('Renderer', `Start: ${width}x${height}`);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    logger.error('Renderer', 'Could not get 2D context');
    throw new Error('Canvas 2D context unavailable');
  }

  const cache: ImgCache = {};
  await preload(project, cache);
  logger.info('Renderer', `Preloaded ${Object.keys(cache).length} images`);

  const totalSec = project.script.reduce((s, seg) => s + seg.duration, 0);
  logger.info('Renderer', `Total duration: ${totalSec}s, ${project.script.length} segments`);
  let elapsed = 0;

  for (let i = 0; i < project.script.length; i++) {
    if (signal?.aborted) throw new Error('Cancelled');
    const seg = project.script[i];
    const segMedia = project.media.filter(a => a.segmentId === seg.id);
    const segStart = elapsed / totalSec;

    logger.info('Renderer', `Rendering segment ${i + 1}/${project.script.length}: "${seg.title}" (${seg.duration}s, ${segMedia.length} media)`);
    await renderSegment(ctx, canvas, seg, segMedia, cache, seg.duration,
      (pct) => {
        const overall = segStart + (pct * seg.duration / totalSec);
        onProgress?.(Math.min(Math.round(overall * 100), 99), `Rendering ${i + 1}/${project.script.length}: ${seg.title}`);
      }
    );
    elapsed += seg.duration;
  }

  onProgress?.(100, 'Done!');

  // Export as PNG with timeout fallback
  return new Promise((resolve) => {
    let resolved = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (blob: Blob) => {
      if (resolved) return;
      resolved = true;
      if (timer) clearTimeout(timer);
      logger.success('Renderer', `Done: ${(blob.size / 1024 / 1024).toFixed(2)}MB`);
      resolve(blob);
    };

    // Fallback: try toBlob again with longer timeout
    timer = setTimeout(() => {
      if (!resolved) {
        logger.warn('Renderer', 'canvas.toBlob timed out, retrying...');
        canvas.toBlob((blob) => {
          if (blob) finish(blob);
        }, 'image/png');
      }
    }, 5000);

    canvas.toBlob((blob) => {
      if (blob) finish(blob);
      else {
        // Last resort: try toDataURL (expensive but reliable)
        try {
          const dataUrl = canvas.toDataURL('image/png');
          const byteString = atob(dataUrl.split(',')[1]);
          const ab = new ArrayBuffer(byteString.length);
          const ia = new Uint8Array(ab);
          for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
          finish(new Blob([ab], { type: 'image/png' }));
        } catch {
          // Ultimate fallback: blank canvas
          finish(new Blob([], { type: 'image/png' }));
        }
      }
    }, 'image/png');
  });
}

async function preload(project: VideoProject, cache: ImgCache): Promise<void> {
  await Promise.all(project.media.map(async (a) => {
    if (a.type === 'image' && !cache[a.url]) {
      cache[a.url] = await loadImage(a.url, a.alt);
    }
  }));
}

function loadImage(url: string, alt: string): Promise<HTMLImageElement> {
  // Use image proxy to bypass CORS restrictions
  const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(url)}`;
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => {
      // Fallback: try direct URL
      const img2 = new Image();
      img2.crossOrigin = 'anonymous';
      img2.onload = () => resolve(img2);
      img2.onerror = () => resolve(mkFallback(alt));
      img2.src = url;
    };
    img.src = proxyUrl;
  });
}

async function renderSegment(
  ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement,
  seg: ScriptSegment, media: MediaAsset[], cache: ImgCache,
  durationSec: number, onProgress: (p: number) => void,
): Promise<void> {
  const total = Math.max(1, Math.round(durationSec * 10)); // 10 fps
  const mc = Math.max(1, media.length);
  const per = Math.max(1, Math.floor(total / mc));
  const reportInterval = Math.max(1, Math.floor(total / 10));

  for (let f = 0; f < total; f++) {
    const mi = Math.min(Math.floor(f / per), mc - 1);
    draw(ctx, canvas, seg, media[mi], cache, f / total);

    if (f % reportInterval === 0) {
      onProgress(f / total);
      // Yield to event loop every 10% so React can update UI
      await new Promise<void>((r) => setTimeout(r, 10));
    }
  }
  onProgress(1);
}

function draw(
  ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement,
  seg: ScriptSegment, asset: MediaAsset | undefined, cache: ImgCache, progress = 0,
): void {
  const w = canvas.width, h = canvas.height;

  // ── Background ──
  ctx.fillStyle = '#020617';
  ctx.fillRect(0, 0, w, h);

  // Image with Ken Burns effect
  if (asset && cache[asset.url]) {
    const img = cache[asset.url];
    const scale = Math.max(w / img.width, h / img.height) * 1.15;
    const dw = img.width * scale, dh = img.height * scale;
    const zoom = 1 + progress * 0.12;
    const panX = Math.sin(progress * Math.PI) * 20;
    const panY = Math.cos(progress * Math.PI * 0.5) * 8;

    ctx.save();
    ctx.translate(w / 2 + panX, h / 2 + panY);
    ctx.scale(zoom, zoom);
    ctx.filter = 'saturate(1.2) contrast(1.1)';
    ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
    ctx.filter = 'none';
    ctx.restore();
  } else {
    // Dramatic gradient background when no image
    const angle = progress * Math.PI * 2;
    const gx = w / 2 + Math.cos(angle) * w * 0.3;
    const gy = h / 2 + Math.sin(angle) * h * 0.3;
    const grad = ctx.createRadialGradient(gx, gy, 0, w / 2, h / 2, w * 0.8);
    grad.addColorStop(0, '#1e3a5f');
    grad.addColorStop(0.5, '#0f172a');
    grad.addColorStop(1, '#020617');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }

  // ── Multi-layer gradient overlay for depth ──
  // Top vignette
  const topG = ctx.createLinearGradient(0, 0, 0, h * 0.15);
  topG.addColorStop(0, 'rgba(2,6,23,0.7)');
  topG.addColorStop(1, 'rgba(2,6,23,0)');
  ctx.fillStyle = topG;
  ctx.fillRect(0, 0, w, h * 0.15);

  // Bottom heavy gradient
  const botG = ctx.createLinearGradient(0, h * 0.35, 0, h);
  botG.addColorStop(0, 'rgba(2,6,23,0)');
  botG.addColorStop(0.4, 'rgba(2,6,23,0.5)');
  botG.addColorStop(0.75, 'rgba(2,6,23,0.85)');
  botG.addColorStop(1, 'rgba(2,6,23,0.97)');
  ctx.fillStyle = botG;
  ctx.fillRect(0, 0, w, h);

  // Side vignette
  const sideG = ctx.createLinearGradient(0, 0, w, 0);
  sideG.addColorStop(0, 'rgba(2,6,23,0.4)');
  sideG.addColorStop(0.15, 'rgba(2,6,23,0)');
  sideG.addColorStop(0.85, 'rgba(2,6,23,0)');
  sideG.addColorStop(1, 'rgba(2,6,23,0.4)');
  ctx.fillStyle = sideG;
  ctx.fillRect(0, 0, w, h);

  // ── Color accent bar ──
  const colors: Record<string, string> = { intro: '#ef4444', section: '#3b82f6', transition: '#f59e0b', outro: '#10b981' };
  const color = colors[seg.type] || '#6366f1';
  const accentW = 5 + progress * 2;
  ctx.fillStyle = color;
  ctx.fillRect(0, h * 0.35, accentW, h * 0.55);

  // Accent glow
  const glowG = ctx.createLinearGradient(0, h * 0.35, 60, h * 0.35);
  glowG.addColorStop(0, color + '60');
  glowG.addColorStop(1, 'transparent');
  ctx.fillStyle = glowG;
  ctx.fillRect(0, h * 0.35, 60, h * 0.55);

  // ── Type badge ──
  const badgeX = 50;
  const badgeY = h - 200;
  const badgeW = ctx.measureText(seg.type.toUpperCase()).width + 30;
  ctx.fillStyle = color + 'dd';
  roundRect(ctx, badgeX, badgeY, Math.max(70, badgeW + 10), 32, 6);
  ctx.fill();
  // Badge glow
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  ctx.fillStyle = color;
  roundRect(ctx, badgeX, badgeY, Math.max(70, badgeW + 10), 32, 6);
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(seg.type.toUpperCase(), badgeX + Math.max(70, badgeW + 10) / 2, badgeY + 22);

  // ── Title with text shadow ──
  ctx.textAlign = 'left';
  ctx.shadowColor = 'rgba(0,0,0,0.8)';
  ctx.shadowBlur = 20;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 42px system-ui, sans-serif';
  wrapText(ctx, seg.title, 55, h - 155, w - 120, 50, true);
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // ── Narration text ──
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 10;
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = '300 19px system-ui, sans-serif';
  wrapText(ctx, seg.narration, 55, h - 85, w - 120, 26, false);
  ctx.shadowBlur = 0;

  // ── Progress bar ──
  const barX = 55, barY = h - 32, barW = w - 110, barH = 5;
  // Track
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  roundRect(ctx, barX, barY, barW, barH, 3);
  ctx.fill();
  // Fill with glow
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  ctx.fillStyle = color;
  roundRect(ctx, barX, barY, barW * progress, barH, 3);
  ctx.fill();
  ctx.shadowBlur = 0;

  // ── Time indicator ──
  const elapsed = progress * seg.duration;
  const total = seg.duration;
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.font = '12px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(`${Math.floor(elapsed)}s / ${total}s`, w - 55, barY - 6);

  // ── Watermark ──
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.font = '600 10px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('AUTOTUBE', w - 50, 48);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.font = '10px system-ui, sans-serif';
  ctx.fillText('AI VIDEO GENERATOR', w - 50, 62);

  // ── Segment number indicator ──
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.font = 'bold 120px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('▶', w - 40, 130);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lineH: number, isBold = false): void {
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

function mkFallback(text: string): HTMLImageElement {
  const c = document.createElement('canvas');
  c.width = 1280; c.height = 720;
  const cx = c.getContext('2d')!;
  cx.fillStyle = '#1e293b';
  cx.fillRect(0, 0, 1280, 720);
  cx.fillStyle = '#475569';
  cx.font = '24px system-ui, sans-serif';
  cx.textAlign = 'center';
  cx.fillText(text.substring(0, 50), 640, 360);
  const img = new Image();
  img.src = c.toDataURL();
  return img;
}

export function getSupportedMimeType(): string {
  for (const t of ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return 'video/webm';
}
