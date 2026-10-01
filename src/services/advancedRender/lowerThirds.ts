import type { RenderContext2D } from '../renderingShared';
import { roundRect, hexToRgba } from '../renderingShared';

export interface LowerThirdConfig {
  text: string;
  subtitle?: string;
  style: 'globe' | 'compass' | 'minimal' | 'tech' | 'news';
  x: number;
  y: number;
  accentColor: string;
  animationIn: 'slide' | 'fade' | 'scale';
  animationOut: 'slide' | 'fade' | 'scale';
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function easeInCubic(t: number): number {
  return t * t * t;
}

function computeAnimationAlpha(progress: number): { alpha: number; transform: number } {
  if (progress < 0.15) {
    const t = progress / 0.15;
    return { alpha: easeOutCubic(t), transform: easeOutCubic(t) };
  }
  if (progress > 0.85) {
    const t = (progress - 0.85) / 0.15;
    return { alpha: 1 - easeInCubic(t), transform: 1 - easeInCubic(t) };
  }
  return { alpha: 1, transform: 1 };
}

function applyInAnimation(
  ctx: RenderContext2D,
  config: LowerThirdConfig,
  transform: number,
  w: number,
  h: number,
): void {
  const px = config.x * w;
  const py = config.y * h;

  switch (config.animationIn) {
    case 'slide':
      ctx.translate(px + (1 - transform) * -300, py);
      break;
    case 'fade':
      ctx.translate(px, py);
      break;
    case 'scale':
      ctx.translate(px, py);
      const s = 0.8 + 0.2 * transform;
      ctx.scale(s, s);
      break;
  }
}

function applyOutAnimation(
  ctx: RenderContext2D,
  config: LowerThirdConfig,
  transform: number,
  w: number,
  h: number,
): void {
  const px = config.x * w;
  const py = config.y * h;

  switch (config.animationOut) {
    case 'slide':
      ctx.translate(px + (1 - transform) * 300, py);
      break;
    case 'fade':
      ctx.translate(px, py);
      break;
    case 'scale':
      ctx.translate(px, py);
      const s = 0.8 + 0.2 * transform;
      ctx.scale(s, s);
      break;
  }
}

function applyTransform(
  ctx: RenderContext2D,
  config: LowerThirdConfig,
  progress: number,
  w: number,
  h: number,
): void {
  if (progress < 0.15) {
    applyInAnimation(ctx, config, computeAnimationAlpha(progress).transform, w, h);
  } else if (progress > 0.85) {
    applyOutAnimation(ctx, config, computeAnimationAlpha(progress).transform, w, h);
  } else {
    ctx.translate(config.x * w, config.y * h);
  }
}

function drawGlobeStyle(
  ctx: RenderContext2D,
  config: LowerThirdConfig,
  w: number,
): void {
  const panelW = Math.min(500, w * 0.4);
  const panelH = config.subtitle ? 80 : 56;

  const grad = ctx.createLinearGradient(0, 0, panelW, 0);
  grad.addColorStop(0, hexToRgba(config.accentColor, 0.9));
  grad.addColorStop(1, hexToRgba(config.accentColor, 0.6));
  ctx.fillStyle = grad;
  roundRect(ctx, 0, 0, panelW, panelH, 12);
  ctx.fill();

  const ctxAny = ctx as any;
  ctxAny.strokeStyle = 'rgba(255,255,255,0.8)';
  ctxAny.lineWidth = 2;

  ctx.beginPath();
  ctx.arc(30, panelH / 2, 14, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(16, panelH / 2);
  ctx.lineTo(44, panelH / 2);
  ctx.moveTo(30, panelH / 2 - 14);
  ctx.lineTo(30, panelH / 2 + 14);
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 22px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(config.text, 56, config.subtitle ? panelH / 2 - 12 : panelH / 2);

  if (config.subtitle) {
    ctx.font = '16px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillText(config.subtitle, 56, panelH / 2 + 14);
  }
}

function drawCompassStyle(
  ctx: RenderContext2D,
  config: LowerThirdConfig,
  w: number,
): void {
  const panelW = Math.min(480, w * 0.38);
  const panelH = config.subtitle ? 76 : 52;

  ctx.fillStyle = hexToRgba(config.accentColor, 0.85);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(panelW - 20, 0);
  ctx.lineTo(panelW, panelH / 2);
  ctx.lineTo(panelW - 20, panelH);
  ctx.lineTo(0, panelH);
  ctx.closePath();
  ctx.fill();

  const cx = 28;
  const cy = panelH / 2;
  const r = 12;
  const ctxAny = ctx as any;
  ctxAny.strokeStyle = 'rgba(255,255,255,0.9)';
  ctxAny.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx + r * 0.4, cy);
  ctx.lineTo(cx, cy + r);
  ctx.lineTo(cx - r * 0.4, cy);
  ctx.closePath();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - r, cy);
  ctx.lineTo(cx, cy - r * 0.4);
  ctx.lineTo(cx + r, cy);
  ctx.lineTo(cx, cy + r * 0.4);
  ctx.closePath();
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 22px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(config.text, 52, config.subtitle ? panelH / 2 - 12 : panelH / 2);

