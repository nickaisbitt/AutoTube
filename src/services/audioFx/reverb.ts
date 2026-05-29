export type ReverbPreset = 'hall' | 'room' | 'plate' | 'cathedral' | 'subtle';

export const REVERB_PRESETS: Record<ReverbPreset, { delay: number; decay: number; wetMix: number }> = {
  hall: { delay: 80, decay: 0.4, wetMix: 0.3 },
  room: { delay: 40, decay: 0.2, wetMix: 0.2 },
  plate: { delay: 60, decay: 0.3, wetMix: 0.25 },
  cathedral: { delay: 120, decay: 0.6, wetMix: 0.35 },
  subtle: { delay: 30, decay: 0.15, wetMix: 0.15 },
};

export function computeReverbFilter(preset: ReverbPreset, enableStart?: number, enableEnd?: number): string {
  const { delay, decay } = REVERB_PRESETS[preset];
  let filter = `aecho=0.8:0.88:${delay}:${decay}`;
  if (enableStart !== undefined && enableEnd !== undefined) {
    filter += `:enable='between(t,${enableStart.toFixed(3)},${enableEnd.toFixed(3)})'`;
  }
  return filter;
}

export function applyReverb(inputFile: string, outputFile: string, preset: ReverbPreset, startSec?: number, endSec?: number): string[] {
  const filter = computeReverbFilter(preset, startSec, endSec);
  return [
    '-y',
    '-i', inputFile,
    '-af', filter,
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2',
    outputFile,
  ];
}
