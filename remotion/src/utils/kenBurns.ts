import { KenBurnsParams } from '../types';

export function computeKenBurnsTransform(
  params: KenBurnsParams,
  progress: number, // 0-1
  width: number,
  height: number
): string {
  const ease = progress < 0.5
    ? 4 * progress * progress * progress
    : 1 - Math.pow(-2 * progress + 2, 3) / 2;
  
  const zoom = params.zoomStart + ease * (params.zoomEnd - params.zoomStart);
  const panX = params.panDirectionX * ease * width * 0.05;
  const panY = params.panDirectionY * ease * height * 0.05;
  
  return `scale(${zoom}) translate(${panX}px, ${panY}px)`;
}

export function getKenBurnsParams(segmentId: string, assetId: string): KenBurnsParams {
  // Deterministic based on IDs
  const hash = segmentId.split('').reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0);
  const seed = Math.abs(hash);
  return {
    zoomStart: 1.0 + (seed % 5) * 0.01,
    zoomEnd: 1.1 + (seed % 8) * 0.025,
    panDirectionX: ((seed % 3) - 1) * 0.5,
    panDirectionY: ((seed % 5) - 2) * 0.3,
  };
}
