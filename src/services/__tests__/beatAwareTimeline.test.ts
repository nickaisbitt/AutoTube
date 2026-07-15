import { describe, expect, it } from 'vitest';
import {
  beatAtSegmentTime,
  scoreAssetAgainstBeat,
  buildEditTimeline,
} from '../../../scripts/lib/build-edit-timeline.mjs';

describe('beat-aware edit timeline', () => {
  it('maps local time to evenly spaced beats', () => {
    const beats = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(beatAtSegmentTime(beats, 0, 30)?.id).toBe('a');
    expect(beatAtSegmentTime(beats, 15, 30)?.id).toBe('b');
    expect(beatAtSegmentTime(beats, 29, 30)?.id).toBe('c');
  });

  it('scores beat-matching assets higher than beetles', () => {
    const beat = {
      searchableSubject: 'Parent reading phone kitchen',
      narrationExcerpt: 'Parents got a midnight email about counseling notes',
      mustAvoid: ['beetle'],
    };
    const good = scoreAssetAgainstBeat(
      { alt: 'Parent reading phone at kitchen table', query: 'parent phone' },
      beat,
    );
    const bad = scoreAssetAgainstBeat(
      { alt: 'macro beetle insect', query: 'beetle' },
      beat,
    );
    expect(good).toBeGreaterThan(bad);
    expect(bad).toBeLessThan(0);
  });

  it('tags timeline entries with beat reasons when sheet present', () => {
    const project = {
      topic: 'school ransomware',
      script: [
        {
          id: 's1',
          type: 'section',
          title: 'Evidence',
          narration: 'Parents got a midnight email. Counseling notes were for sale.',
          duration: 4,
        },
      ],
      media: [
        {
          id: 'good',
          segmentId: 's1',
          type: 'video',
          url: 'https://example.com/parent.mp4',
          alt: 'Parent reading phone kitchen night',
          query: 'parent phone kitchen',
        },
        {
          id: 'bad',
          segmentId: 's1',
          type: 'video',
          url: 'https://example.com/beetle.mp4',
          alt: 'macro beetle insect',
          query: 'beetle',
        },
      ],
      visualBeatSheet: {
        topic: 'school ransomware',
        beats: [
          {
            id: 'beat-1',
            segmentId: 's1',
            searchableSubject: 'Parent reading phone kitchen',
            narrationExcerpt: 'Parents got a midnight email',
            mustAvoid: ['beetle'],
          },
        ],
      },
    };
    const tl = buildEditTimeline(project, { cutIntervalSec: 1, maxReusePerUrl: 2 });
    expect(tl.length).toBeGreaterThan(0);
    expect(tl.every((e) => String(e.reason).startsWith('beat:'))).toBe(true);
    expect(tl.filter((e) => e.assetId === 'good').length).toBeGreaterThan(0);
  });
});
