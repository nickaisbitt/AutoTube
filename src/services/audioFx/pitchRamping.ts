export interface PitchRamp {
  startRate: number;
  endRate: number;
  startTime: number;
  endTime: number;
}

export function createTensionRamp(startTime: number, endTime: number, intensity?: number): PitchRamp {
  const endRate = intensity && intensity > 0.08 ? 1.1 : 1.05;
  return {
    startRate: 1.0,
    endRate,
    startTime,
    endTime,
  };
}

export function computePitchFilter(ramp: PitchRamp): string {
  const duration = ramp.endTime - ramp.startTime;
  const steps = 20;
  const stepDur = duration / steps;
  const filters: string[] = [];

  for (let i = 0; i < steps; i++) {
    const progress = i / (steps - 1);
    const rate = ramp.startRate + (ramp.endRate - ramp.startRate) * progress;
    const segStart = ramp.startTime + i * stepDur;
    const segEnd = segStart + stepDur;
    const sampleRate = Math.round(48000 * rate);
    filters.push(
      `asetrate=${sampleRate}:enable='between(t,${segStart.toFixed(3)},${segEnd.toFixed(3)})',aresample=48000:enable='between(t,${segStart.toFixed(3)},${segEnd.toFixed(3)})'`
    );
  }

  return filters.join(',');
}

export function createReleaseRamp(startTime: number, duration: number = 2.0): PitchRamp {
  return {
    startRate: 1.05,
    endRate: 1.0,
    startTime,
    endTime: startTime + duration,
  };
}
