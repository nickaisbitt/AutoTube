export interface RumbleEvent {
  startTime: number;
  duration: number;
  frequency: number;
  volume: number;
}

export function generateRumbleEvents(statTimestamps: number[], duration?: number): RumbleEvent[] {
  const events: RumbleEvent[] = [];

  for (const ts of statTimestamps) {
    if (duration !== undefined && ts > duration) continue;

    const frequency = 40 + Math.random() * 20;
    const eventDuration = 0.5 + Math.random() * 1.0;
    const volume = 0.08 + Math.random() * 0.07;

    events.push({
      startTime: parseFloat(ts.toFixed(3)),
      duration: parseFloat(eventDuration.toFixed(3)),
      frequency: Math.round(frequency),
      volume: parseFloat(volume.toFixed(4)),
    });
  }

  return events;
}

export function computeRumbleFilter(events: RumbleEvent[]): string {
  if (events.length === 0) return '';

  const filterParts: string[] = [];

  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    const sineLabel = `sine${i}`;
    const fadeLabel = `fade${i}`;
    const volLabel = `rumble${i}`;

    filterParts.push(
      `sine=frequency=${e.frequency}:duration=${e.duration}[${sineLabel}]`
    );

    filterParts.push(
      `[${sineLabel}]afade=t=in:st=0:d=0.1,afade=t=out:st=${(e.duration - 0.1).toFixed(3)}:d=0.1[${fadeLabel}]`
    );

    filterParts.push(
      `[${fadeLabel}]volume=${e.volume}:enable='between(t,${e.startTime.toFixed(3)},${(e.startTime + e.duration).toFixed(3)})'[${volLabel}]`
    );
  }

  const rumbleInputs = events.map((_, i) => `[rumble${i}]`).join('');
  const baseInputs = '[0:a]'.repeat(events.length + 1);
  filterParts.push(
    `${baseInputs}${rumbleInputs}amix=inputs=${events.length + 1}:duration=first[out]`
  );

  return filterParts.join(';');
}
