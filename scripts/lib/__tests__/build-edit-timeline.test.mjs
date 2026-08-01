import { describe, it, expect } from 'vitest';
import {
  introFaceTier,
  hasReadableFaceVisual,
  visualSubjectCluster,
  buildEditTimeline,
} from '../build-edit-timeline.mjs';

// ---------------------------------------------------------------------------
// introFaceTier
// ---------------------------------------------------------------------------

describe('introFaceTier', () => {
  it('returns 0 for an asset with no face-like metadata', () => {
    const asset = { query: 'airplane runway', alt: 'runway tarmac at dusk', url: 'https://example.com/runway.jpg' };
    expect(introFaceTier(asset)).toBe(0);
  });

  it('returns 0 for a back-of-head shot (not a readable face)', () => {
    const asset = { query: 'passenger window', alt: 'back of head looking through airplane window', url: 'https://example.com/backhead.jpg' };
    expect(introFaceTier(asset)).toBe(0);
  });

  it('returns 1 for a generic readable face (non-topical)', () => {
    // needs both face term AND human role term for hasReadableFaceVisual
    const asset = {
      query: 'couple worried',
      alt: 'couple face worried portrait close-up people',
      url: 'https://example.com/couple.jpg',
    };
    expect(introFaceTier(asset, { airline: false, housing: false })).toBe(1);
  });

  it('returns 2 for a topical readable face on airline topic', () => {
    const asset = {
      query: 'passenger worried cabin',
      alt: 'passenger face worried airplane cabin close-up portrait people',
      url: 'https://example.com/pass.jpg',
    };
    expect(introFaceTier(asset, { airline: true, housing: false })).toBe(2);
  });

  it('returns 2 for a topical readable face on housing topic', () => {
    const asset = {
      query: 'tenant eviction letter',
      alt: 'tenant face worried eviction notice apartment close-up portrait people',
      url: 'https://example.com/tenant.jpg',
    };
    expect(introFaceTier(asset, { airline: false, housing: true })).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// visualSubjectCluster — cluster detection
// ---------------------------------------------------------------------------

describe('visualSubjectCluster', () => {
  it('classifies a person/face asset as human', () => {
    // query uses "person" not "port" to avoid matching the port/harbour cluster
    const asset = { alt: 'person close-up worried face expression', query: 'person face' };
    expect(visualSubjectCluster(asset)).toBe('human');
  });

  it('classifies a cockpit image as cockpit (takes priority over human)', () => {
    // cockpit is tested before human in the cluster function — document it explicitly
    const asset = { alt: 'pilot in cockpit flight deck', query: 'cockpit' };
    expect(visualSubjectCluster(asset)).toBe('cockpit');
  });

  it('classifies a runway as aircraft not human', () => {
    const asset = { alt: 'airplane on runway tarmac', query: 'runway' };
    expect(visualSubjectCluster(asset)).toBe('aircraft');
  });
});

// ---------------------------------------------------------------------------
// buildEditTimeline: 2-still hold extension
// ---------------------------------------------------------------------------

function makeBodyProject(assets, segDur = 10) {
  return {
    topic: 'test topic generic',
    script: [
      {
        id: 'seg1',
        type: 'body',
        duration: segDur,
        narration: 'This is a body segment with test narration content here.',
        title: 'Body segment',
      },
    ],
    media: assets.map((a, i) => ({ ...a, id: `a${i}`, segmentId: 'seg1' })),
  };
}

describe('buildEditTimeline: 2-still hold extension', () => {
  it('holds each still ≥4 s when only 2 still URLs exist in a body segment', () => {
    const project = makeBodyProject(
      [
        { type: 'image', url: 'https://example.com/still1.jpg', alt: 'landscape still one', query: 'still one' },
        { type: 'image', url: 'https://example.com/still2.jpg', alt: 'landscape still two', query: 'still two' },
      ],
      10,
    );
    const timeline = buildEditTimeline(project, { cutIntervalSec: 1.25 });
    // 10 s ÷ 4 s/clip → at most 3 entries (not 8 rapid 1.25 s cuts)
    expect(timeline.length).toBeLessThanOrEqual(3);
    // All entries except possibly the final tail should hold ≥4 s.
    // The last entry may be shorter if the segment duration doesn't divide evenly.
    const nonFinal = timeline.slice(0, -1);
    for (const entry of nonFinal) {
      expect(entry.endSec - entry.startSec).toBeGreaterThanOrEqual(3.9);
    }
    // Even at 1.25 s pacing without the fix we'd get ≥7 entries; ≤3 confirms the fix.
    expect(timeline.length).toBeGreaterThan(0);
  });

  it('does not extend holds when a video is available alongside stills', () => {
    const project = makeBodyProject(
      [
        { type: 'video', url: 'https://example.com/vid1.mp4', alt: 'video clip one', query: 'video one' },
        { type: 'image', url: 'https://example.com/still1.jpg', alt: 'still one', query: 'still one' },
      ],
      10,
    );
    const timeline = buildEditTimeline(project, { cutIntervalSec: 1.25 });
    // Normal 1.25 s pacing → ≥6 entries over 10 s
    expect(timeline.length).toBeGreaterThan(4);
  });

  it('does not extend holds for intro segments even with 2 stills', () => {
    const project = {
      topic: 'test topic generic',
      script: [
        {
          id: 'seg1',
          type: 'intro',
          duration: 10,
          narration: 'Intro narration content here.',
          title: 'Intro',
        },
      ],
      media: [
        { id: 'a0', segmentId: 'seg1', type: 'image', url: 'https://example.com/s1.jpg', alt: 'still one', query: 's1' },
        { id: 'a1', segmentId: 'seg1', type: 'image', url: 'https://example.com/s2.jpg', alt: 'still two', query: 's2' },
      ],
    };
    const timeline = buildEditTimeline(project, { cutIntervalSec: 1.25 });
    // Intro uses 0.65 s interval; ≥10 cuts over 10 s
    expect(timeline.length).toBeGreaterThan(8);
  });
});

// ---------------------------------------------------------------------------
// buildEditTimeline: introFaceTier human-cluster fallback
// ---------------------------------------------------------------------------

describe('buildEditTimeline: introFaceTier human-cluster fallback', () => {
  it('picks a human-cluster asset before a non-human one for the intro lead when no strict face exists', () => {
    // "person portrait" matches the human cluster but does NOT have the role-word+face-term
    // combo that hasReadableFaceVisual requires (so introFaceTier returns 0).
    // The new fallback should still prefer this over a runway/aerial asset.
    const project = {
      topic: 'generic test story',
      script: [
        {
          id: 'seg1',
          type: 'intro',
          duration: 5,
          narration: 'Hook narration here for the test.',
          title: 'Intro',
        },
      ],
      media: [
        // Human-cluster still (weak face signal — no explicit role word like "passenger")
        {
          id: 'human1',
          segmentId: 'seg1',
          type: 'image',
          url: 'https://example.com/person-portrait.jpg',
          alt: 'person close-up portrait',
          query: 'portrait',
        },
        // Aerial / establishing shot — no human signal
        {
          id: 'aerial1',
          segmentId: 'seg1',
          type: 'image',
          url: 'https://example.com/aerial.jpg',
          alt: 'aerial view city skyline',
          query: 'aerial',
        },
      ],
    };
    const timeline = buildEditTimeline(project, { cutIntervalSec: 1.25 });
    // First entry should use the portrait asset, not the aerial one
    const firstEntry = timeline[0];
    expect(firstEntry).toBeDefined();
    expect(firstEntry.assetId).toBe('human1');
  });
});
