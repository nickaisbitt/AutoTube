export function generateRiserFilter(
  startTime: number,
  duration: number,
  startFreq: number = 200,
  endFreq: number = 2000,
): string {
  if (duration <= 0) return '';

  const steps = 10;
  const stepDuration = duration / steps;
  const filters: string[] = [];

  for (let i = 0; i < steps; i++) {
    const t = i / steps;
    const freq = startFreq + (endFreq - startFreq) * t * t;
    const stepStart = startTime + i * stepDuration;
    const volume = 0.3 * (i / (steps - 1));
    filters.push(
      `sine=frequency=${freq.toFixed(1)}:duration=${stepDuration.toFixed(3)},` +
      `adelay=${Math.round(stepStart * 1000)}|${Math.round(stepStart * 1000)},` +
      `volume=${volume.toFixed(3)}`
    );
  }

  const overlayInputs = filters.map((_, i) => `[r${i}]`).join('');
  const filterParts = filters.map((f, i) => `anullsrc[r${i}_src];[r${i}_src]${f}[r${i}]`);

  return filterParts.join(';') +
    `;${overlayInputs}amix=inputs=${steps}:duration=longest:normalize=0[riseout]`;
}

export function generateBassDropFilter(
  time: number,
  duration: number = 0.5,
  frequency: number = 60,
): string {
  if (duration <= 0) return '';

  const attackDuration = 0.01;
  const decayDuration = duration - attackDuration;
  const delayMs = Math.round(time * 1000);

  return (
    `sine=frequency=${frequency}:duration=${duration},` +
    `afade=t=in:st=0:d=${attackDuration},` +
    `afade=t=out:st=${attackDuration}:d=${decayDuration}:curve=exp,` +
    `volume=0.4,` +
    `adelay=${delayMs}|${delayMs}[bassout]`
  );
}

export function generateImpactSequence(
  riserStart: number,
  riserDuration: number,
): string {
  if (riserDuration <= 0) return '';

  const bassDropTime = riserStart + riserDuration;
  const riserFilter = generateRiserFilter(riserStart, riserDuration);
  const bassFilter = generateBassDropFilter(bassDropTime, 0.5, 60);

  if (!riserFilter && !bassFilter) return '';
  if (!riserFilter) return bassFilter;
  if (!bassFilter) return riserFilter;

  return `${riserFilter};${bassFilter};[riseout][bassout]amix=inputs=2:duration=longest:normalize=0[impactout]`;
}
