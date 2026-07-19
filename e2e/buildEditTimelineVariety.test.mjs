import { describe, it, expect } from 'vitest';
import { buildEditTimeline } from '../scripts/lib/build-edit-timeline.mjs';

describe('buildEditTimeline — anti-repetition', () => {
  it('hard-caps reuse and lengthens cuts instead of 12× looping thin pools', () => {
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
    const uses = {};
    for (const e of tl) uses[e.assetId] = (uses[e.assetId] || 0) + 1;
    // HARD_MAX_REUSE_CEIL=6 — never climb to 9–12× on a thin pool.
    expect(Math.max(...Object.values(uses))).toBeLessThanOrEqual(6);
    const spans = tl.map((e) => e.endSec - e.startSec);
    // May lengthen up to MAX_BODY_CUT_SEC (1.25) when unique pool is thin.
    expect(Math.max(...spans)).toBeLessThanOrEqual(1.26);
    expect(Math.max(...tl.map((e) => e.endSec))).toBeGreaterThanOrEqual(39.5);
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
