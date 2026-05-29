import type { RenderContext2D } from '../renderingShared';

export type TransitionType =
  | 'crossfade'
  | 'cut'
  | 'dissolve'
  | 'wipe_left'
  | 'wipe_right'
  | 'wipe_up'
  | 'slide_left'
  | 'slide_right'
  | 'zoom_in'
  | 'zoom_out';

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function drawCrossfade(
  ctx: RenderContext2D,
  fromFrame: () => void,
  toFrame: () => void,
  progress: number,
  _w: number,
  _h: number,
): void {
  const alpha = easeInOutCubic(progress);
  ctx.save();
  ctx.globalAlpha = 1 - alpha;
  fromFrame();
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = alpha;
  toFrame();
  ctx.restore();
}

function drawCut(
  _ctx: RenderContext2D,
  fromFrame: () => void,
  toFrame: () => void,
  progress: number,
  _w: number,
  _h: number,
): void {
  if (progress < 0.5) {
    fromFrame();
  } else {
    toFrame();
  }
}

function drawDissolve(
  ctx: RenderContext2D,
  fromFrame: () => void,
  toFrame: () => void,
  progress: number,
  _w: number,
  _h: number,
): void {
  const alpha = easeInOutCubic(progress);
  const blurAmount = Math.sin(progress * Math.PI) * 10;

  ctx.save();
  ctx.globalAlpha = 1 - alpha;
  ctx.filter = `blur(${blurAmount}px)`;
  fromFrame();
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.filter = `blur(${blurAmount}px)`;
  toFrame();
  ctx.restore();

  ctx.filter = 'none';
}

function drawWipeLeft(
  ctx: RenderContext2D,
  fromFrame: () => void,
  toFrame: () => void,
  progress: number,
  w: number,
  h: number,
): void {
  const eased = easeInOutCubic(progress);
  const wipeX = w * (1 - eased);

  ctx.save();
  fromFrame();
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, wipeX, h);
  ctx.clip();
  toFrame();
  ctx.restore();
}

function drawWipeRight(
  ctx: RenderContext2D,
  fromFrame: () => void,
  toFrame: () => void,
  progress: number,
  w: number,
  h: number,
): void {
  const eased = easeInOutCubic(progress);
  const wipeX = w * eased;

  ctx.save();
  fromFrame();
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.rect(wipeX, 0, w - wipeX, h);
  ctx.clip();
  toFrame();
  ctx.restore();
}

function drawWipeUp(
  ctx: RenderContext2D,
  fromFrame: () => void,
  toFrame: () => void,
  progress: number,
  w: number,
  h: number,
): void {
  const eased = easeInOutCubic(progress);
  const wipeY = h * (1 - eased);

  ctx.save();
  fromFrame();
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, w, wipeY);
  ctx.clip();
  toFrame();
  ctx.restore();
}

function drawSlideLeft(
  ctx: RenderContext2D,
  fromFrame: () => void,
  toFrame: () => void,
  progress: number,
  w: number,
  _h: number,
): void {
  const eased = easeInOutCubic(progress);
  const offset = w * eased;

  ctx.save();
  ctx.translate(-offset, 0);
  fromFrame();
  ctx.restore();

  ctx.save();
  ctx.translate(w - offset, 0);
  toFrame();
  ctx.restore();
}

function drawSlideRight(
  ctx: RenderContext2D,
  fromFrame: () => void,
  toFrame: () => void,
  progress: number,
  w: number,
  _h: number,
): void {
  const eased = easeInOutCubic(progress);
  const offset = w * eased;

  ctx.save();
  ctx.translate(offset, 0);
  fromFrame();
  ctx.restore();

  ctx.save();
  ctx.translate(-w + offset, 0);
  toFrame();
  ctx.restore();
}

function drawZoomIn(
  ctx: RenderContext2D,
  fromFrame: () => void,
  toFrame: () => void,
  progress: number,
  w: number,
  h: number,
): void {
  const eased = easeInOutCubic(progress);
  const scale = 1 + eased * 0.5;
  const alpha = 1 - eased;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(w / 2, h / 2);
  ctx.scale(scale, scale);
  ctx.translate(-w / 2, -h / 2);
  fromFrame();
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = eased;
  toFrame();
  ctx.restore();
}

