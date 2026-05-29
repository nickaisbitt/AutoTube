export type AspectRatio = '16:9' | '9:16' | '1:1' | '4:5';

export const ASPECT_RATIO_DIMENSIONS: Record<AspectRatio, { width: number; height: number }> = {
  '16:9': { width: 1920, height: 1080 },
  '9:16': { width: 1080, height: 1920 },
  '1:1': { width: 1080, height: 1080 },
  '4:5': { width: 1080, height: 1350 },
};

export function computeCropForAspect(
  sourceW: number,
  sourceH: number,
  targetAspect: AspectRatio,
): { x: number; y: number; w: number; h: number } {
  if (sourceW <= 0 || sourceH <= 0) {
    return { x: 0, y: 0, w: 0, h: 0 };
  }

  const dims = ASPECT_RATIO_DIMENSIONS[targetAspect];
  const targetRatio = dims.width / dims.height;
  const sourceRatio = sourceW / sourceH;

  let cropW: number;
  let cropH: number;

  if (sourceRatio > targetRatio) {
    cropH = sourceH;
    cropW = Math.round(sourceH * targetRatio);
  } else {
    cropW = sourceW;
    cropH = Math.round(sourceW / targetRatio);
  }

  const x = Math.round((sourceW - cropW) / 2);
  const y = Math.round((sourceH - cropH) / 2);

  return { x, y, w: cropW, h: cropH };
}

export function generateMultiAspectRenderCommands(
  inputFile: string,
  aspects: AspectRatio[],
  outputDir: string,
): string[][] {
  if (!inputFile || aspects.length === 0 || !outputDir) return [];

  return aspects.map((aspect) => {
    const dims = ASPECT_RATIO_DIMENSIONS[aspect];
    const safeName = aspect.replace(':', 'x');
    const outputFile = `${outputDir}/output_${safeName}.mp4`;

    return [
      '-i', inputFile,
      '-vf', `scale=${dims.width}:${dims.height}:force_original_aspect_ratio=increase,crop=${dims.width}:${dims.height}`,
      '-c:v', 'libx264',
      '-preset', 'medium',
      '-crf', '18',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-y',
      outputFile,
    ];
  });
}
