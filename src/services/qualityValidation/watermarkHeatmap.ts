export interface WatermarkRegion {
  x: number;
  y: number;
  w: number;
  h: number;
  confidence: number;
}

function getRegionLuminanceStats(
  imageData: Uint8ClampedArray,
  imgW: number,
  imgH: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
): { mean: number; stdDev: number; min: number; max: number } {
  const values: number[] = [];
  const x0 = Math.max(0, Math.floor(rx));
  const y0 = Math.max(0, Math.floor(ry));
  const x1 = Math.min(imgW, Math.floor(rx + rw));
  const y1 = Math.min(imgH, Math.floor(ry + rh));

  for (let y = y0; y < y1; y += 2) {
    for (let x = x0; x < x1; x += 2) {
      const idx = (y * imgW + x) * 4;
      const lum = 0.299 * imageData[idx] + 0.587 * imageData[idx + 1] + 0.114 * imageData[idx + 2];
      values.push(lum);
    }
  }

  if (values.length === 0) return { mean: 0, stdDev: 0, min: 0, max: 0 };

  let sum = 0;
  let min = 255;
  let max = 0;
  for (const v of values) {
    sum += v;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const mean = sum / values.length;

  let varianceSum = 0;
  for (const v of values) {
    varianceSum += (v - mean) * (v - mean);
  }
  const stdDev = Math.sqrt(varianceSum / values.length);

  return { mean, stdDev, min, max };
}

function detectSemiTransparentOverlay(
  imageData: Uint8ClampedArray,
  imgW: number,
  imgH: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
): number {
  const region = getRegionLuminanceStats(imageData, imgW, imgH, rx, ry, rw, rh);
  const fullImage = getRegionLuminanceStats(imageData, imgW, imgH, 0, 0, imgW, imgH);

  if (fullImage.stdDev === 0) return 0;

  const contrastReduction = 1 - (region.stdDev / fullImage.stdDev);
  const meanShift = Math.abs(region.mean - fullImage.mean) / 255;

  if (contrastReduction > 0.3 && meanShift < 0.15) {
    return Math.min(contrastReduction * 1.5, 1);
  }

  return Math.max(0, contrastReduction * 0.5);
}

function detectRepeatedPattern(
  imageData: Uint8ClampedArray,
  imgW: number,
  imgH: number,
): number {
  const sampleSize = 16;
  const regions: { mean: number; stdDev: number }[] = [];

  const gridCols = Math.floor(imgW / sampleSize);
  const gridRows = Math.floor(imgH / sampleSize);

  for (let gy = 0; gy < Math.min(gridRows, 8); gy++) {
    for (let gx = 0; gx < Math.min(gridCols, 8); gx++) {
      const stats = getRegionLuminanceStats(
        imageData, imgW, imgH,
        gx * sampleSize, gy * sampleSize,
        sampleSize, sampleSize,
      );
      regions.push({ mean: stats.mean, stdDev: stats.stdDev });
    }
  }

  if (regions.length < 4) return 0;

  const stdDevs = regions.map(r => r.stdDev);
  const avgStdDev = stdDevs.reduce((a, b) => a + b, 0) / stdDevs.length;

  let similarCount = 0;
  for (const sd of stdDevs) {
    if (Math.abs(sd - avgStdDev) < avgStdDev * 0.2) {
      similarCount++;
    }
  }

  const uniformity = similarCount / stdDevs.length;
  return uniformity > 0.8 ? uniformity * 0.4 : 0;
}

export function detectWatermarkRegions(
  imageData: Uint8ClampedArray,
  w: number,
  h: number,
): WatermarkRegion[] {
  const regions: WatermarkRegion[] = [];
  const cornerW = w * 0.1;
  const cornerH = h * 0.1;

  const checkRegions: Array<{ x: number; y: number; w: number; h: number; label: string }> = [
    { x: 0, y: 0, w: cornerW, h: cornerH, label: 'top-left' },
    { x: w - cornerW, y: 0, w: cornerW, h: cornerH, label: 'top-right' },
    { x: 0, y: h - cornerH, w: cornerW, h: cornerH, label: 'bottom-left' },
    { x: w - cornerW, y: h - cornerH, w: cornerW, h: cornerH, label: 'bottom-right' },
    { x: w * 0.4, y: h * 0.4, w: w * 0.2, h: h * 0.2, label: 'center' },
  ];

  const patternScore = detectRepeatedPattern(imageData, w, h);

  for (const region of checkRegions) {
    const overlayScore = detectSemiTransparentOverlay(
      imageData, w, h,
      region.x, region.y, region.w, region.h,
    );

    const confidence = Math.min(1, overlayScore + patternScore);

    if (confidence > 0.1) {
      regions.push({
        x: Math.round(region.x),
        y: Math.round(region.y),
        w: Math.round(region.w),
        h: Math.round(region.h),
        confidence: Math.round(confidence * 100) / 100,
      });
    }
  }

  return regions.sort((a, b) => b.confidence - a.confidence);
}

export function computeWatermarkScore(regions: WatermarkRegion[]): number {
  if (regions.length === 0) return 0;

  let totalConfidence = 0;
  for (const region of regions) {
    totalConfidence += region.confidence;
  }

  const avgConfidence = totalConfidence / regions.length;
  const regionBonus = Math.min(regions.length * 5, 20);
  const raw = avgConfidence * 80 + regionBonus;

  return Math.min(100, Math.round(raw));
}

export function isLikelyWatermarked(
  imageData: Uint8ClampedArray,
  w: number,
  h: number,
  threshold: number = 60,
): boolean {
  const regions = detectWatermarkRegions(imageData, w, h);
  const score = computeWatermarkScore(regions);
  return score >= threshold;
}
