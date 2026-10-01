export type AmbientPreset = 'tension' | 'calm' | 'space' | 'urban' | 'nature' | 'tech';

export const AMBIENT_PRESETS: Record<AmbientPreset, { layers: { type: 'sine' | 'noise' | 'pulse'; frequency?: number; volume: number; filter?: string }[] }> = {
  tension: {
    layers: [
      { type: 'sine', frequency: 80, volume: 0.08 },
      { type: 'noise', volume: 0.03, filter: 'lowpass=f=500' },
      { type: 'pulse', frequency: 2, volume: 0.04 },
    ],
  },
  calm: {
    layers: [
      { type: 'sine', frequency: 220, volume: 0.05 },
      { type: 'sine', frequency: 330, volume: 0.04 },
      { type: 'noise', volume: 0.02, filter: 'lowpass=f=800' },
    ],
  },
  space: {
    layers: [
      { type: 'sine', frequency: 40, volume: 0.06 },
      { type: 'sine', frequency: 4000, volume: 0.02, filter: 'highpass=f=3000' },
      { type: 'pulse', frequency: 0.5, volume: 0.03 },
    ],
  },
  urban: {
    layers: [
      { type: 'noise', volume: 0.04, filter: 'bandpass=f=400:w=200' },
      { type: 'pulse', frequency: 4, volume: 0.03 },
      { type: 'sine', frequency: 60, volume: 0.05 },
    ],
  },
  nature: {
    layers: [
      { type: 'noise', volume: 0.03, filter: 'highpass=f=1000' },
      { type: 'sine', frequency: 3000, volume: 0.01 },
    ],
  },
  tech: {
    layers: [
      { type: 'pulse', frequency: 800, volume: 0.04 },
      { type: 'noise', volume: 0.02, filter: 'highpass=f=2000' },
      { type: 'sine', frequency: 50, volume: 0.05 },
    ],
  },
};

export function generateAmbientCommand(preset: AmbientPreset, durationSec: number, outputFile: string): string[] {
  const { layers } = AMBIENT_PRESETS[preset];
  const filterParts: string[] = [];
  const inputArgs: string[] = [];
  const mixLabels: string[] = [];

  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i];
    const label = `layer${i}`;

    if (layer.type === 'sine') {
      inputArgs.push('-f', 'lavfi', '-i', `sine=frequency=${layer.frequency}:duration=${durationSec}`);
      let filterStr = `volume=${layer.volume}`;
      if (layer.filter) {
        filterStr = `${layer.filter},${filterStr}`;
      }
      filterParts.push(`[${i}:a]${filterStr}[${label}]`);
    } else if (layer.type === 'noise') {
      inputArgs.push('-f', 'lavfi', '-i', `anoisesrc=d=${durationSec}:c=pink:a=1`);
      let filterStr = `volume=${layer.volume}`;
      if (layer.filter) {
        filterStr = `${layer.filter},${filterStr}`;
      }
      filterParts.push(`[${i}:a]${filterStr}[${label}]`);
    } else if (layer.type === 'pulse') {
      inputArgs.push('-f', 'lavfi', '-i', `sine=frequency=${layer.frequency}:duration=${durationSec}`);
      filterParts.push(`[${i}:a]tremolo=f=${layer.frequency}:d=0.8,volume=${layer.volume}[${label}]`);
    }

    mixLabels.push(`[${label}]`);
  }

  filterParts.push(
    `${mixLabels.join('')}amix=inputs=${layers.length}:duration=longest[out]`
  );

  const filterComplex = filterParts.join(';');

  return [
    '-y',
    ...inputArgs,
    '-filter_complex', filterComplex,
    '-map', '[out]',
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2',
    outputFile,
  ];
}

export function mixAmbientBed(narrationFile: string, ambientFile: string, outputFile: string, volume: number): string[] {
  const filterChain = [
    '[0:a]aresample=48000:async=1[narration]',
    `[1:a]aresample=48000:async=1,volume=${volume.toFixed(4)}[ambient]`,
    '[narration][ambient]amix=inputs=2:duration=first:dropout_transition=3[out]',
  ].join(';');

  return [
    '-y',
    '-i', narrationFile,
    '-i', ambientFile,
    '-filter_complex', filterChain,
    '-map', '[out]',
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2',
    outputFile,
  ];
}
