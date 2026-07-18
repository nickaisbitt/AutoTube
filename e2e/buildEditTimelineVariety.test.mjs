import { describe, it, expect } from 'vitest';
import { buildEditTimeline } from '../scripts/lib/build-edit-timeline.mjs';

describe('buildEditTimeline — anti-repetition', () => {
  it('keeps requested cut interval instead of silently widening to 1.25s', () => {
    const urls = Array.from({ length: 4 }, (_, i) => `https://videos.pexels.com/video-files/${i}/${i}.mp4`);
    const project = {
      topic: 'generic investigation topic',
      script: [{ id: 's1', type: 'body', duration: 40, narration: 'story' }],
      media: urls.map((url, i) => ({
        id: `v${i}`,
        segmentId: 's1',
        type: 'video',
        url,
        alt: `clip ${i}`,
      })),
    };
    const tl = buildEditTimeline(project, { cutIntervalSec: 0.85, maxReusePerUrl: 1 });
    const naiveClipCount = Math.ceil(40 / 0.85);
    // Dense cuts preserved even when unique pool is thin (reuse may bump ≤2).
    expect(tl.length).toBeGreaterThanOrEqual(naiveClipCount - 2);
    const spans = tl.map((e) => e.endSec - e.startSec);
    expect(Math.max(...spans)).toBeLessThanOrEqual(0.9);
  });

  it('prefers unused global URLs before over-reusing a single clip', () => {
    const project = {
      topic: 'generic investigation topic',
      script: [
        { id: 's1', type: 'body', duration: 6, narration: 'story' },
        { id: 's2', type: 'body', duration: 6, narration: 'more' },
      ],
      media: [
        ...Array.from({ length: 3 }, (_, i) => ({
          id: `a${i}`,
          segmentId: 's1',
          type: 'video',
          url: `https://videos.pexels.com/video-files/a${i}/a${i}.mp4`,
          alt: `seg1 ${i}`,
        })),
        ...Array.from({ length: 6 }, (_, i) => ({
          id: `b${i}`,
          segmentId: 's2',
          type: 'video',
          url: `https://videos.pexels.com/video-files/b${i}/b${i}.mp4`,
          alt: `seg2 ${i}`,
        })),
      ],
    };
    const tl = buildEditTimeline(project, { cutIntervalSec: 0.7, maxReusePerUrl: 1 });
    const s1 = tl.filter((e) => e.segmentId === 's1');
    const ids = s1.map((e) => e.assetId);
    // With only 3 local videos for ~8.5 slots, body should borrow from s2 before looping a0.
    expect(new Set(ids).size).toBeGreaterThanOrEqual(4);
  });
});
