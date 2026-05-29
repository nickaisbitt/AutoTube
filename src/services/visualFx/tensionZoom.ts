export interface TensionRamp {
  startZoom: number;
  endZoom: number;
  easing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
  duration: number;
}

function applyEasing(t: number, easing: TensionRamp['easing']): number {
  switch (easing) {
    case 'linear':
      return t;
    case 'ease-in':
      return t * t * t;
    case 'ease-out':
      return 1 - Math.pow(1 - t, 3);
    case 'ease-in-out':
      return t < 0.5
        ? 4 * t * t * t
        : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }
}

export function computeTensionZoom(progress: number, ramp: TensionRamp): number {
  if (ramp.duration <= 0) return ramp.startZoom;

  const t = Math.max(0, Math.min(1, progress));
  const eased = applyEasing(t, ramp.easing);
  return ramp.startZoom + (ramp.endZoom - ramp.startZoom) * eased;
}

export function createEscalationRamp(
  segmentIndex: number,
  totalSegments: number,
): TensionRamp {
  if (totalSegments <= 0) {
    return { startZoom: 1.0, endZoom: 1.0, easing: 'linear', duration: 1 };
  }

  const progress = totalSegments > 1 ? segmentIndex / (totalSegments - 1) : 0;
  const third = 1 / 3;

  let startZoom: number;
  let endZoom: number;
  let easing: TensionRamp['easing'];

  if (progress < third) {
    const localT = progress / third;
    startZoom = 1.0 + localT * 0.1;
    endZoom = startZoom + 0.1;
    easing = 'ease-out';
  } else if (progress < third * 2) {
    const localT = (progress - third) / third;
    startZoom = 1.1 + localT * 0.15;
    endZoom = startZoom + 0.15;
    easing = 'ease-in-out';
  } else {
    const localT = (progress - third * 2) / third;
    startZoom = 1.25 + localT * 0.2;
    endZoom = startZoom + 0.2;
    easing = 'ease-in';
  }

  return { startZoom, endZoom, easing, duration: 1 };
}

export function applyTensionZoom(
  ctx: CanvasRenderingContext2D,
  canvasW: number,
  canvasH: number,
  zoomLevel: number,
  centerX?: number,
  centerY?: number,
): void {
  if (canvasW <= 0 || canvasH <= 0) return;

  const cx = centerX ?? canvasW / 2;
  const cy = centerY ?? canvasH / 2;
  const clampedZoom = Math.max(0.1, zoomLevel);

  ctx.translate(cx, cy);
  ctx.scale(clampedZoom, clampedZoom);
  ctx.translate(-cx, -cy);
}
