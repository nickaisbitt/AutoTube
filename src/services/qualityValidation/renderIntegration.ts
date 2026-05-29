import { analyzeContrast, isLikelyWatermarked, computeTextDensity, validateMimeTypeFromUrl } from './index';

interface QualityCheckResult {
  passed: boolean;
  penalties: number;
  reasons: string[];
}

export async function runQualityChecks(candidateUrl: string, candidateType: string): Promise<QualityCheckResult> {
  const result: QualityCheckResult = { passed: true, penalties: 0, reasons: [] };

  try {
    const mimeCheck = validateMimeTypeFromUrl(candidateUrl, candidateType as 'image' | 'video');
    if (!mimeCheck.isValid) {
      result.penalties += 100;
      result.reasons.push('invalid_mime');
    }
  } catch {
    result.penalties += 50;
    result.reasons.push('mime_check_failed');
  }

  try {
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      const loaded = await new Promise<boolean>((resolve) => {
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
        setTimeout(() => resolve(false), 5000);
        img.src = candidateUrl;
      });

      if (loaded && img.naturalWidth > 0) {
        const canvas = document.createElement('canvas');
        const sampleSize = 64;
        canvas.width = sampleSize;
        canvas.height = sampleSize;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, sampleSize, sampleSize);
          const imageData = ctx.getImageData(0, 0, sampleSize, sampleSize);

          const contrast = analyzeContrast(imageData.data, sampleSize, sampleSize);
          if (contrast.isLowContrast) {
            result.penalties += 50;
            result.reasons.push('low_contrast');
          }
          if (contrast.isUnderExposed) {
            result.penalties += 30;
            result.reasons.push('under_exposed');
          }

          if (isLikelyWatermarked(imageData.data, sampleSize, sampleSize, 50)) {
            result.penalties += 200;
            result.reasons.push('watermarked');
          }

          const density = computeTextDensity(imageData.data, sampleSize, sampleSize);
          if (density.isScreenshot) {
            result.penalties += 100;
            result.reasons.push('screenshot');
          }
        }
      }
    }
  } catch {
    result.reasons.push('image_analysis_failed');
  }

  result.passed = result.penalties < 150;
  return result;
}
