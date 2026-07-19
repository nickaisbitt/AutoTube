import { describe, it, expect } from 'vitest';
import { buildEditTimeline, visualSubjectCluster } from '../scripts/lib/build-edit-timeline.mjs';

describe('buildEditTimeline — anti-repetition', () => {
  it('hard-caps reuse and lengthens cuts instead of 12× looping thin pools', () => {
    const urls = Array.from({ length: 5 }, (_, i) => `https://videos.pexels.com/video-files/${i}/${i}.mp4`);
    const project = {
      topic: 'generic investigation topic',
      script: [{ id: 's1', type: 'body', duration: 40, narration: 'story' }],
      media: urls.map((url, i) => ({
        id: `v${i}`,
        segmentId: 's1',
        type: 'video',
        url,
        alt: `person face clip ${i}`,
      })),
    };
    const tl = buildEditTimeline(project, { cutIntervalSec: 0.85, maxReusePerUrl: 1 });
    const uses = {};
    for (const e of tl) uses[e.assetId] = (uses[e.assetId] || 0) + 1;
    // HARD_MAX_REUSE_CEIL=6 — never climb to 9–12× on a thin pool.
    expect(Math.max(...Object.values(uses))).toBeLessThanOrEqual(6);
    const spans = tl.map((e) => e.endSec - e.startSec);
    // May lengthen up to MAX_BODY_CUT_THIN_SEC (2.0) when unique pool is thin.
    expect(Math.max(...spans)).toBeLessThanOrEqual(2.01);
    expect(Math.max(...tl.map((e) => e.endSec))).toBeGreaterThanOrEqual(39.5);
  });

  it('never reuses the same URL within the previous four timeline entries', () => {
    const project = {
      topic: 'generic investigation topic',
      script: [{ id: 's1', type: 'body', duration: 9, narration: 'story' }],
      media: Array.from({ length: 6 }, (_, i) => ({
        id: `v${i}`,
        segmentId: 's1',
        type: 'video',
        url: `https://videos.pexels.com/video-files/recent-${i}/recent-${i}.mp4`,
        alt: `person face clip ${i}`,
      })),
    };
    const tl = buildEditTimeline(project, { cutIntervalSec: 1, maxReusePerUrl: 2 });
    const urls = Object.fromEntries(project.media.map((asset) => [asset.id, asset.url]));
    for (let i = 0; i < tl.length; i += 1) {
      const recent = tl.slice(Math.max(0, i - 4), i).map((e) => urls[e.assetId]);
      expect(recent).not.toContain(urls[tl[i].assetId]);
    }
  });

  it('keeps cold/eval hard URL reuse at four when the pool is broad', () => {
    const prior = process.env.AUTOTUBE_EVAL_COLD;
    process.env.AUTOTUBE_EVAL_COLD = '1';
    try {
      const project = {
        topic: 'generic investigation topic',
        script: [{ id: 's1', type: 'body', duration: 120, narration: 'story' }],
        media: Array.from({ length: 20 }, (_, i) => ({
          id: `v${i}`,
          segmentId: 's1',
          type: 'video',
          url: `https://videos.pexels.com/video-files/cold-${i}/cold-${i}.mp4`,
          alt: `person face clip ${i}`,
        })),
      };
      const tl = buildEditTimeline(project, { cutIntervalSec: 1, maxReusePerUrl: 1 });
      const uses = {};
      for (const e of tl) uses[e.assetId] = (uses[e.assetId] || 0) + 1;
      expect(Math.max(...Object.values(uses))).toBeLessThanOrEqual(4);
      expect(Math.max(...tl.map((e) => e.endSec))).toBeGreaterThanOrEqual(119.5);
    } finally {
      if (prior === undefined) delete process.env.AUTOTUBE_EVAL_COLD;
      else process.env.AUTOTUBE_EVAL_COLD = prior;
    }
  });

  it('hard-bans consecutive masked-human subject clusters', () => {
    const project = {
      topic: 'airline mask policy',
      script: [{ id: 's1', type: 'body', duration: 6, narration: 'story' }],
      media: [
        {
          id: 'masked-1',
          segmentId: 's1',
          type: 'video',
          url: 'https://videos.pexels.com/video-files/masked-1/masked-1.mp4',
          alt: 'masked couple passenger close up face',
        },
        {
          id: 'masked-2',
          segmentId: 's1',
          type: 'video',
          url: 'https://videos.pexels.com/video-files/masked-2/masked-2.mp4',
          alt: 'masked couple passenger face reaction',
        },
        {
          id: 'masked-3',
          segmentId: 's1',
          type: 'video',
          url: 'https://videos.pexels.com/video-files/masked-3/masked-3.mp4',
          alt: 'masked people passenger face close up',
        },
        {
          id: 'pilot',
          segmentId: 's1',
          type: 'video',
          url: 'https://videos.pexels.com/video-files/pilot/pilot.mp4',
          alt: 'pilot face in cockpit',
        },
        {
          id: 'cabin',
          segmentId: 's1',
          type: 'video',
          url: 'https://videos.pexels.com/video-files/cabin/cabin.mp4',
          alt: 'bright cabin interior aisle',
        },
        {
          id: 'aircraft',
          segmentId: 's1',
          type: 'video',
          url: 'https://videos.pexels.com/video-files/aircraft/aircraft.mp4',
          alt: 'airport aircraft boarding gate',
        },
      ],
    };
    const tl = buildEditTimeline(project, { cutIntervalSec: 1, maxReusePerUrl: 1 });
    const mediaById = Object.fromEntries(project.media.map((asset) => [asset.id, asset]));
    for (let i = 1; i < tl.length; i += 1) {
      const prevCluster = visualSubjectCluster(mediaById[tl[i - 1].assetId]);
      const cluster = visualSubjectCluster(mediaById[tl[i].assetId]);
      expect([prevCluster, cluster]).not.toEqual(['masked-human', 'masked-human']);
    }
  });

  it('uses only face or bright-cabin assets in the first three seconds', () => {
    const project = {
      topic: 'airline safety briefing',
      script: [{ id: 'intro', type: 'intro', duration: 5, narration: 'story' }],
      media: [
        {
          id: 'runway',
          segmentId: 'intro',
          type: 'video',
          url: 'https://videos.pexels.com/video-files/runway/runway.mp4',
          alt: 'distant plane on runway behind fence',
        },
        {
          id: 'back-head',
          segmentId: 'intro',
          type: 'video',
          url: 'https://videos.pexels.com/video-files/back-head/back-head.mp4',
          alt: 'passenger back of head looking through airplane window',
        },
        {
          id: 'pilot-face',
          segmentId: 'intro',
          type: 'video',
          url: 'https://videos.pexels.com/video-files/pilot-face/pilot-face.mp4',
          alt: 'pilot face close up cockpit',
        },
        {
          id: 'passenger-face',
          segmentId: 'intro',
          type: 'video',
          url: 'https://videos.pexels.com/video-files/passenger-face/passenger-face.mp4',
          alt: 'worried passenger face close up',
        },
        {
          id: 'bright-cabin',
          segmentId: 'intro',
          type: 'video',
          url: 'https://videos.pexels.com/video-files/bright-cabin/bright-cabin.mp4',
          alt: 'bright cabin interior aisle daylight',
        },
      ],
    };
    const tl = buildEditTimeline(project, { cutIntervalSec: 1, maxReusePerUrl: 1 });
    const leadIds = tl.filter((e) => e.startSec < 3).map((e) => e.assetId);
    expect(leadIds.length).toBeGreaterThan(0);
    expect(leadIds).not.toContain('runway');
    expect(leadIds).not.toContain('back-head');
    expect(new Set(leadIds)).toEqual(new Set(['pilot-face', 'passenger-face', 'bright-cabin']));
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
          alt: `person face seg1 ${i}`,
        })),
        ...Array.from({ length: 6 }, (_, i) => ({
          id: `b${i}`,
          segmentId: 's2',
          type: 'video',
          url: `https://videos.pexels.com/video-files/b${i}/b${i}.mp4`,
          alt: `person face seg2 ${i}`,
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
