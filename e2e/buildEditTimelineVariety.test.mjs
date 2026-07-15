import { describe, it, expect } from 'vitest';
import { buildEditTimeline } from '../scripts/lib/build-edit-timeline.mjs';

describe('buildEditTimeline — anti-repetition', () => {
  it('widens cut interval when unique video pool is too small', () => {
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
    const adaptive = buildEditTimeline(project, { cutIntervalSec: 0.85, maxReusePerUrl: 1 });
    const naiveClipCount = Math.ceil(40 / 0.85);
    expect(adaptive.length).toBeLessThan(naiveClipCount);
    expect(adaptive.length).toBeGreaterThanOrEqual(16);
  });
});
