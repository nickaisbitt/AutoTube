import { spawnSync } from 'child_process';

export interface BeatGrid {
  bpm: number;
  beats: number[];
  downbeats: number[];
}

export async function estimateBeatGrid(audioFile: string): Promise<BeatGrid> {
  const result = spawnSync('ffmpeg', [
    '-y',
    '-i', audioFile,
    '-af', 'ebur128=peak=true:framelog=verbose',
    '-f', 'null',
    '/dev/null',
  ], { encoding: 'utf8', timeout: 120000 });

  const stderr = result.stderr || '';
  const lines = stderr.split('\n');
  const peaks: { time: number; level: number }[] = [];
  let currentTime = 0;

  for (const line of lines) {
    const timeMatch = line.match(/t:\s*([\d.]+)/);
    if (timeMatch) {
      currentTime = parseFloat(timeMatch[1]);
    }
    const peakMatch = line.match(/peak:\s*([-\d.]+)\s*dB/);
    if (peakMatch) {
      peaks.push({ time: currentTime, level: parseFloat(peakMatch[1]) });
    }
  }

  if (peaks.length === 0) {
    return { bpm: 120, beats: [], downbeats: [] };
  }

  const threshold = peaks.reduce((sum, p) => sum + p.level, 0) / peaks.length;
  const transients = peaks.filter(p => p.level > threshold);

  const intervals: number[] = [];
  for (let i = 1; i < transients.length; i++) {
    intervals.push(transients[i].time - transients[i - 1].time);
  }

  if (intervals.length === 0) {
    return { bpm: 120, beats: transients.map(t => t.time), downbeats: [] };
  }

  const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const bpm = Math.round(60 / avgInterval);
  const beatInterval = 60 / bpm;

  const duration = peaks[peaks.length - 1].time;
  const beats: number[] = [];
  for (let t = 0; t <= duration; t += beatInterval) {
    beats.push(parseFloat(t.toFixed(3)));
  }

  const downbeats: number[] = [];
  for (let i = 0; i < beats.length; i += 4) {
    downbeats.push(beats[i]);
  }

  return { bpm, beats, downbeats };
}

export function alignCutToBeat(cutTime: number, beatGrid: BeatGrid, tolerance: number = 0.5): number {
  let nearest = cutTime;
  let minDist = Infinity;

  for (const beat of beatGrid.beats) {
    const dist = Math.abs(beat - cutTime);
    if (dist < minDist && dist <= tolerance) {
      minDist = dist;
      nearest = beat;
    }
  }

  return nearest;
}

export function computeBeatAlignedCuts(segmentDurations: number[], beatGrid: BeatGrid): number[] {
  const cuts: number[] = [];
  let cumulative = 0;

  for (const dur of segmentDurations) {
    cumulative += dur;
    const aligned = alignCutToBeat(cumulative, beatGrid);
    cuts.push(aligned);
  }

  return cuts;
}
