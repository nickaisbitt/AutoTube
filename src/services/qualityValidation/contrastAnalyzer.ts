export interface ContrastResult {
  dynamicRange: number;
  meanLuminance: number;
  stdDeviation: number;
  isLowContrast: boolean;
  isOverExposed: boolean;
  isUnderExposed: boolean;
  score: number;
}

const SAMPLE_GRID = 32;

export function analyzeContrast(
  imageData: Uint8ClampedArray,
  w: number,
  h: number,
): ContrastResult {
  const luminanceValues: number[] = [];
  const stepX = Math.max(1, Math.floor(w / SAMPLE_GRID));
  const stepY = Math.max(1, Math.floor(h / SAMPLE_GRID));

  for (let y = 0; y < h; y += stepY) {
    for (let x = 0; x < w; x += stepX) {
      const idx = (y * w + x) * 4;
      const lum = 0.299 * imageData[idx] + 0.587 * imageData[idx + 1] + 0.114 * imageData[idx + 2];
      luminanceValues.push(lum);
    }
  }

  if (luminanceValues.length === 0) {
    return {
      dynamicRange: 0,
      meanLuminance: 0,
      stdDeviation: 0,
      isLowContrast: true,
      isOverExposed: false,
      isUnderExposed: false,
      score: 0,
    };
  }

  let min = 255;
  let max = 0;
  let sum = 0;

  for (const lum of luminanceValues) {
    if (lum < min) min = lum;
    if (lum > max) max = lum;
    sum += lum;
  }

  const meanLuminance = sum / luminanceValues.length;
  const dynamicRange = max - min;

  let varianceSum = 0;
  for (const lum of luminanceValues) {
    varianceSum += (lum - meanLuminance) * (lum - meanLuminance);
  }
  const stdDeviation = Math.sqrt(varianceSum / luminanceValues.length);

  const isLowContrast = dynamicRange < 80;
  const isOverExposed = meanLuminance > 200;
  const isUnderExposed = meanLuminance < 40;

  let score = 100;

  if (isLowContrast) {
    score -= Math.round((80 - dynamicRange) * 0.8);
  }

  if (isOverExposed) {
    score -= Math.round((meanLuminance - 200) * 0.9);
  }

  if (isUnderExposed) {
    score -= Math.round((40 - meanLuminance) * 1.0);
  }

  if (stdDeviation < 20) {
    score -= Math.round((20 - stdDeviation) * 1.5);
  }

  const idealMean = 128;
  const meanDeviation = Math.abs(meanLuminance - idealMean);
  if (meanDeviation > 50) {
    score -= Math.round((meanDeviation - 50) * 0.3);
  }

  if (dynamicRange >= 150 && stdDeviation >= 40 && meanDeviation < 40) {
    score += 10;
  }

  score = Math.max(0, Math.min(100, score));

  return {
    dynamicRange: Math.round(dynamicRange * 10) / 10,
    meanLuminance: Math.round(meanLuminance * 10) / 10,
    stdDeviation: Math.round(stdDeviation * 10) / 10,
    isLowContrast,
    isOverExposed,
    isUnderExposed,
    score,
  };
}
