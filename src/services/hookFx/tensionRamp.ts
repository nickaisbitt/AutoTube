export interface TensionProfile {
  baseZoomRate: number;
  accelerationFactor: number;
  maxZoom: number;
  segments: { zoomStart: number; zoomEnd: number }[];
}

export function createTensionProfile(
  totalSegments: number,
  intensity: 'low' | 'medium' | 'high' = 'medium',
): TensionProfile {
  if (totalSegments <= 0) {
    return {
      baseZoomRate: 1.0,
      accelerationFactor: 1.0,
      maxZoom: 1.0,
      segments: [],
    };
  }

  const maxZoomMap: Record<string, number> = {
    low: 1.15,
    medium: 1.30,
    high: 1.45,
  };

  const accelMap: Record<string, number> = {
    low: 1.2,
    medium: 1.5,
    high: 1.8,
  };

  const maxZoom = maxZoomMap[intensity];
  const accelerationFactor = accelMap[intensity];
  const totalZoomRange = maxZoom - 1.0;

  let totalWeight = 0;
  const weights: number[] = [];
  for (let i = 0; i < totalSegments; i++) {
    const weight = Math.pow((i + 1) / totalSegments, accelerationFactor);
    weights.push(weight);
    totalWeight += weight;
  }

  const segments: { zoomStart: number; zoomEnd: number }[] = [];
  let currentZoom = 1.0;

  for (let i = 0; i < totalSegments; i++) {
    const segmentZoomRange = totalZoomRange * (weights[i] / totalWeight);
    const zoomStart = currentZoom;
    const zoomEnd = currentZoom + segmentZoomRange;
    segments.push({ zoomStart, zoomEnd });
    currentZoom = zoomEnd;
  }

  const baseZoomRate = totalZoomRange / totalSegments;

  return {
    baseZoomRate,
    accelerationFactor,
    maxZoom,
    segments,
  };
}

export function getSegmentZoom(
  profile: TensionProfile,
  segmentIndex: number,
): { start: number; end: number } {
  if (!profile.segments || segmentIndex < 0 || segmentIndex >= profile.segments.length) {
    return { start: 1.0, end: 1.0 };
  }

  const segment = profile.segments[segmentIndex];
  return { start: segment.zoomStart, end: segment.zoomEnd };
}

export function computeTensionScore(
  pacingScore: number,
  segmentIndex: number,
  totalSegments: number,
): number {
  if (totalSegments <= 0) return 1;

  const clampedPacing = Math.min(10, Math.max(0, pacingScore));
  const segmentProgress = totalSegments > 1 ? segmentIndex / (totalSegments - 1) : 0;

  const positionScore = 1 + segmentProgress * 5;
  const pacingContribution = clampedPacing * 0.4;
  const escalationBonus = segmentProgress * segmentProgress * 2;

  const raw = positionScore + pacingContribution + escalationBonus;
  return Math.min(10, Math.max(1, Math.round(raw * 10) / 10));
}
