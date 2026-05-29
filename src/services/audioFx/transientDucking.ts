export interface DuckEvent {
  time: number;
  duration: number;
  depth: number;
}

const IMPACT_WORDS = new Set([
  'boom', 'crash', 'slam', 'hit', 'drop', 'blast', 'strike', 'explode', 'shatter', 'break',
]);

export function generateTransientDucks(wordTimestamps: { word: string; start: number; end: number }[]): DuckEvent[] {
  const events: DuckEvent[] = [];

  for (const wt of wordTimestamps) {
    const normalized = wt.word.toLowerCase().replace(/[^a-z]/g, '');
    if (IMPACT_WORDS.has(normalized)) {
      const duration = 0.1 + Math.random() * 0.1;
      const depth = 0.25 + Math.random() * 0.25;
      events.push({
        time: wt.start,
        duration: parseFloat(duration.toFixed(3)),
        depth: parseFloat(depth.toFixed(4)),
      });
    }
  }

  return events;
}

export function computeTransientDuckFilter(events: DuckEvent[]): string {
  if (events.length === 0) return '';

  const filters: string[] = [];

  for (const e of events) {
    const endTime = e.time + e.duration;
    filters.push(
      `volume=${e.depth}:enable='between(t,${e.time.toFixed(3)},${endTime.toFixed(3)})'`
    );
  }

  return filters.join(',');
}
