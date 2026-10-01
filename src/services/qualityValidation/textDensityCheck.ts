export interface TextDensityResult {
  edgeDensity: number;
  isScreenshot: boolean;
  isDocument: boolean;
  isPhotography: boolean;
  score: number;
}

function computeLuminance(imageData: Uint8ClampedArray, w: number, h: number): Float64Array {
  const lum = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const idx = i * 4;
    lum[i] = 0.299 * imageData[idx] + 0.587 * imageData[idx + 1] + 0.114 * imageData[idx + 2];
  }
  return lum;
}

function sobelEdgeDetection(lum: Float64Array, w: number, h: number): Uint8Array {
  const edges = new Uint8Array(w * h);
  const threshold = 30;

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;

      const tl = lum[(y - 1) * w + (x - 1)];
      const tc = lum[(y - 1) * w + x];
      const tr = lum[(y - 1) * w + (x + 1)];
      const ml = lum[y * w + (x - 1)];
      const mr = lum[y * w + (x + 1)];
      const bl = lum[(y + 1) * w + (x - 1)];
      const bc = lum[(y + 1) * w + x];
      const br = lum[(y + 1) * w + (x + 1)];

      const gx = -tl - 2 * ml - bl + tr + 2 * mr + br;
      const gy = -tl - 2 * tc - tr + bl + 2 * bc + br;
      const magnitude = Math.sqrt(gx * gx + gy * gy);

      edges[idx] = magnitude > threshold ? 1 : 0;
    }
  }

  return edges;
}

export function computeTextDensity(
  imageData: Uint8ClampedArray,
  w: number,
  h: number,
): TextDensityResult {
  const lum = computeLuminance(imageData, w, h);
  const edges = sobelEdgeDetection(lum, w, h);

  let edgePixelCount = 0;
  const totalPixels = (w - 2) * (h - 2);

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      if (edges[y * w + x] === 1) {
        edgePixelCount++;
      }
    }
  }

  const edgeDensity = totalPixels > 0 ? edgePixelCount / totalPixels : 0;

  const isScreenshot = edgeDensity > 0.15;
  const isDocument = edgeDensity > 0.20;
  const isPhotography = edgeDensity < 0.05;

  let score: number;

  if (isPhotography) {
    score = 85 + Math.round((0.05 - edgeDensity) / 0.05 * 15);
  } else if (edgeDensity <= 0.15) {
    score = 85 - Math.round((edgeDensity - 0.05) / 0.10 * 35);
  } else if (edgeDensity <= 0.20) {
    score = 50 - Math.round((edgeDensity - 0.15) / 0.05 * 25);
  } else {
    score = Math.max(5, 25 - Math.round((edgeDensity - 0.20) * 200));
  }

  score = Math.max(0, Math.min(100, score));

  return {
    edgeDensity: Math.round(edgeDensity * 10000) / 10000,
    isScreenshot,
    isDocument,
    isPhotography,
    score,
  };
}
