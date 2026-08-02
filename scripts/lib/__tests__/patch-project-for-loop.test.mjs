import { describe, it, expect } from 'vitest';
import { promoteIntroFaceVideo } from '../patch-project-for-loop.mjs';

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
