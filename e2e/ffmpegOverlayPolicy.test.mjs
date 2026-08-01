import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildImpactBeatsForTopic } from '../scripts/lib/impactBeatsByTopic.mjs';
import { promoteIntroFaceVideo } from '../scripts/lib/patch-project-for-loop.mjs';
import { overlayTextPolicy, repairMergedCaptionText } from '../deploy/server-render/ffmpegOverlays.mjs';
import { narrationSpeechIntervals } from '../deploy/server-render/narration.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('ffmpeg overlay policy — less text spam', () => {
  it('skips impact beats when karaoke captions are on', () => {
    const src = readFileSync(join(root, 'deploy/server-render/ffmpegOverlays.mjs'), 'utf8');
    expect(src).toContain('karaokeRequested');
    expect(src).not.toMatch(/Rotate to an early impact beat/);
  });

  it('overlayTextPolicy skips impact beats when karaoke requested but timestamps missing', () => {
    const project = { exportSettings: { karaokeCaptions: true } };
    const empty = new Map();
    const policy = overlayTextPolicy(project, empty);
    expect(policy.karaokeRequested).toBe(true);
    expect(policy.karaokeActive).toBe(false);
    expect(policy.burnImpactBeats).toBe(false);
  });

  it('overlayTextPolicy burns impact beats only in hook-only mode', () => {
    const project = { exportSettings: { karaokeCaptions: false } };
    const policy = overlayTextPolicy(project, new Map());
    expect(policy.burnImpactBeats).toBe(true);
  });

  it('generic impact beats use readable phrases (not keyword mashups)', () => {
    const beats = buildImpactBeatsForTopic('obscure widget factory scandal cover up');
    expect(beats[0]).toMatch(/EXPOSED/);
    expect(beats.join(' ')).not.toMatch(/WHY WIDGET|FOLLOW THE WIDGET|WIDGET HIDING/);
  });

  it('repairs merged caption words before ASS text is burned', () => {
    expect(repairMergedCaptionText('CABINKEEP')).toBe('CABIN KEEP');
    expect(repairMergedCaptionText('cabinKeep APIResponse 2026Update')).toBe('cabin Keep API Response 2026 Update');
  });
});

describe('caption offsets from the narration audio timeline', () => {
  it('includes intro silence and inter-segment gap/breath pads in speech offsets', () => {
    const audioFiles = [
      { file: 'silence-intro.wav', duration: 3.5, kind: 'intro-silence' },
      { file: 'narration-0.wav', duration: 10, kind: 'narration', segmentIndex: 0, subtitleFile: 'narration-0.vtt' },
      { file: 'breath-0.wav', duration: 0.25, kind: 'breath', segmentIndex: 0 },
      { file: 'silence-0.wav', duration: 0.25, kind: 'gap', segmentIndex: 0 },
      { file: 'narration-1.wav', duration: 8, kind: 'narration', segmentIndex: 1, subtitleFile: null },
      { file: 'silence-1.wav', duration: 0.25, kind: 'gap', segmentIndex: 1 },
      { file: 'silence-end.wav', duration: 4, kind: 'end-silence' },
    ];
    const intervals = narrationSpeechIntervals(audioFiles);
    expect(intervals.get(0)).toEqual({ start: 3.5, end: 13.5 });
    // Segment 1 speech starts after intro + narration 0 + breath + gap (NOT just script durations).
    expect(intervals.get(1).start).toBeCloseTo(14.0, 5);
    expect(intervals.get(1).end).toBeCloseTo(22.0, 5);
  });

  it('supports untagged legacy entries via the subtitleFile-key heuristic', () => {
    const audioFiles = [
      { file: 'silence-intro.wav', duration: 3.5 },
      { file: 'silence-0.wav', duration: 0.25 },
      { file: 'narration-0.wav', duration: 10, subtitleFile: 'narration-0.vtt' },
    ];
    const intervals = narrationSpeechIntervals(audioFiles);
    expect(intervals.get(0)).toEqual({ start: 3.75, end: 13.75 });
  });
});

describe('promoteIntroFaceVideo', () => {
  it('moves the highest-scoring face video onto the intro segment', () => {
    const project = {
      script: [
        { id: 'intro', type: 'intro', duration: 8 },
        { id: 'body', type: 'body', duration: 20 },
      ],
      media: [
        { id: 'a', segmentId: 'body', type: 'video', url: 'https://x/a.mp4', alt: 'office skyline' },
        { id: 'b', segmentId: 'body', type: 'video', url: 'https://x/b.mp4', alt: 'worried person close up face' },
      ],
    };
    promoteIntroFaceVideo(project);
    expect(project.media.find((m) => m.id === 'b')?.segmentId).toBe('intro');
  });
});
