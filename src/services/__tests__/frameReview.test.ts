import { describe, expect, it } from 'vitest';
import {
  heuristicFlags,
  buildTimelineAssetMap,
  assetAtTime,
} from '../../../scripts/lib/frame-review.mjs';

describe('frame-review heuristics', () => {
  it('flags adult CDN URLs as critical nsfw_url', () => {
    const flags = heuristicFlags({
      url: 'https://ei-ph.rdtcdn.com/videos/202401/09/446181321/original/0.jpg',
      query: 'The Maintenance Log Game',
      source: 'Search (volume top-up)',
      type: 'image',
    });
    expect(flags.some((f) => f.code === 'nsfw_url' && f.severity === 'critical')).toBe(true);
    expect(flags.some((f) => f.code === 'volume_still')).toBe(true);
  });

  it('flags niagara / discogs style hosts as offtopic', () => {
    const flags = heuristicFlags({
      url: 'https://cdn.audleytravel.com/4195/2999/79/1324810-niagara-falls-ontario.jpg',
      source: 'Search (volume top-up)',
      type: 'image',
    });
    expect(flags.some((f) => f.code === 'offtopic_url')).toBe(true);
  });

  it('maps segment-local timeline to global time', () => {
    const project = {
      script: [
        { id: 'a', duration: 10, title: 'Intro' },
        { id: 'b', duration: 10, title: 'Body' },
      ],
      media: [
        { id: 'm1', type: 'video', url: 'https://cdn.example/hangar.mp4', query: 'hangar aircraft' },
        { id: 'm2', type: 'image', url: 'https://ei-ph.rdtcdn.com/x.jpg', query: 'pressure', source: 'Search (volume top-up)' },
      ],
      editTimeline: [
        { segmentId: 'a', startSec: 0, endSec: 5, assetId: 'm1' },
        { segmentId: 'b', startSec: 0, endSec: 5, assetId: 'm2' },
      ],
    };
    const map = buildTimelineAssetMap(project);
    expect(assetAtTime(map, 2)?.assetId).toBe('m1');
    expect(assetAtTime(map, 12)?.assetId).toBe('m2');
    expect(assetAtTime(map, 12)?.url).toMatch(/rdtcdn/);
  });
});
