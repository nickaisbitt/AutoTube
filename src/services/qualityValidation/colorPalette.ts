export interface ColorPalette {
  dominant: string;
  secondary: string;
  accent: string;
  warmth: 'warm' | 'cool' | 'neutral';
  saturation: number;
  brightness: number;
}

interface RGB {
  r: number;
  g: number;
  b: number;
}

interface HSL {
  h: number;
  s: number;
  l: number;
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (v: number) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function rgbToHsl(r: number, g: number, b: number): HSL {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;

  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;

  if (max === min) {
    return { h: 0, s: 0, l };
  }

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

  let h: number;
  if (max === rn) {
    h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  } else if (max === gn) {
    h = ((bn - rn) / d + 2) / 6;
  } else {
    h = ((rn - gn) / d + 4) / 6;
  }

  return { h: h * 360, s, l };
}

function hexToRgb(hex: string): RGB {
  const clean = hex.replace('#', '');
  return {
    r: parseInt(clean.substring(0, 2), 16),
    g: parseInt(clean.substring(2, 4), 16),
    b: parseInt(clean.substring(4, 6), 16),
  };
}

function colorDistance(a: RGB, b: RGB): number {
  return Math.sqrt(
    (a.r - b.r) * (a.r - b.r) +
    (a.g - b.g) * (a.g - b.g) +
    (a.b - b.b) * (a.b - b.b),
  );
}

function kMeansClusters(colors: RGB[], k: number, maxIterations: number = 20): RGB[] {
  if (colors.length === 0) {
    return Array.from({ length: k }, () => ({ r: 128, g: 128, b: 128 }));
  }

  if (colors.length <= k) {
    const result = [...colors];
    while (result.length < k) {
      result.push({ ...result[result.length - 1] });
    }
    return result;
  }

  const step = Math.floor(colors.length / k);
  const centroids: RGB[] = Array.from({ length: k }, (_, i) => ({ ...colors[i * step] }));

  for (let iter = 0; iter < maxIterations; iter++) {
    const clusters: RGB[][] = Array.from({ length: k }, () => []);

    for (const color of colors) {
      let minDist = Infinity;
      let closestIdx = 0;
      for (let c = 0; c < k; c++) {
        const dist = colorDistance(color, centroids[c]);
        if (dist < minDist) {
          minDist = dist;
          closestIdx = c;
        }
      }
      clusters[closestIdx].push(color);
    }

    let converged = true;
    for (let c = 0; c < k; c++) {
      if (clusters[c].length === 0) continue;

      let sumR = 0, sumG = 0, sumB = 0;
      for (const color of clusters[c]) {
        sumR += color.r;
        sumG += color.g;
        sumB += color.b;
      }

      const newCentroid: RGB = {
        r: Math.round(sumR / clusters[c].length),
        g: Math.round(sumG / clusters[c].length),
        b: Math.round(sumB / clusters[c].length),
      };

      if (colorDistance(newCentroid, centroids[c]) > 1) {
        converged = false;
      }
      centroids[c] = newCentroid;
    }

    if (converged) break;
  }

  return centroids;
}

export function extractPalette(
  imageData: Uint8ClampedArray,
  w: number,
  h: number,
): ColorPalette {
  const colors: RGB[] = [];
  const stepX = Math.max(1, Math.floor(w / 16));
  const stepY = Math.max(1, Math.floor(h / 16));

  for (let y = 0; y < h; y += stepY) {
    for (let x = 0; x < w; x += stepX) {
      const idx = (y * w + x) * 4;
      colors.push({
        r: imageData[idx],
        g: imageData[idx + 1],
        b: imageData[idx + 2],
      });
    }
  }

  const centroids = kMeansClusters(colors, 3);

  const centroidSizes: number[] = [0, 0, 0];
  for (const color of colors) {
    let minDist = Infinity;
    let closestIdx = 0;
    for (let c = 0; c < 3; c++) {
      const dist = colorDistance(color, centroids[c]);
      if (dist < minDist) {
        minDist = dist;
        closestIdx = c;
      }
    }
    centroidSizes[closestIdx]++;
  }

  const indexed = centroids.map((c, i) => ({ color: c, size: centroidSizes[i] }));
  indexed.sort((a, b) => b.size - a.size);

  const dominant = rgbToHex(indexed[0].color.r, indexed[0].color.g, indexed[0].color.b);
  const secondary = rgbToHex(indexed[1].color.r, indexed[1].color.g, indexed[1].color.b);
  const accent = rgbToHex(indexed[2].color.r, indexed[2].color.g, indexed[2].color.b);

  let totalHue = 0;
  let totalSat = 0;
  let totalBright = 0;
  let hueCount = 0;

  for (const color of colors) {
    const hsl = rgbToHsl(color.r, color.g, color.b);
    totalSat += hsl.s;
    totalBright += hsl.l;
    if (hsl.s > 0.1) {
      totalHue += hsl.h;
      hueCount++;
    }
  }

  const avgSat = colors.length > 0 ? totalSat / colors.length : 0;
  const avgBright = colors.length > 0 ? totalBright / colors.length : 0;
  const avgHue = hueCount > 0 ? totalHue / hueCount : 0;

  let warmth: 'warm' | 'cool' | 'neutral';
  if (avgHue >= 0 && avgHue < 60) {
    warmth = 'warm';
  } else if (avgHue >= 60 && avgHue < 180) {
    warmth = 'cool';
  } else if (avgHue >= 180 && avgHue < 270) {
    warmth = 'cool';
  } else {
    warmth = 'warm';
  }

  if (avgSat < 0.15) {
    warmth = 'neutral';
  }

  return {
    dominant,
    secondary,
    accent,
    warmth,
    saturation: Math.round(avgSat * 100) / 100,
    brightness: Math.round(avgBright * 100) / 100,
  };
}

function hueFromHex(hex: string): number {
  const rgb = hexToRgb(hex);
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  return hsl.h;
}

function saturationFromHex(hex: string): number {
  const rgb = hexToRgb(hex);
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  return hsl.s;
}

function hueDistance(h1: number, h2: number): number {
  const d = Math.abs(h1 - h2);
  return Math.min(d, 360 - d);
}

export function computePaletteBonus(
  palette: ColorPalette,
  accentColor: string,
): number {
  let bonus = 0;

  const accentHue = hueFromHex(accentColor);
  const accentSat = saturationFromHex(accentColor);

  const dominantHue = hueFromHex(palette.dominant);
  const secondaryHue = hueFromHex(palette.secondary);
  const paletteAccentHue = hueFromHex(palette.accent);

  const hues = [dominantHue, secondaryHue, paletteAccentHue];

  for (const hue of hues) {
    const dist = hueDistance(hue, accentHue);

    if (dist >= 150 && dist <= 210) {
      bonus += 30;
      break;
    }
  }

  for (const hue of hues) {
    const dist = hueDistance(hue, accentHue);
    if (dist <= 30) {
      bonus += 20;
      break;
    }
  }

  if (palette.saturation > 0.5) {
    bonus += 10;
  }

  if (palette.warmth === 'warm' && accentSat > 0.4 && (accentHue < 60 || accentHue > 300)) {
    bonus += 10;
  }

  let hasClash = false;
  for (let i = 0; i < hues.length; i++) {
    for (let j = i + 1; j < hues.length; j++) {
      const dist = hueDistance(hues[i], hues[j]);
      if (dist > 60 && dist < 120) {
        hasClash = true;
      }
    }
  }
  if (hasClash) {
    bonus -= 20;
  }

  if (palette.saturation < 0.15) {
    bonus -= 30;
  }

  return Math.max(-50, Math.min(50, bonus));
}
