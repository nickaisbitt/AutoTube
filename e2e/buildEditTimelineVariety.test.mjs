import { describe, it, expect } from 'vitest';
import {
  buildEditTimeline,
  introFaceTier,
  isPassiveDeskIntroVisual,
  visualSubjectCluster,
} from '../scripts/lib/build-edit-timeline.mjs';

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

  it('caps airline URL reuse at three and lengthens cuts before reusing more', () => {
    const project = {
      topic: 'airline cabin pressure safety cover-up',
      script: [{ id: 's1', type: 'body', duration: 40, narration: 'story' }],
      media: Array.from({ length: 8 }, (_, i) => ({
        id: `airline-v${i}`,
        segmentId: 's1',
        type: 'video',
        url: `https://videos.pexels.com/video-files/airline-${i}/airline-${i}.mp4`,
        alt: i % 2 === 0 ? `passenger face cabin clip ${i}` : `pilot cockpit airline clip ${i}`,
      })),
    };
    const tl = buildEditTimeline(project, { cutIntervalSec: 1, maxReusePerUrl: 1 });
    const uses = {};
    for (const e of tl) uses[e.assetId] = (uses[e.assetId] || 0) + 1;
    expect(Math.max(...Object.values(uses))).toBeLessThanOrEqual(3);
    expect(Math.max(...tl.map((e) => e.endSec - e.startSec))).toBeGreaterThan(1);
    expect(Math.max(...tl.map((e) => e.endSec))).toBeGreaterThanOrEqual(39.5);
  });

  it('caps cold/eval airline URL reuse at two when the video pool is broad', () => {
    const prior = process.env.AUTOTUBE_EVAL_COLD;
    process.env.AUTOTUBE_EVAL_COLD = '1';
    try {
      const project = {
        topic: 'airline cabin pressure safety cover-up',
        script: [{ id: 's1', type: 'body', duration: 100, narration: 'story' }],
        media: Array.from({ length: 20 }, (_, i) => ({
          id: `cold-airline-v${i}`,
          segmentId: 's1',
          type: 'video',
          url: `https://videos.pexels.com/video-files/cold-airline-${i}/cold-airline-${i}.mp4`,
          alt: i % 2 === 0 ? `passenger face cabin clip ${i}` : `pilot cockpit airline clip ${i}`,
        })),
      };
      const tl = buildEditTimeline(project, { cutIntervalSec: 1, maxReusePerUrl: 1 });
      const uses = {};
      for (const e of tl) uses[e.assetId] = (uses[e.assetId] || 0) + 1;
      expect(Math.max(...Object.values(uses))).toBeLessThanOrEqual(2);
      expect(Math.max(...tl.map((e) => e.endSec))).toBeGreaterThanOrEqual(99.5);
    } finally {
      if (prior === undefined) delete process.env.AUTOTUBE_EVAL_COLD;
      else process.env.AUTOTUBE_EVAL_COLD = prior;
    }
  });

  it('limits airline paperwork, mail, document, and financial cluster family to one global use', () => {
    const project = {
      topic: 'airline cabin pressure safety cover-up',
      script: [{ id: 's1', type: 'body', duration: 12, narration: 'story' }],
      media: [
        {
          id: 'mail-1',
          segmentId: 's1',
          type: 'video',
          url: 'https://videos.pexels.com/video-files/mail-1/mail-1.mp4',
          alt: 'US Mail mailbox with letters',
        },
        {
          id: 'mail-2',
          segmentId: 's1',
          type: 'video',
          url: 'https://videos.pexels.com/video-files/mail-2/mail-2.mp4',
          alt: 'postal mailroom envelopes',
        },
        {
          id: 'paperwork-1',
          segmentId: 's1',
          type: 'video',
          url: 'https://videos.pexels.com/video-files/paperwork-1/paperwork-1.mp4',
          alt: 'paperwork forms on clipboard',
        },
        {
          id: 'paperwork-2',
          segmentId: 's1',
          type: 'video',
          url: 'https://videos.pexels.com/video-files/paperwork-2/paperwork-2.mp4',
          alt: 'stack of papers and file folder',
        },
        {
          id: 'document-1',
          segmentId: 's1',
          type: 'video',
          url: 'https://videos.pexels.com/video-files/document-1/document-1.mp4',
          alt: 'documents and records on desk',
        },
        {
          id: 'document-2',
          segmentId: 's1',
          type: 'video',
          url: 'https://videos.pexels.com/video-files/document-2/document-2.mp4',
          alt: 'contract case file close up',
        },
        {
          id: 'financial-1',
          segmentId: 's1',
          type: 'video',
          url: 'https://videos.pexels.com/video-files/financial-1/financial-1.mp4',
          alt: 'financial bank statement spreadsheet',
        },
        {
          id: 'financial-2',
          segmentId: 's1',
          type: 'video',
          url: 'https://videos.pexels.com/video-files/financial-2/financial-2.mp4',
          alt: 'invoice receipt tax form money',
        },
      ],
    };
    const tl = buildEditTimeline(project, { cutIntervalSec: 1, maxReusePerUrl: 3 });
    const mediaById = Object.fromEntries(project.media.map((asset) => [asset.id, asset]));
    const clusterUses = {};
    for (const entry of tl) {
      const cluster = visualSubjectCluster(mediaById[entry.assetId]);
      clusterUses[cluster] = (clusterUses[cluster] || 0) + 1;
    }
    const limitedClusterUses = ['paperwork', 'mail', 'document', 'financial']
      .reduce((sum, cluster) => sum + (clusterUses[cluster] || 0), 0);
    expect(limitedClusterUses).toBeLessThanOrEqual(1);
    expect(Math.max(...tl.map((e) => e.endSec))).toBeGreaterThanOrEqual(11.5);
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
          id: 'mailbox-face',
          segmentId: 'intro',
          type: 'video',
          url: 'https://videos.pexels.com/video-files/mailbox-face/mailbox-face.mp4',
          alt: 'person face beside US Mail mailbox',
        },
        {
          id: 'paperwork',
          segmentId: 'intro',
          type: 'video',
          url: 'https://videos.pexels.com/video-files/paperwork/paperwork.mp4',
          alt: 'paperwork documents and financial forms',
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
    expect(leadIds).not.toContain('mailbox-face');
    expect(leadIds).not.toContain('paperwork');
    expect(leadIds).not.toContain('back-head');
    expect(new Set(leadIds)).toEqual(new Set(['pilot-face', 'passenger-face', 'bright-cabin']));
  });

  it('classifies passive desk stock and readable-face tiers', () => {
    expect(isPassiveDeskIntroVisual({ alt: 'hands shuffling paperwork on desk' })).toBe(true);
    expect(isPassiveDeskIntroVisual({ alt: 'hands typing on a keyboard close up' })).toBe(true);
    // A readable face holding the paperwork is a story beat, not passive desk.
    expect(isPassiveDeskIntroVisual({ alt: 'worried tenant face holding eviction paperwork' })).toBe(false);
    expect(isPassiveDeskIntroVisual({ alt: 'bright cabin interior aisle daylight' })).toBe(false);
    expect(introFaceTier({ alt: 'worried passenger face close up airplane cabin' }, { airline: true })).toBe(2);
    expect(introFaceTier({ alt: 'worried woman face close up' }, { airline: true })).toBe(1);
    expect(introFaceTier({ alt: 'worried tenant couple face close up apartment' }, { housing: true })).toBe(2);
    expect(introFaceTier({ alt: 'bright cabin interior aisle daylight' }, { airline: true })).toBe(0);
  });

  it('airline intro leads topical face, then any face, never passive paperwork', () => {
    const project = {
      topic: 'airline cabin pressure safety cover-up',
      script: [{ id: 'intro', type: 'intro', duration: 5, narration: 'cabin pressure story' }],
      media: [
        {
          id: 'passive-paperwork',
          segmentId: 'intro',
          type: 'video',
          url: 'https://videos.pexels.com/video-files/passive-paperwork/passive-paperwork.mp4',
          alt: 'hands shuffling paperwork on desk',
        },
        {
          id: 'bright-cabin',
          segmentId: 'intro',
          type: 'video',
          url: 'https://videos.pexels.com/video-files/bright-cabin/bright-cabin.mp4',
          alt: 'bright cabin interior aisle daylight',
        },
        {
          id: 'generic-face',
          segmentId: 'intro',
          type: 'video',
          url: 'https://videos.pexels.com/video-files/generic-face/generic-face.mp4',
          alt: 'worried woman face close up',
        },
        {
          id: 'topical-face',
          segmentId: 'intro',
          type: 'video',
          url: 'https://videos.pexels.com/video-files/topical-face/topical-face.mp4',
          alt: 'worried passenger face close up airplane cabin',
        },
      ],
    };
    const tl = buildEditTimeline(project, { cutIntervalSec: 1, maxReusePerUrl: 1 });
    const leadIds = tl.filter((e) => e.startSec < 3).map((e) => e.assetId);
    expect(tl[0].assetId).toBe('topical-face');
    expect(tl[1].assetId).toBe('generic-face');
    expect(leadIds).not.toContain('passive-paperwork');
    for (const id of leadIds) {
      expect(['topical-face', 'generic-face', 'bright-cabin']).toContain(id);
    }
  });

  it('housing intro leads a readable tenant face, never passive paperwork or beetles', () => {
    const project = {
      topic: 'How landlords use AI to evict tenants faster',
      script: [{ id: 'intro', type: 'intro', duration: 5, narration: 'landlords evict tenants with AI' }],
      media: [
        {
          id: 'desk-paperwork',
          segmentId: 'intro',
          type: 'video',
          url: 'https://videos.pexels.com/video-files/desk-paperwork/desk-paperwork.mp4',
          alt: 'hands signing eviction paperwork on desk',
        },
        {
          id: 'apartment-ext',
          segmentId: 'intro',
          type: 'video',
          url: 'https://videos.pexels.com/video-files/apartment-ext/apartment-ext.mp4',
          alt: 'apartment building exterior daylight',
        },
        {
          id: 'beetle',
          segmentId: 'intro',
          type: 'video',
          url: 'https://videos.pexels.com/video-files/beetle/beetle.mp4',
          alt: 'macro beetle insect crawling',
        },
        {
          id: 'generic-face',
          segmentId: 'intro',
          type: 'video',
          url: 'https://videos.pexels.com/video-files/generic-face/generic-face.mp4',
          alt: 'shocked person face portrait close up',
        },
        {
          id: 'tenant-face',
          segmentId: 'intro',
          type: 'video',
          url: 'https://videos.pexels.com/video-files/tenant-face/tenant-face.mp4',
          alt: 'worried tenant couple face close up apartment',
        },
      ],
    };
    const tl = buildEditTimeline(project, { cutIntervalSec: 1, maxReusePerUrl: 1 });
    const leadIds = tl.filter((e) => e.startSec < 3).map((e) => e.assetId);
    expect(tl[0].assetId).toBe('tenant-face');
    expect(leadIds).not.toContain('desk-paperwork');
    expect(leadIds).not.toContain('apartment-ext');
    // Banned subjects stay banned everywhere, not just in the lead window.
    expect(tl.map((e) => e.assetId)).not.toContain('beetle');
  });

  it('still covers a housing intro when passive paperwork is the only asset', () => {
    const project = {
      topic: 'How landlords use AI to evict tenants faster',
      script: [{ id: 'intro', type: 'intro', duration: 5, narration: 'eviction story' }],
      media: [
        {
          id: 'only-paperwork',
          segmentId: 'intro',
          type: 'video',
          url: 'https://videos.pexels.com/video-files/only-paperwork/only-paperwork.mp4',
          alt: 'hands shuffling eviction paperwork forms on desk',
        },
      ],
    };
    const tl = buildEditTimeline(project, { cutIntervalSec: 1, maxReusePerUrl: 1 });
    expect(tl.length).toBeGreaterThan(0);
    expect(tl.every((e) => e.assetId === 'only-paperwork')).toBe(true);
    expect(Math.max(...tl.map((e) => e.endSec))).toBeGreaterThanOrEqual(4.5);
  });

  it('opens an airline intro on a face, not an empty cabin or a carrier', () => {
    const project = {
      topic: 'How a regional airline hid recurring cabin-pressure failures',
      script: [{ id: 'intro', type: 'intro', duration: 5, narration: 'cabin pressure failures' }],
      media: [
        {
          id: 'carrier',
          segmentId: 'intro',
          type: 'video',
          url: 'https://videos.pexels.com/video-files/carrier/carrier.mp4',
          alt: 'aircraft carrier flight deck navy jets launching',
        },
        {
          id: 'empty-cabin',
          segmentId: 'intro',
          type: 'video',
          url: 'https://videos.pexels.com/video-files/empty-cabin/empty-cabin.mp4',
          alt: 'bright cabin interior aisle daylight empty seats',
        },
        {
          id: 'passenger-face',
          segmentId: 'intro',
          type: 'video',
          url: 'https://videos.pexels.com/video-files/passenger-face/passenger-face.mp4',
          alt: 'worried passenger face close up airplane cabin',
        },
      ],
    };
    const tl = buildEditTimeline(project, { cutIntervalSec: 1, maxReusePerUrl: 1 });
    expect(tl[0].assetId).toBe('passenger-face');
    expect(tl.filter((e) => e.startSec < 3).map((e) => e.assetId)).not.toContain('carrier');
  });

  it('uses at least three unique URLs for a 12s body with four videos', () => {
    const project = {
      topic: 'generic investigation topic',
      script: [{ id: 's1', type: 'body', duration: 12, narration: 'story' }],
      media: Array.from({ length: 4 }, (_, i) => ({
        id: `v${i}`,
        segmentId: 's1',
        type: 'video',
        url: `https://videos.pexels.com/video-files/b3-variety-${i}/b3-variety-${i}.mp4`,
        alt: `person face clip ${i}`,
      })),
    };
    const tl = buildEditTimeline(project, { cutIntervalSec: 1, maxReusePerUrl: 1 });
    const uniqueIds = new Set(tl.map((e) => e.assetId));
    expect(uniqueIds.size).toBeGreaterThanOrEqual(3);
    const spans = tl.map((e) => e.endSec - e.startSec);
    expect(Math.max(...spans)).toBeLessThanOrEqual(2.51);
    expect(Math.max(...tl.map((e) => e.endSec))).toBeGreaterThanOrEqual(11.5);
  });

  it('caps body hold time and avoids two-clip ping-pong when three or more URLs are usable', () => {
    const project = {
      topic: 'generic investigation topic',
      script: [{ id: 's1', type: 'body', duration: 12, narration: 'story' }],
      media: [
        {
          id: 'v0',
          segmentId: 's1',
          type: 'video',
          url: 'https://videos.pexels.com/video-files/ping-0/ping-0.mp4',
          alt: 'person face worried close up',
        },
        {
          id: 'v1',
          segmentId: 's1',
          type: 'video',
          url: 'https://videos.pexels.com/video-files/ping-1/ping-1.mp4',
          alt: 'person face shocked reaction',
        },
        {
          id: 'v2',
          segmentId: 's1',
          type: 'video',
          url: 'https://videos.pexels.com/video-files/ping-2/ping-2.mp4',
          alt: 'couple family worried face portrait',
        },
        {
          id: 'office',
          segmentId: 's1',
          type: 'video',
          url: 'https://videos.pexels.com/video-files/ping-office/ping-office.mp4',
          alt: 'office conference room corporate',
        },
      ],
    };
    const tl = buildEditTimeline(project, { cutIntervalSec: 1, maxReusePerUrl: 1 });
    const ids = tl.map((e) => e.assetId);
    expect(new Set(ids).size).toBeGreaterThanOrEqual(3);
    expect(Math.max(...tl.map((e) => e.endSec - e.startSec))).toBeLessThanOrEqual(2.51);
    const usableIds = new Set(['v0', 'v1', 'v2']);
    const usableOnly = ids.filter((id) => usableIds.has(id));
    if (usableOnly.length >= 4) {
      expect(new Set(usableOnly).size).toBeGreaterThanOrEqual(3);
    }
  });

  it('breaks two-clip ping-pong across body cuts when a third URL exists anywhere in the project', () => {
    // The third URL lives in another segment: the capped look-back window
    // shrinks to 1 with exactly 3 unique URLs, so without a dedicated guard
    // the body ping-pongs A B A B and never borrows the third clip.
    const project = {
      topic: 'generic investigation topic',
      script: [
        { id: 's1', type: 'body', duration: 8, narration: 'story' },
        { id: 's2', type: 'body', duration: 4, narration: 'more' },
      ],
      media: [
        {
          id: 'a',
          segmentId: 's1',
          type: 'video',
          url: 'https://videos.pexels.com/video-files/pp-a/pp-a.mp4',
          alt: 'worried person face close up',
        },
        {
          id: 'b',
          segmentId: 's1',
          type: 'video',
          url: 'https://videos.pexels.com/video-files/pp-b/pp-b.mp4',
          alt: 'shocked woman face reaction',
        },
        {
          id: 'c',
          segmentId: 's2',
          type: 'video',
          url: 'https://videos.pexels.com/video-files/pp-c/pp-c.mp4',
          alt: 'couple family worried face portrait',
        },
      ],
    };
    const tl = buildEditTimeline(project, { cutIntervalSec: 1, maxReusePerUrl: 1 });
    const ids = tl.filter((e) => e.segmentId === 's1').map((e) => e.assetId);
    expect(new Set(ids).size).toBeGreaterThanOrEqual(3);
    for (let i = 3; i < ids.length; i += 1) {
      const window = ids.slice(i - 3, i + 1);
      const alternating = window[0] === window[2] && window[1] === window[3] && window[0] !== window[1];
      expect(alternating).toBe(false);
    }
    const s1 = tl.filter((e) => e.segmentId === 's1');
    expect(Math.max(...s1.map((e) => e.endSec))).toBeGreaterThanOrEqual(7.95);
  });

  it('still covers a two-URL body by alternating when no third URL exists', () => {
    // With only 2 unique URLs there is no escape clip — the ping-pong guard
    // must stand down so the segment still renders full coverage.
    const project = {
      topic: 'generic investigation topic',
      script: [{ id: 's1', type: 'body', duration: 6, narration: 'story' }],
      media: [
        {
          id: 'a',
          segmentId: 's1',
          type: 'video',
          url: 'https://videos.pexels.com/video-files/two-a/two-a.mp4',
          alt: 'worried person face close up',
        },
        {
          id: 'b',
          segmentId: 's1',
          type: 'video',
          url: 'https://videos.pexels.com/video-files/two-b/two-b.mp4',
          alt: 'shocked woman face reaction',
        },
      ],
    };
    const tl = buildEditTimeline(project, { cutIntervalSec: 1, maxReusePerUrl: 1 });
    expect(tl.length).toBeGreaterThanOrEqual(4);
    expect(Math.max(...tl.map((e) => e.endSec))).toBeGreaterThanOrEqual(5.95);
  });

  it('caps body holds near 2–3s when reuse caps exhaust the segment pool but the project has three URLs', () => {
    // s2 has a single local video and both alternates sit at the hard reuse
    // cap: the timeline must cap the hold (~2s thin-pool ceiling) and refresh
    // with the least-bad clip instead of freezing one frame for 4s.
    const project = {
      topic: 'generic investigation topic',
      script: [
        { id: 's1', type: 'body', duration: 8, narration: 'story' },
        { id: 's2', type: 'body', duration: 4, narration: 'more' },
      ],
      media: [
        {
          id: 'a',
          segmentId: 's1',
          type: 'video',
          url: 'https://videos.pexels.com/video-files/hc-a/hc-a.mp4',
          alt: 'worried person face close up',
        },
        {
          id: 'b',
          segmentId: 's1',
          type: 'video',
          url: 'https://videos.pexels.com/video-files/hc-b/hc-b.mp4',
          alt: 'shocked woman face reaction',
        },
        {
          id: 'c',
          segmentId: 's2',
          type: 'video',
          url: 'https://videos.pexels.com/video-files/hc-c/hc-c.mp4',
          alt: 'couple family worried face portrait',
        },
      ],
    };
    const tl = buildEditTimeline(project, { cutIntervalSec: 1, maxReusePerUrl: 1 });
    const s2 = tl.filter((e) => e.segmentId === 's2');
    expect(Math.max(...tl.map((e) => e.endSec - e.startSec))).toBeLessThanOrEqual(2.51);
    expect(new Set(s2.map((e) => e.assetId)).size).toBeGreaterThanOrEqual(2);
    expect(Math.max(...s2.map((e) => e.endSec))).toBeGreaterThanOrEqual(3.95);
  });

  it('opens a generic-topic hook on a readable face even when a beat-matched non-face lead outscores it', () => {
    const project = {
      topic: 'The city zoning map that erased flood-risk neighborhoods',
      visualBeatSheet: {
        beats: [
          {
            id: 'beat1',
            segmentId: 'intro',
            searchableSubject: 'city hall zoning map meeting room',
            narrationExcerpt: 'zoning map erased flood risk neighborhoods',
            sentenceIndex: 0,
          },
        ],
      },
      script: [
        { id: 'intro', type: 'intro', duration: 5, narration: 'The zoning map erased flood risk neighborhoods overnight.' },
      ],
      media: [
        {
          id: 'map-meeting',
          segmentId: 'intro',
          type: 'video',
          url: 'https://videos.pexels.com/video-files/map-meeting/map-meeting.mp4',
          alt: 'people at city hall zoning map meeting room',
        },
        {
          id: 'resident-face',
          segmentId: 'intro',
          type: 'video',
          url: 'https://videos.pexels.com/video-files/resident-face/resident-face.mp4',
          alt: 'worried resident woman face close up',
        },
      ],
    };
    const tl = buildEditTimeline(project, { cutIntervalSec: 1, maxReusePerUrl: 1 });
    expect(tl[0].assetId).toBe('resident-face');
    const leadIds = tl.filter((e) => e.startSec < 3).map((e) => e.assetId);
    expect(leadIds.length).toBeGreaterThan(0);
    for (const id of leadIds) {
      expect(['resident-face', 'map-meeting']).toContain(id);
    }
  });

  it('keeps a surveillance lead on camera stories instead of forcing a face', () => {
    // Camera stories are the one face-first exception: the CCTV frame is the
    // subject of the story and outranks a generic worried face in the hook.
    const project = {
      topic: 'The nursing home cameras that recorded abuse for years',
      script: [{ id: 'intro', type: 'intro', duration: 3, narration: 'cameras recorded nursing home abuse' }],
      media: [
        {
          id: 'cctv',
          segmentId: 'intro',
          type: 'video',
          url: 'https://videos.pexels.com/video-files/nh-cctv/nh-cctv.mp4',
          alt: 'security camera cctv hallway nursing home',
          query: 'security camera cctv hallway',
        },
        {
          id: 'family-face',
          segmentId: 'intro',
          type: 'video',
          url: 'https://videos.pexels.com/video-files/nh-face/nh-face.mp4',
          alt: 'worried family face portrait close up',
          query: 'worried family portrait close up',
        },
      ],
    };
    const tl = buildEditTimeline(project, { cutIntervalSec: 1, maxReusePerUrl: 1 });
    expect(tl[0].assetId).toBe('cctv');
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
