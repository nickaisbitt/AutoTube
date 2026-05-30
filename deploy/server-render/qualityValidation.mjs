/**
 * Quality Validation Module - .mjs wrapper
 * Media quality assurance and filtering
 */

export function analyzeContrast(imageData, w, h) {
  const sampleSize = 32;
  const cellW = Math.floor(w / sampleSize);
  const cellH = Math.floor(h / sampleSize);
  
  let minLum = 255;
  let maxLum = 0;
  let totalLum = 0;
  let samples = 0;
  
  for (let gy = 0; gy < sampleSize; gy++) {
    for (let gx = 0; gx < sampleSize; gx++) {
      const startX = gx * cellW;
      const startY = gy * cellH;
      let cellLum = 0;
      let cellSamples = 0;
      
      for (let y = startY; y < startY + cellH && y < h; y += 4) {
        for (let x = startX; x < startX + cellW && x < w; x += 4) {
          const idx = (y * w + x) * 4;
          const r = imageData.data[idx];
          const g = imageData.data[idx + 1];
          const b = imageData.data[idx + 2];
          const lum = r * 0.299 + g * 0.587 + b * 0.114;
          cellLum += lum;
          cellSamples++;
        }
      }
      
      if (cellSamples > 0) {
        const avgLum = cellLum / cellSamples;
        minLum = Math.min(minLum, avgLum);
        maxLum = Math.max(maxLum, avgLum);
        totalLum += avgLum;
        samples++;
      }
    }
  }
  
  const dynamicRange = maxLum - minLum;
  const meanLuminance = samples > 0 ? totalLum / samples : 128;
  
  return {
    dynamicRange,
    meanLuminance,
    isLowContrast: dynamicRange < 80,
    isOverExposed: meanLuminance > 200,
    isUnderExposed: meanLuminance < 40,
    score: Math.min(100, Math.max(0, dynamicRange * 0.5 + (128 - Math.abs(meanLuminance - 128)) * 0.3))
  };
}

export function detectWatermarkRegions(imageData, w, h) {
  const regions = [];
  const cornerSize = 0.1;
  const centerSize = 0.2;
  
  const checkRegion = (x, y, rw, rh) => {
    let totalVariance = 0;
    let samples = 0;
    let avgLum = 0;
    
    for (let py = y; py < y + rh && py < h; py += 4) {
      for (let px = x; px < x + rw && px < w; px += 4) {
        const idx = (py * w + px) * 4;
        const lum = imageData.data[idx] * 0.299 + imageData.data[idx + 1] * 0.587 + imageData.data[idx + 2] * 0.114;
        avgLum += lum;
        samples++;
      }
    }
    
    if (samples === 0) return 0;
    avgLum /= samples;
    
    for (let py = y; py < y + rh && py < h; py += 4) {
      for (let px = x; px < x + rw && px < w; px += 4) {
        const idx = (py * w + px) * 4;
        const lum = imageData.data[idx] * 0.299 + imageData.data[idx + 1] * 0.587 + imageData.data[idx + 2] * 0.114;
        totalVariance += Math.abs(lum - avgLum);
      }
    }
    
    return totalVariance / samples;
  };
  
  const corners = [
    { x: 0, y: 0, label: 'top-left' },
    { x: w * (1 - cornerSize), y: 0, label: 'top-right' },
    { x: 0, y: h * (1 - cornerSize), label: 'bottom-left' },
    { x: w * (1 - cornerSize), y: h * (1 - cornerSize), label: 'bottom-right' },
  ];
  
  for (const corner of corners) {
    const variance = checkRegion(corner.x, corner.y, w * cornerSize, h * cornerSize);
    if (variance < 15) {
      regions.push({
        x: corner.x,
        y: corner.y,
        w: w * cornerSize,
        h: h * cornerSize,
        confidence: Math.max(0, 1 - variance / 15)
      });
    }
  }
  
  return regions;
}

export function computeWatermarkScore(regions) {
  if (regions.length === 0) return 0;
  return regions.reduce((sum, r) => sum + r.confidence * 100, 0) / regions.length;
}

export function isLikelyWatermarked(imageData, w, h, threshold = 60) {
  const regions = detectWatermarkRegions(imageData, w, h);
  const score = computeWatermarkScore(regions);
  return score >= threshold;
}

export function computeTextDensity(imageData, w, h) {
  const sampleW = 64;
  const sampleH = 64;
  const cellW = Math.floor(w / sampleW);
  const cellH = Math.floor(h / sampleH);
  
  let edgeCount = 0;
  let totalPixels = 0;
  
  for (let y = 1; y < h - 1; y += cellH) {
    for (let x = 1; x < w - 1; x += cellW) {
      const idx = (y * w + x) * 4;
      const idxRight = (y * w + (x + 1)) * 4;
      const idxDown = ((y + 1) * w + x) * 4;
      
      const lum = imageData.data[idx] * 0.299 + imageData.data[idx + 1] * 0.587 + imageData.data[idx + 2] * 0.114;
      const lumRight = imageData.data[idxRight] * 0.299 + imageData.data[idxRight + 1] * 0.587 + imageData.data[idxRight + 2] * 0.114;
      const lumDown = imageData.data[idxDown] * 0.299 + imageData.data[idxDown + 1] * 0.587 + imageData.data[idxDown + 2] * 0.114;
      
      const edge = Math.abs(lum - lumRight) + Math.abs(lum - lumDown);
      if (edge > 30) edgeCount++;
      totalPixels++;
    }
  }
  
  const edgeDensity = totalPixels > 0 ? edgeCount / totalPixels : 0;
  
  return {
    edgeDensity,
    isScreenshot: edgeDensity > 0.15,
    isDocument: edgeDensity > 0.20,
    isPhotography: edgeDensity < 0.05,
    score: edgeDensity < 0.05 ? 100 : edgeDensity > 0.15 ? 30 : 70
  };
}

export function validateMimeTypeFromUrl(url, expectedType) {
  const lower = url.toLowerCase();
  const ext = lower.split('.').pop().split('?')[0];
  
  const imageExts = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'];
  const videoExts = ['mp4', 'webm', 'mov', 'avi'];
  
  if (expectedType === 'image') {
    return { isValid: imageExts.includes(ext), mimeType: `image/${ext === 'jpg' ? 'jpeg' : ext}` };
  } else if (expectedType === 'video') {
    return { isValid: videoExts.includes(ext), mimeType: `video/${ext}` };
  }
  
  return { isValid: false, mimeType: 'unknown' };
}

export function isDomainBlocked(url, blocklist) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return blocklist.some(domain => hostname.includes(domain.toLowerCase()));
  } catch {
    return false;
  }
}