  if (config.subtitle) {
    ctx.font = '15px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText(config.subtitle, 52, panelH / 2 + 14);
  }
}

function drawMinimalStyle(
  ctx: RenderContext2D,
  config: LowerThirdConfig,
  _w: number,
): void {
  ctx.fillStyle = config.accentColor;
  ctx.fillRect(0, 0, 3, config.subtitle ? 52 : 30);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 22px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(config.text, 14, 2);

  if (config.subtitle) {
    ctx.font = '15px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText(config.subtitle, 14, 30);
  }
}

function drawTechStyle(
  ctx: RenderContext2D,
  config: LowerThirdConfig,
  progress: number,
  w: number,
): void {
  const panelW = Math.min(500, w * 0.4);
  const panelH = config.subtitle ? 80 : 56;

  ctx.fillStyle = 'rgba(20, 20, 40, 0.75)';
  roundRect(ctx, 0, 0, panelW, panelH, 8);
  ctx.fill();

  const ctxAny = ctx as any;
  ctxAny.strokeStyle = hexToRgba(config.accentColor, 0.5);
  ctxAny.lineWidth = 1;
  roundRect(ctx, 0, 0, panelW, panelH, 8);
  ctx.stroke();

  const scanY = ((progress * 5) % 1) * panelH;
  ctx.fillStyle = hexToRgba(config.accentColor, 0.15);
  ctx.fillRect(0, scanY, panelW, 2);

  ctx.fillStyle = config.accentColor;
  ctx.fillRect(0, 0, 4, panelH);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 22px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(config.text, 18, config.subtitle ? panelH / 2 - 12 : panelH / 2);

  if (config.subtitle) {
    ctx.font = '15px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText(config.subtitle, 18, panelH / 2 + 14);
  }
}

function drawNewsStyle(
  ctx: RenderContext2D,
  config: LowerThirdConfig,
  w: number,
): void {
  const panelW = Math.min(600, w * 0.5);
  const panelH = config.subtitle ? 80 : 52;

  ctx.fillStyle = '#cc0000';
  ctx.fillRect(0, 0, panelW, panelH);

  ctx.fillStyle = '#001a66';
  ctx.fillRect(0, panelH - 4, panelW, 4);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 6, panelH);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 24px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(config.text, 20, config.subtitle ? panelH / 2 - 12 : panelH / 2);

  if (config.subtitle) {
    ctx.font = '16px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillText(config.subtitle, 20, panelH / 2 + 16);
  }
}

export function drawLowerThird(
  ctx: RenderContext2D,
  config: LowerThirdConfig,
  progress: number,
  w: number,
  h: number,
): void {
  if (w <= 0 || h <= 0 || !config.text) return;
  if (progress <= 0 || progress >= 1) return;

  const { alpha } = computeAnimationAlpha(progress);
  if (alpha <= 0) return;

  ctx.save();
  ctx.globalAlpha = alpha;
  applyTransform(ctx, config, progress, w, h);

  switch (config.style) {
    case 'globe':
      drawGlobeStyle(ctx, config, w);
      break;
    case 'compass':
      drawCompassStyle(ctx, config, w);
      break;
    case 'minimal':
      drawMinimalStyle(ctx, config, w);
      break;
    case 'tech':
      drawTechStyle(ctx, config, progress, w);
      break;
    case 'news':
      drawNewsStyle(ctx, config, w);
      break;
  }

  ctx.restore();
}

const STYLE_CYCLE: LowerThirdConfig['style'][] = ['globe', 'compass', 'minimal', 'tech', 'news'];
const ANIMATION_CYCLE: LowerThirdConfig['animationIn'][] = ['slide', 'fade', 'scale'];

export function createLowerThirdFromSource(source: string, accentColor: string): LowerThirdConfig {
  const hash = source.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const style = STYLE_CYCLE[hash % STYLE_CYCLE.length];
  const animationIn = ANIMATION_CYCLE[hash % ANIMATION_CYCLE.length];
  const animationOut = ANIMATION_CYCLE[(hash + 1) % ANIMATION_CYCLE.length];

  return {
    text: source,
    style,
    x: 0.05,
    y: 0.82,
    accentColor,
    animationIn,
    animationOut,
  };
}
