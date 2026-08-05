import { describe, it, expect } from 'vitest';
import { capScriptSegmentsForLoop, promoteIntroFaceVideo } from '../patch-project-for-loop.mjs';

const HOUSING_TOPIC = 'The landlord algorithm that evicted tenants from rent-stabilized apartments';

describe('promoteIntroFaceVideo (housing)', () => {
  it('moves face/apartment web motion onto intro and demotes landscape Archive', () => {
    const project = {
      topic: HOUSING_TOPIC,
      script: [
        { id: 'intro', type: 'intro', duration: 8, narration: 'Hook line about rent.', title: 'Intro' },
        { id: 'body', type: 'body', duration: 20, narration: 'Body about eviction notices.', title: 'Body' },
      ],
      media: [
        {
          id: 'lake',
          segmentId: 'intro',
          type: 'video',
          url: 'https://archive.org/download/lake/lake.mp4',
          alt: 'scenic mountain lake landscape aerial view',
          query: 'landscape lake',
          source: 'Archive.org live',
        },
        {
          id: 'face',
          segmentId: 'body',
          type: 'video',
          url: 'https://example.com/tenant-face.mp4',
          alt: 'tenant face worried eviction notice apartment close-up portrait people',
          query: 'worried tenant apartment',
          source: 'Bing web video',
        },
      ],
    };

    const out = promoteIntroFaceVideo(project);
    const face = out.media.find((m) => m.id === 'face');
    const lake = out.media.find((m) => m.id === 'lake');
    expect(face.segmentId).toBe('intro');
    expect(lake.segmentId).toBe('body');
  });

  it('does not promote landscape-only video onto housing intro when no face/apt exists', () => {
    const project = {
      topic: HOUSING_TOPIC,
      script: [
        { id: 'intro', type: 'intro', duration: 8, narration: 'Hook line about rent.', title: 'Intro' },
        { id: 'body', type: 'body', duration: 20, narration: 'Body about eviction notices.', title: 'Body' },
      ],
      media: [
        {
          id: 'lake',
          segmentId: 'body',
          type: 'video',
          url: 'https://archive.org/download/lake/lake.mp4',
          alt: 'scenic mountain lake landscape aerial view',
          query: 'landscape lake',
          source: 'Archive.org live',
        },
      ],
    };

    const out = promoteIntroFaceVideo(project);
    expect(out.media.find((m) => m.id === 'lake').segmentId).toBe('body');
  });

  it('does not promote rent-strike / protest pads onto housing intro (web20)', () => {
    const project = {
      topic: 'The housing crash they said would never happen',
      script: [
        { id: 'intro', type: 'intro', duration: 8, narration: 'They hid the housing crash.', title: 'Intro' },
        { id: 'body', type: 'body', duration: 20, narration: 'Body.', title: 'Body' },
      ],
      media: [
        {
          id: 'strike',
          segmentId: 'intro',
          type: 'video',
          url: 'https://archive.org/download/parkdale/x.mp4',
          alt: 'parkdale vs the ltb',
          query: 'rent strike',
          source: 'Archive.org live',
        },
        {
          id: 'face',
          segmentId: 'body',
          type: 'video',
          url: 'https://example.com/tenant-face.mp4',
          alt: 'worried tenant face apartment eviction notice close-up portrait',
          query: 'shocked face apartment eviction notice',
          source: 'Bing web video',
        },
      ],
    };

    const out = promoteIntroFaceVideo(project);
    expect(out.media.find((m) => m.id === 'face').segmentId).toBe('intro');
    expect(out.media.find((m) => m.id === 'strike').segmentId).toBe('body');
  });

  it('caps loop scripts to 4 segments and reassigns dropped media (web21)', () => {
    const project = {
      script: Array.from({ length: 7 }, (_, i) => ({
        id: `s${i}`,
        title: `Beat ${i}`,
        narration: `Narration ${i}.`,
      })),
      media: [
        { id: 'm5', segmentId: 's5', type: 'video', url: 'https://example.com/a.mp4' },
        { id: 'm6', segmentId: 's6', type: 'video', url: 'https://example.com/b.mp4' },
      ],
    };
    const out = capScriptSegmentsForLoop(project, 4);
    expect(out.script).toHaveLength(4);
    expect(out.media.every((m) => m.segmentId === 's3')).toBe(true);
    expect(out.script[3].narration).toMatch(/Narration 3/);
    expect(out.script[3].narration).toMatch(/Narration 6/);
  });

  it('promotes healthcare surgical robot / da Vinci OR over Archive pad (web16)', () => {
    const HEALTHCARE_TOPIC =
      'How AI and surgical robots are transforming modern medicine in hospital operating rooms';
    const project = {
      topic: HEALTHCARE_TOPIC,
      script: [
        { id: 'intro', type: 'intro', duration: 8, narration: 'AI is changing surgery.', title: 'Intro' },
        { id: 'body', type: 'body', duration: 20, narration: 'Robots in the OR.', title: 'Body' },
      ],
      media: [
        {
          id: 'archive-pad',
          segmentId: 'intro',
          type: 'video',
          url: 'https://archive.org/download/generic/pad.mp4',
          alt: 'generic hospital corridor hallway generic b-roll',
          query: 'hospital corridor',
          source: 'Archive.org live',
        },
        {
          id: 'da-vinci-or',
          segmentId: 'body',
          type: 'video',
          url: 'https://archive.org/download/davinci/or.mp4',
          alt: 'da Vinci surgical robot operating room surgeon',
          query: 'surgical robot operating room',
          source: 'Archive.org live',
        },
      ],
    };

    const out = promoteIntroFaceVideo(project);
    expect(out.media.find((m) => m.id === 'da-vinci-or').segmentId).toBe('intro');
    expect(out.media.find((m) => m.id === 'archive-pad').segmentId).toBe('body');
  });

  it('hard-rejects web16 healthcare junk in promoteIntroFaceVideo (MedCram/PA/eclipse/WWI/1972/bilibili)', () => {
    const HEALTHCARE_TOPIC =
      'How AI and surgical robots are transforming modern medicine in hospital operating rooms';
    const junkAlts = [
      'online medical learning how pa schools can benefit from medcram',
      'nurses at celebrity eclipse medical facility cruise ship',
      'maryland women s heritage center honor nurses wwi',
      'emergency 1972 tv series incomplete old footage',
      'bilibili chill sakura ai debug pad lofi stream',
    ];
    for (const junkAlt of junkAlts) {
      const project = {
        topic: HEALTHCARE_TOPIC,
        script: [
          { id: 'intro', type: 'intro', duration: 8, narration: 'AI surgery hook.', title: 'Intro' },
          { id: 'body', type: 'body', duration: 20, narration: 'Body.', title: 'Body' },
        ],
        media: [
          {
            id: 'pad',
            segmentId: 'intro',
            type: 'video',
            url: 'https://archive.org/download/good/pad.mp4',
            alt: 'da Vinci surgical robot operating room incision',
            query: 'surgical robot OR',
            source: 'Archive.org live',
          },
          {
            id: 'junk',
            segmentId: 'body',
            type: 'video',
            url: 'https://youtube.com/watch?v=junk',
            alt: junkAlt,
            query: 'junk query',
            source: 'Bing web video',
          },
        ],
      };

      const out = promoteIntroFaceVideo(project);
      expect(out.media.find((m) => m.id === 'junk').segmentId).toBe(
        'body',
        `junk clip "${junkAlt}" should NOT be promoted to intro`,
      );
    }
  });

  it('promotes modern apartment motion when it is the best housing signal', () => {
    const project = {
      topic: HOUSING_TOPIC,
      script: [
        { id: 'intro', type: 'intro', duration: 8, narration: 'Hook line about rent.', title: 'Intro' },
        { id: 'body', type: 'body', duration: 20, narration: 'Body about eviction notices.', title: 'Body' },
      ],
      media: [
        {
          id: 'lake',
          segmentId: 'intro',
          type: 'video',
          url: 'https://archive.org/download/lake/lake.mp4',
          alt: 'scenic mountain lake landscape aerial view',
          query: 'landscape lake',
          source: 'Archive.org live',
        },
        {
          id: 'apt',
          segmentId: 'body',
          type: 'video',
          url: 'https://example.com/apt.mp4',
          alt: 'modern apartment interior living room daylight',
          query: 'modern apartment living room',
          source: 'Bing web video',
        },
      ],
    };

    const out = promoteIntroFaceVideo(project);
    expect(out.media.find((m) => m.id === 'apt').segmentId).toBe('intro');
    expect(out.media.find((m) => m.id === 'lake').segmentId).toBe('body');
  });
});
