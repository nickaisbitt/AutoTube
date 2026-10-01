export interface AsmrTrigger {
  time: number;
  duration: number;
  frequency: number;
  volume: number;
}

export function generateWhisperTriggers(_segmentCount: number, totalDuration: number): AsmrTrigger[] {
  const triggersPerMinute = 2 + Math.random() * 2;
  const totalTriggers = Math.round((totalDuration / 60) * triggersPerMinute);
  const triggers: AsmrTrigger[] = [];

  const interval = totalDuration / (totalTriggers + 1);

  for (let i = 0; i < totalTriggers; i++) {
    const time = interval * (i + 1) + (Math.random() - 0.5) * interval * 0.3;
    const duration = 0.1 + Math.random() * 0.2;
    const frequency = 8000 + Math.random() * 4000;
    const volume = 0.02 + Math.random() * 0.03;

    triggers.push({
      time: parseFloat(time.toFixed(3)),
      duration: parseFloat(duration.toFixed(3)),
      frequency: Math.round(frequency),
      volume: parseFloat(volume.toFixed(4)),
    });
  }

  return triggers;
}

export function computeAsmrFilter(triggers: AsmrTrigger[]): string {
  if (triggers.length === 0) return '';

  const filterParts: string[] = [];

  for (let i = 0; i < triggers.length; i++) {
    const t = triggers[i];
    const noiseLabel = `noise${i}`;
    const hpLabel = `hp${i}`;
    const volLabel = `vol${i}`;

    filterParts.push(
      `anoisesrc=d=${t.duration}:c=pink:a=${t.volume}[${noiseLabel}]`
    );
    filterParts.push(
      `[${noiseLabel}]highpass=f=${t.frequency}[${hpLabel}]`
    );
    filterParts.push(
      `[${hpLabel}]volume=${t.volume}:enable='between(t,${t.time.toFixed(3)},${(t.time + t.duration).toFixed(3)})'[${volLabel}]`
    );
  }

  const mixInputs = triggers.map((_, i) => `[vol${i}]`).join('');
  const mixLabels = triggers.map(() => '[0:a]').join('');
  filterParts.push(
    `${mixLabels}${mixInputs}amix=inputs=${triggers.length + 1}:duration=first[out]`
  );

  return filterParts.join(';');
}