function drawZoomOut(
  ctx: RenderContext2D,
  fromFrame: () => void,
  toFrame: () => void,
  progress: number,
  w: number,
  h: number,
): void {
  const eased = easeInOutCubic(progress);
  const scale = 1 - eased * 0.5;

  ctx.save();
  toFrame();
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 1 - eased;
  ctx.translate(w / 2, h / 2);
  ctx.scale(scale, scale);
  ctx.translate(-w / 2, -h / 2);
  fromFrame();
  ctx.restore();
}

export function drawTransition(
  ctx: RenderContext2D,
  type: TransitionType,
  fromFrame: () => void,
  toFrame: () => void,
  progress: number,
  w: number,
  h: number,
): void {
  if (w <= 0 || h <= 0) return;
  if (progress <= 0) {
    fromFrame();
    return;
  }
  if (progress >= 1) {
    toFrame();
    return;
  }

  switch (type) {
    case 'crossfade':
      drawCrossfade(ctx, fromFrame, toFrame, progress, w, h);
      break;
    case 'cut':
      drawCut(ctx, fromFrame, toFrame, progress, w, h);
      break;
    case 'dissolve':
      drawDissolve(ctx, fromFrame, toFrame, progress, w, h);
      break;
    case 'wipe_left':
      drawWipeLeft(ctx, fromFrame, toFrame, progress, w, h);
      break;
    case 'wipe_right':
      drawWipeRight(ctx, fromFrame, toFrame, progress, w, h);
      break;
    case 'wipe_up':
      drawWipeUp(ctx, fromFrame, toFrame, progress, w, h);
      break;
    case 'slide_left':
      drawSlideLeft(ctx, fromFrame, toFrame, progress, w, h);
      break;
    case 'slide_right':
      drawSlideRight(ctx, fromFrame, toFrame, progress, w, h);
      break;
    case 'zoom_in':
      drawZoomIn(ctx, fromFrame, toFrame, progress, w, h);
      break;
    case 'zoom_out':
      drawZoomOut(ctx, fromFrame, toFrame, progress, w, h);
      break;
  }
}

const TRANSITION_DURATIONS: Record<TransitionType, number> = {
  crossfade: 12,
  cut: 1,
  dissolve: 18,
  wipe_left: 15,
  wipe_right: 15,
  wipe_up: 15,
  slide_left: 12,
  slide_right: 12,
  zoom_in: 18,
  zoom_out: 18,
};

export function getTransitionDuration(type: TransitionType, fps: number): number {
  const baseFrames = TRANSITION_DURATIONS[type];
  const scaledFrames = Math.round(baseFrames * (fps / 24));
  return Math.max(1, scaledFrames);
}

const PURPOSE_TRANSITION_MAP: Record<string, TransitionType[]> = {
  stat_hook: ['crossfade', 'wipe_left', 'zoom_in'],
  risk: ['dissolve', 'wipe_up', 'zoom_out'],
  prediction: ['slide_left', 'zoom_in', 'crossfade'],
  history: ['dissolve', 'crossfade', 'wipe_right'],
  competitive_analysis: ['wipe_left', 'slide_right', 'crossfade'],
  human_story: ['dissolve', 'crossfade', 'zoom_out'],
  conclusion: ['zoom_out', 'crossfade', 'dissolve'],
  transition_bridge: ['slide_left', 'wipe_left', 'crossfade'],
};

export function selectTransitionForSegment(
  purposeTag: string,
  pacingScore: number,
): TransitionType {
  const options = PURPOSE_TRANSITION_MAP[purposeTag] ?? ['crossfade', 'dissolve', 'wipe_left'];

  if (pacingScore >= 4) {
    return options[0];
  }
  if (pacingScore >= 3) {
    return options[1 % options.length];
  }
  return options[2 % options.length];
}
