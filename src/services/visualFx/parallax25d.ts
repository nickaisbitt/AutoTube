import type { RenderContext2D } from '../renderingShared';

export interface ParallaxLayer {
  imageData: any;
  depth: number;
  offsetX: number;
  offsetY: number;
  scale: number;
}

export function computeParallaxOffset(
  depth: number,
  progress: number,
  maxOffset: number,
): { x: number; y: number } {
  if (maxOffset === 0 || depth === 0) return { x: 0, y: 0 };
  const eased = Math.sin(progress * Math.PI * 0.5);
  return {
    x: eased * maxOffset * depth,
    y: eased * maxOffset * depth * 0.3,
  };
}

export function splitIntoLayers(
  image: any,
  canvasW: number,
  canvasH: number,
): ParallaxLayer[] {
  if (!image || canvasW <= 0 || canvasH <= 0) return [];

  const { createCanvas } = require('canvas');
  const sampleCanvas = createCanvas(canvasW, canvasH);
  const sampleCtx = sampleCanvas.getContext('2d');
  sampleCtx.drawImage(image, 0, 0, canvasW, canvasH);

  let imageData: ImageData;
  try {
    imageData = sampleCtx.getImageData(0, 0, canvasW, canvasH);
  } catch {
    return [
      { imageData: image, depth: 0.6, offsetX: 0, offsetY: 0, scale: 1.0 },
    ];
  }

  const gridW = 32;
  const gridH = 32;
  const cellW = canvasW / gridW;
  const cellH = canvasH / gridH;
  const brightnessGrid: number[][] = [];

  for (let gy = 0; gy < gridH; gy++) {
    brightnessGrid[gy] = [];
    for (let gx = 0; gx < gridW; gx++) {
      let totalBrightness = 0;
      let samples = 0;
      const startX = Math.floor(gx * cellW);
      const startY = Math.floor(gy * cellH);
      const endX = Math.min(Math.floor((gx + 1) * cellW), canvasW);
      const endY = Math.min(Math.floor((gy + 1) * cellH), canvasH);

      for (let py = startY; py < endY; py += 4) {
        for (let px = startX; px < endX; px += 4) {
          const idx = (py * canvasW + px) * 4;
          const r = imageData.data[idx];
          const g = imageData.data[idx + 1];
          const b = imageData.data[idx + 2];
          totalBrightness += (r * 0.299 + g * 0.587 + b * 0.114);
          samples++;
        }
      }
      brightnessGrid[gy][gx] = samples > 0 ? totalBrightness / samples : 128;
    }
  }

  const layerConfigs = [
    { depth: 0.3, minBright: 170, maxBright: 255, scale: 1.05 },
    { depth: 0.6, minBright: 85, maxBright: 170, scale: 1.10 },
    { depth: 1.0, minBright: 0, maxBright: 85, scale: 1.15 },
  ];

  const layers: ParallaxLayer[] = [];

  for (const config of layerConfigs) {
    const layerCanvas = createCanvas(canvasW, canvasH);
    const layerCtx = layerCanvas.getContext('2d');
    layerCtx.drawImage(image, 0, 0, canvasW, canvasH);

    const layerData = layerCtx.getImageData(0, 0, canvasW, canvasH);

    for (let py = 0; py < canvasH; py++) {
      const gy = Math.min(Math.floor(py / cellH), gridH - 1);
      for (let px = 0; px < canvasW; px++) {
        const gx = Math.min(Math.floor(px / cellW), gridW - 1);
        const brightness = brightnessGrid[gy][gx];
        const idx = (py * canvasW + px) * 4;

        if (brightness < config.minBright || brightness > config.maxBright) {
          layerData.data[idx + 3] = 0;
        } else {
          const distFromCenter = Math.min(
            Math.abs(brightness - (config.minBright + config.maxBright) / 2) /
            ((config.maxBright - config.minBright) / 2),
            1,
          );
          const feather = 1 - distFromCenter * 0.3;
          layerData.data[idx + 3] = Math.round(layerData.data[idx + 3] * feather);
        }
      }
    }

    layerCtx.putImageData(layerData, 0, 0);

    layers.push({
      imageData: layerCanvas,
      depth: config.depth,
      offsetX: 0,
      offsetY: 0,
      scale: config.scale,
    });
  }

  return layers;
}

export function drawParallaxFrame(
  ctx: RenderContext2D,
  layers: ParallaxLayer[],
  progress: number,
  canvasW: number,
  canvasH: number,
): void {
  if (!layers || layers.length === 0 || canvasW <= 0 || canvasH <= 0) return;

  const maxOffset = canvasW * 0.05;

  for (const layer of layers) {
    const offset = computeParallaxOffset(layer.depth, progress, maxOffset);
    const s = layer.scale;
    const dw = canvasW * s;
    const dh = canvasH * s;
    const dx = (canvasW - dw) / 2 + offset.x + layer.offsetX;
    const dy = (canvasH - dh) / 2 + offset.y + layer.offsetY;

    ctx.save();
    ctx.drawImage(layer.imageData, dx, dy, dw, dh);
    ctx.restore();
  }
}
