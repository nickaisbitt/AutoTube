import type { RenderContext2D } from '../renderingShared';

export interface KineticOverlay {
  text: string;
  animation: 'slam' | 'slide_left' | 'slide_right' | 'fade_up' | 'scale_in';
  x: number;
  y: number;
  fontSize: number;
  color: string;
  startTime: number;
  duration: number;
}

function easeOutBounce(t: number): number {
  if (t < 1 / 2.75) {
    return 7.5625 * t * t;
  } else if (t < 2 / 2.75) {
    const t2 = t - 1.5 / 2.75;
    return 7.5625 * t2 * t2 + 0.75;
  } else if (t < 2.5 / 2.75) {
    const t2 = t - 2.25 / 2.75;
    return 7.5625 * t2 * t2 + 0.9375;
  } else {
    const t2 = t - 2.625 / 2.75;
    return 7.5625 * t2 * t2 + 0.984375;
  }
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function elasticEaseOut(t: number): number {
  if (t === 0 || t === 1) return t;
  const p = 0.3;
  return Math.pow(2, -10 * t) * Math.sin((t - p / 4) * (2 * Math.PI) / p) + 1;
}

function drawSlam(
  ctx: RenderContext2D,
  overlay: KineticOverlay,
  localProgress: number,
  w: number,
  h: number,
): void {
  const scale = 3.0 - 2.0 * easeOutBounce(Math.min(1, localProgress * 1.5));
  const alpha = Math.min(1, localProgress * 3);

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(overlay.x * w, overlay.y * h);
  ctx.scale(scale, scale);
  ctx.font = `bold ${overlay.fontSize}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = overlay.color;
  ctx.fillText(overlay.text, 0, 0);
  ctx.restore();
}

function drawSlideLeft(
  ctx: RenderContext2D,
  overlay: KineticOverlay,
  localProgress: number,
  w: number,
  h: number,
): void {
  const eased = easeOutCubic(Math.min(1, localProgress * 1.5));
  const startX = w + 200;
  const targetX = overlay.x * w;
  const currentX = startX + (targetX - startX) * eased;

  ctx.save();
  ctx.globalAlpha = Math.min(1, localProgress * 3);
  ctx.font = `bold ${overlay.fontSize}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = overlay.color;
  ctx.fillText(overlay.text, currentX, overlay.y * h);
  ctx.restore();
}

function drawSlideRight(
  ctx: RenderContext2D,
  overlay: KineticOverlay,
  localProgress: number,
  w: number,
  h: number,
): void {
  const eased = easeOutCubic(Math.min(1, localProgress * 1.5));
  const startX = -200;
  const targetX = overlay.x * w;
  const currentX = startX + (targetX - startX) * eased;

  ctx.save();
  ctx.globalAlpha = Math.min(1, localProgress * 3);
  ctx.font = `bold ${overlay.fontSize}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = overlay.color;
  ctx.fillText(overlay.text, currentX, overlay.y * h);
  ctx.restore();
}

function drawFadeUp(
  ctx: RenderContext2D,
  overlay: KineticOverlay,
  localProgress: number,
  w: number,
  h: number,
): void {
  const eased = easeOutCubic(Math.min(1, localProgress * 1.5));
  const offsetY = (1 - eased) * 50;
  const alpha = eased;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `bold ${overlay.fontSize}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = overlay.color;
  ctx.fillText(overlay.text, overlay.x * w, overlay.y * h + offsetY);
  ctx.restore();
}

function drawScaleIn(
  ctx: RenderContext2D,
  overlay: KineticOverlay,
  localProgress: number,
  w: number,
  h: number,
): void {
  const scale = elasticEaseOut(Math.min(1, localProgress * 1.5));
  const alpha = Math.min(1, localProgress * 3);

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(overlay.x * w, overlay.y * h);
  ctx.scale(scale, scale);
  ctx.font = `bold ${overlay.fontSize}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = overlay.color;
  ctx.fillText(overlay.text, 0, 0);
  ctx.restore();
}

export function drawKineticOverlay(
  ctx: RenderContext2D,
  overlay: KineticOverlay,
  currentTime: number,
  w: number,
  h: number,
): void {
  if (w <= 0 || h <= 0 || !overlay.text) return;
  if (currentTime < overlay.startTime) return;
  if (currentTime > overlay.startTime + overlay.duration) return;

  const localProgress = (currentTime - overlay.startTime) / overlay.duration;

  switch (overlay.animation) {
    case 'slam':
      drawSlam(ctx, overlay, localProgress, w, h);
      break;
    case 'slide_left':
      drawSlideLeft(ctx, overlay, localProgress, w, h);
      break;
    case 'slide_right':
      drawSlideRight(ctx, overlay, localProgress, w, h);
      break;
    case 'fade_up':
      drawFadeUp(ctx, overlay, localProgress, w, h);
      break;
    case 'scale_in':
      drawScaleIn(ctx, overlay, localProgress, w, h);
      break;
  }
}

export function generateRetentionOverlays(
  retentionBeats: { type: string; time: number }[],
  segments: { narration: string }[],
): KineticOverlay[] {
  if (!retentionBeats || !segments || retentionBeats.length === 0) return [];

  const overlays: KineticOverlay[] = [];
  const animations: KineticOverlay['animation'][] = ['slam', 'slide_left', 'slide_right', 'fade_up', 'scale_in'];

  for (let i = 0; i < retentionBeats.length; i++) {
    const beat = retentionBeats[i];
    const segment = segments[Math.min(i, segments.length - 1)];
    if (!segment || !segment.narration) continue;

    const words = segment.narration.split(/\s+/).filter(w => w.length > 3);
    const keyPhrase = words.slice(0, 3).join(' ');
    if (!keyPhrase) continue;

    const animation = animations[i % animations.length];

    overlays.push({
      text: keyPhrase.toUpperCase(),
      animation,
      x: 0.5,
      y: 0.85,
      fontSize: 48,
      color: '#ffffff',
      startTime: beat.time,
      duration: 2.0,
    });
  }

  return overlays;
}
