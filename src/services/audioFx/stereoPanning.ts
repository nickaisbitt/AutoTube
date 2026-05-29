export type PanDirection = 'left-to-right' | 'right-to-left' | 'center' | 'sweep';

export function computePanFilter(direction: PanDirection, durationSec: number, startTime?: number): string {
  const st = startTime ?? 0;

  switch (direction) {
    case 'left-to-right': {
      const steps = 10;
      const stepDur = durationSec / steps;
      const filters: string[] = [];
      for (let i = 0; i < steps; i++) {
        const progress = i / (steps - 1);
        const leftGain = (1 - progress).toFixed(3);
        const rightGain = progress.toFixed(3);
        const segStart = st + i * stepDur;
        const segEnd = segStart + stepDur;
        filters.push(
          `pan=stereo|c0=${leftGain}*c0+${rightGain}*c1|c1=${rightGain}*c0+${leftGain}*c1:enable='between(t,${segStart.toFixed(3)},${segEnd.toFixed(3)})'`
        );
      }
      return filters.join(',');
    }
    case 'right-to-left': {
      const steps = 10;
      const stepDur = durationSec / steps;
      const filters: string[] = [];
      for (let i = 0; i < steps; i++) {
        const progress = i / (steps - 1);
        const leftGain = progress.toFixed(3);
        const rightGain = (1 - progress).toFixed(3);
        const segStart = st + i * stepDur;
        const segEnd = segStart + stepDur;
        filters.push(
          `pan=stereo|c0=${leftGain}*c0+${rightGain}*c1|c1=${rightGain}*c0+${leftGain}*c1:enable='between(t,${segStart.toFixed(3)},${segEnd.toFixed(3)})'`
        );
      }
      return filters.join(',');
    }
    case 'center':
      return '';
    case 'sweep': {
      const halfPeriod = durationSec / 2;
      const leftExpr = `0.5+0.5*sin(2*PI*t/${(halfPeriod * 2).toFixed(3)})`;
      const rightExpr = `0.5-0.5*sin(2*PI*t/${(halfPeriod * 2).toFixed(3)})`;
      const enable = startTime !== undefined
        ? `:enable='between(t,${st.toFixed(3)},${(st + durationSec).toFixed(3)})'`
        : '';
      return `pan=stereo|c0=${leftExpr}*c0|c1=${rightExpr}*c1${enable}`;
    }
  }
}

export function applyStereoPan(inputFile: string, outputFile: string, direction: PanDirection, durationSec: number): string[] {
  const filter = computePanFilter(direction, durationSec);
  if (!filter) {
    return ['-y', '-i', inputFile, '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', outputFile];
  }
  return [
    '-y',
    '-i', inputFile,
    '-af', filter,
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2',
    outputFile,
  ];
}
