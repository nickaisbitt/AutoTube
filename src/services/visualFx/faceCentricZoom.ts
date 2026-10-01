import type { RenderContext2D } from '../renderingShared';

interface BoundingBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

function isSkinTone(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / (2 * 255);

  if (l < 0.2 || l > 0.8) return false;

  const delta = (max - min) / 255;
  const s = l > 0.5 ? delta / (2 - max / 255 - min / 255) : delta / (max / 255 + min / 255);

  if (s < 0.2 || s > 0.8) return false;

  let h = 0;
  if (delta > 0) {
    if (max === r) {
      h = 60 * (((g - b) / (delta * 255)) % 6);
    } else if (max === g) {
      h = 60 * (((b - r) / (delta * 255)) + 2);
    } else {
      h = 60 * (((r - g) / (delta * 255)) + 4);
    }
  }
  if (h < 0) h += 360;

  return h >= 0 && h <= 50;
}

export function detectFaceRegion(
  imageData: Uint8ClampedArray,
  w: number,
  h: number,
): BoundingBox | null {
  if (!imageData || w <= 0 || h <= 0 || imageData.length < w * h * 4) return null;

  const step = Math.max(2, Math.floor(Math.min(w, h) / 120));
  const skinMap: boolean[] = new Array(Math.ceil(w / step) * Math.ceil(h / step)).fill(false);
  const mapW = Math.ceil(w / step);
  const mapH = Math.ceil(h / step);

  for (let my = 0; my < mapH; my++) {
    for (let mx = 0; mx < mapW; mx++) {
      const px = Math.min(mx * step, w - 1);
      const py = Math.min(my * step, h - 1);
      const idx = (py * w + px) * 4;
      const r = imageData[idx];
      const g = imageData[idx + 1];
      const b = imageData[idx + 2];
      skinMap[my * mapW + mx] = isSkinTone(r, g, b);
    }
  }

  const visited = new Uint8Array(mapW * mapH);
  let bestCluster: { minX: number; minY: number; maxX: number; maxY: number; count: number } | null = null;

  for (let my = 0; my < mapH; my++) {
    for (let mx = 0; mx < mapW; mx++) {
      const mi = my * mapW + mx;
      if (!skinMap[mi] || visited[mi]) continue;

      let minX = mx, minY = my, maxX = mx, maxY = my;
      let count = 0;
      const queue: number[] = [mi];
      visited[mi] = 1;

      while (queue.length > 0) {
        const ci = queue.pop()!;
        const cx = ci % mapW;
        const cy = Math.floor(ci / mapW);
        count++;
        if (cx < minX) minX = cx;
        if (cy < minY) minY = cy;
        if (cx > maxX) maxX = cx;
        if (cy > maxY) maxY = cy;

        const neighbors = [
          cy > 0 ? (cy - 1) * mapW + cx : -1,
          cy < mapH - 1 ? (cy + 1) * mapW + cx : -1,
          cx > 0 ? cy * mapW + (cx - 1) : -1,
          cx < mapW - 1 ? cy * mapW + (cx + 1) : -1,
        ];

        for (const ni of neighbors) {
          if (ni >= 0 && skinMap[ni] && !visited[ni]) {
            visited[ni] = 1;
            queue.push(ni);
          }
        }
      }

      if (!bestCluster || count > bestCluster.count) {
        bestCluster = { minX, minY, maxX, maxY, count };
      }
    }
  }

  if (!bestCluster || bestCluster.count < 4) return null;

  const minPixelsRequired = Math.floor(mapW * mapH * 0.005);
  if (bestCluster.count < minPixelsRequired) return null;

  return {
    x: bestCluster.minX * step,
    y: bestCluster.minY * step,
    w: (bestCluster.maxX - bestCluster.minX + 1) * step,
    h: (bestCluster.maxY - bestCluster.minY + 1) * step,
  };
}

export function computeFaceCentricTransform(
  face: BoundingBox,
  canvasW: number,
  canvasH: number,
  zoomLevel: number,
): { translateX: number; translateY: number; scale: number } {
  if (canvasW <= 0 || canvasH <= 0 || zoomLevel <= 0) {
    return { translateX: 0, translateY: 0, scale: 1 };
  }

  const faceCenterX = face.x + face.w / 2;
  const faceCenterY = face.y + face.h / 2;

  const upperThirdY = canvasH / 3;
  const centerX = canvasW / 2;

  const scale = Math.max(1, zoomLevel);
  const translateX = centerX - faceCenterX * scale;
  const translateY = upperThirdY - faceCenterY * scale;

  return { translateX, translateY, scale };
}

export function applyFaceCentricZoom(
  ctx: RenderContext2D,
  image: any,
  face: BoundingBox,
  canvasW: number,
  canvasH: number,
  zoom: number,
): void {
  if (!image || canvasW <= 0 || canvasH <= 0 || zoom <= 0) return;

  const transform = computeFaceCentricTransform(face, canvasW, canvasH, zoom);

  ctx.save();
  ctx.translate(transform.translateX, transform.translateY);
  ctx.scale(transform.scale, transform.scale);
  ctx.drawImage(image, 0, 0);
  ctx.restore();
}
