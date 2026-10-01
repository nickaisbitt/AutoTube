export function computeVignetteIntensity(
  pacingScore: number,
  progress: number,
  baseIntensity?: number,
): number {
  const base = baseIntensity ?? 0.25;
  const clampedPacing = Math.max(1, Math.min(5, pacingScore));
  const pacingMod = 1.0 + (clampedPacing - 3) * 0.1;
  const pulseFreq = 1.0 + (clampedPacing - 1) * 0.5;
  const pulse = Math.sin(progress * Math.PI * 2 * pulseFreq) * 0.08;
  return Math.max(0, Math.min(1, base * pacingMod + pulse));
}

export function computeVignetteRadius(
  pacingScore: number,
  canvasW: number,
  canvasH: number,
): number {
  if (canvasW <= 0 || canvasH <= 0) return 0;

  const clampedPacing = Math.max(1, Math.min(5, pacingScore));
  const minDim = Math.min(canvasW, canvasH);
  const baseRadius = minDim * 0.35;
  const pacingScale = 1.0 - (clampedPacing - 1) * 0.06;
  return Math.max(minDim * 0.15, baseRadius * pacingScale);
}

export function drawDynamicVignette(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  pacingScore: number,
  progress: number,
  options?: {
    baseIntensity?: number;
    pulseAmplitude?: number;
    pulseFrequency?: number;
    accentColor?: string;
  },
): void {
  if (w <= 0 || h <= 0) return;

  const baseIntensity = options?.baseIntensity ?? 0.25;
  const pulseAmplitude = options?.pulseAmplitude ?? 0.08;
  const pulseFrequency = options?.pulseFrequency ?? (1.0 + (Math.max(1, Math.min(5, pacingScore)) - 1) * 0.5);

  const clampedPacing = Math.max(1, Math.min(5, pacingScore));
  const pacingMod = 1.0 + (clampedPacing - 3) * 0.1;
  const pulse = Math.sin(progress * Math.PI * 2 * pulseFrequency) * pulseAmplitude;
  const intensity = Math.max(0, Math.min(1, baseIntensity * pacingMod + pulse));

  const innerRadius = computeVignetteRadius(pacingScore, w, h);
  const outerRadius = Math.max(w, h) * 0.8;

  const cx = w / 2;
  const cy = h / 2;

  const gradient = ctx.createRadialGradient(cx, cy, innerRadius, cx, cy, outerRadius);

  const edgeColor = options?.accentColor ?? '0,0,0';
  const isHex = edgeColor.startsWith('#');

  if (isHex) {
    const hex = edgeColor.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16) || 0;
    const g = parseInt(hex.substring(2, 4), 16) || 0;
    const b = parseInt(hex.substring(4, 6), 16) || 0;
    gradient.addColorStop(0, `rgba(${r},${g},${b},0)`);
    gradient.addColorStop(0.6, `rgba(${r},${g},${b},${intensity * 0.3})`);
    gradient.addColorStop(1, `rgba(${r},${g},${b},${intensity})`);
  } else {
    gradient.addColorStop(0, `rgba(${edgeColor},0)`);
    gradient.addColorStop(0.6, `rgba(${edgeColor},${intensity * 0.3})`);
    gradient.addColorStop(1, `rgba(${edgeColor},${intensity})`);
  }

  ctx.save();
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}
