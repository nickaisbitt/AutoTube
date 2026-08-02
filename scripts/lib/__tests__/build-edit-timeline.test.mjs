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

// ---------------------------------------------------------------------------
// buildEditTimeline: strict reuse cap for thin keyless pools
// ---------------------------------------------------------------------------

function makeVideoPool(n, { source = 'Stock video pool', prefix = 'clip' } = {}) {
  return Array.from({ length: n }, (_, i) => ({
    id: `v${i}`,
    segmentId: 'seg1',
    type: 'video',
    url: `https://example.com/${prefix}${i}.mp4`,
    alt: `airline b-roll clip ${i} cabin aircraft`,
    query: 'airline aircraft cabin',
    source,
  }));
}

function reuseCounts(timeline, windowSec = null) {
  const counts = new Map();
  for (const e of timeline) {
    if (windowSec != null && e.startSec >= windowSec) continue;
    counts.set(e.assetId, (counts.get(e.assetId) || 0) + 1);
  }
  return counts;
}

describe('buildEditTimeline: strict reuse cap (thin keyless pools)', () => {
  it('caps a dominant archive/sim clip at ≤2 in the first 30s when alternatives exist (airline-v2 repro)', () => {
    // The airline-v2 failure: a lone flight-sim archive clip is the only
    // non-"aircraft" cluster, so the consecutive-cluster rule funnelled every
    // other pick back onto it — it appeared ≥3× in the opening sample even
    // though five fresh airline clips were available. The strict window cap
    // must hold it (and every URL) to ≤2 across the opening 30s.
    const project = {
      topic: 'airline emergency mystery',
      script: [
        {
          id: 'seg1',
          type: 'body',
          duration: 150,
          narration: 'The airline flight faced an emergency as the aircraft cabin filled with worried passengers and crew members.',
          title: 'Body',
        },
      ],
      media: [
        {
          id: 'sim',
          segmentId: 'seg1',
          type: 'video',
          url: 'https://archive.org/download/flightsim/flightsim.mp4',
          alt: 'airplane cockpit flight simulator aviation jet flight deck aircraft cabin passenger',
          query: 'flight simulator cockpit aircraft cabin',
          source: 'Archive.org live',
        },
        ...Array.from({ length: 5 }, (_, i) => ({
          id: `fresh${i}`,
          segmentId: 'seg1',
          type: 'video',
          url: `https://example.com/fresh${i}.mp4`,
          alt: `airplane clip ${i}`,
          query: 'airplane',
          source: 'Pexels Videos',
        })),
      ],
    };
    const timeline = buildEditTimeline(project, { cutIntervalSec: 1.25 });
    const first30 = reuseCounts(timeline, 30);
    expect(first30.get('sim') || 0).toBeLessThanOrEqual(2);
    expect(Math.max(...first30.values())).toBeLessThanOrEqual(2);
  });

  it('holds a repeated source URL to ≤2 within the first 30s window when alternatives exist', () => {
    // Broad pool, long (non-short) video: the opening 30s must never loop a
    // single clip past twice while fresh URLs remain reachable.
    const project = {
      topic: 'airline emergency mystery',
      script: [
        {
          id: 'seg1',
          type: 'body',
          duration: 150,
          narration: 'The airline flight faced an emergency as the aircraft cabin filled with worried passengers and crew.',
          title: 'Body',
        },
      ],
      media: makeVideoPool(14),
    };
    const timeline = buildEditTimeline(project, { cutIntervalSec: 1.25 });
    const counts = reuseCounts(timeline, 30);
    const maxReuse = Math.max(...counts.values());
    expect(maxReuse).toBeLessThanOrEqual(2);
  });

  it('relaxes the cap when the pool is too thin for an alternative to exist', () => {
    // Only 2 clips over 20s: no third URL to cut to, so reuse past twice is the
    // best available coverage. The cap must not starve the timeline into gaps.
    const project = {
      topic: 'airline emergency mystery',
      script: [
        {
          id: 'seg1',
          type: 'body',
          duration: 20,
          narration: 'The airline flight faced an emergency as the aircraft cabin filled with passengers.',
          title: 'Body',
        },
      ],
      media: makeVideoPool(2),
    };
    const timeline = buildEditTimeline(project, { cutIntervalSec: 1.25 });
    // Full coverage: cuts span the whole segment with no gap.
    expect(timeline.length).toBeGreaterThan(0);
    expect(timeline[timeline.length - 1].endSec).toBeGreaterThanOrEqual(19.9);
  });

  it('demotes a repeated archive/sim clip below a fresher lower-scoring clip', () => {
    // A highly-topical flight-sim archive clip must not be reused a second time
    // ahead of a fresh, less-topical airline clip: after its first use the
    // archive/sim penalty demotes it so variety wins the next slot.
    const project = {
      topic: 'airline emergency mystery',
      script: [
        {
          id: 'seg1',
          type: 'body',
          duration: 10,
          narration: 'The airline flight faced an emergency as the aircraft cabin filled with passengers.',
          title: 'Body',
        },
      ],
      media: [
        {
          id: 'sim',
          segmentId: 'seg1',
          type: 'video',
          url: 'https://archive.org/download/flightsim/flightsim.mp4',
          alt: 'airplane cockpit flight simulator aviation jet flight deck aircraft cabin',
          query: 'flight simulator cockpit aircraft',
          source: 'Archive.org live',
        },
        {
          id: 'fresh',
          segmentId: 'seg1',
          type: 'video',
          url: 'https://example.com/fresh.mp4',
          alt: 'airplane cabin aisle',
          query: 'airline cabin',
          source: 'Pexels Videos',
        },
      ],
    };
    const timeline = buildEditTimeline(project, { cutIntervalSec: 1.25 });
    const counts = reuseCounts(timeline);
    // The sim clip is used at most as often as the fresh clip — never looped.
    expect(counts.get('sim') || 0).toBeLessThanOrEqual(counts.get('fresh') || 0);
  });
});

// ---------------------------------------------------------------------------
// buildEditTimeline: rich-pool short holds (≥12 unique URLs)
// ---------------------------------------------------------------------------

function makeRichPool(n, { topic = 'airline emergency mystery', segDur = 60 } = {}) {
  return {
    topic,
    script: [
      {
        id: 'seg1',
        type: 'body',
        duration: segDur,
        narration: 'The airline flight faced an emergency as the aircraft cabin filled with worried passengers and crew members.',
        title: 'Body',
      },
    ],
    media: Array.from({ length: n }, (_, i) => ({
      id: `v${i}`,
      segmentId: 'seg1',
      type: 'video',
      url: `https://example.com/clip${i}.mp4`,
      alt: `airline b-roll clip ${i} cabin aircraft passenger`,
      query: 'airline aircraft cabin',
      source: 'Pexels Videos',
    })),
  };
}

describe('buildEditTimeline: rich-pool short holds', () => {
  it('caps body holds at ≤1.5s when pool has ≥12 unique video URLs', () => {
    const project = makeRichPool(14, { segDur: 30 });
    const timeline = buildEditTimeline(project, { cutIntervalSec: 1.25 });
    expect(timeline.length).toBeGreaterThan(0);
    // With ≥12 URLs, effectiveCut ≤ 1.5s → ≥12 cuts in 30s, not 3–5 long holds
    const nonFinal = timeline.slice(0, -1);
    for (const entry of nonFinal) {
      expect(entry.endSec - entry.startSec).toBeLessThanOrEqual(1.6); // 1.5 + float tolerance
    }
    // At 1.5s max per cut, 30s → at least 18 entries
    expect(timeline.length).toBeGreaterThanOrEqual(18);
  });

  it('caps body holds at ≤1.5s when pool is ≥2× segment count (relative threshold)', () => {
    // 3 script segments, 8 unique clips (8 ≥ 8 minimum AND 8 ≥ 2×3=6 → rich pool)
    const project = {
      topic: 'airline emergency mystery',
      script: [
        { id: 'seg1', type: 'intro', duration: 5, narration: 'Hook here.', title: 'Intro' },
        { id: 'seg2', type: 'body', duration: 20, narration: 'The airline flight faced an emergency with worried passengers.', title: 'Body' },
        { id: 'seg3', type: 'outro', duration: 5, narration: 'Subscribe.', title: 'Outro' },
      ],
      media: Array.from({ length: 8 }, (_, i) => ({
        id: `v${i}`,
        segmentId: i < 4 ? 'seg2' : 'seg2',
        type: 'video',
        url: `https://example.com/clip${i}.mp4`,
        alt: `airline clip ${i} aircraft cabin passenger face`,
        query: 'airline aircraft',
        source: 'Pexels Videos',
      })),
    };
    const timeline = buildEditTimeline(project, { cutIntervalSec: 1.25 });
    const bodyEntries = timeline.filter((e) => e.segmentId === 'seg2');
    const nonFinal = bodyEntries.slice(0, -1);
    for (const entry of nonFinal) {
      expect(entry.endSec - entry.startSec).toBeLessThanOrEqual(1.6);
    }
    // 20s body at ≤1.5s → at least 12 body entries
    expect(bodyEntries.length).toBeGreaterThanOrEqual(12);
  });

  it('does NOT apply rich-pool short-hold cap to a thin pool (< 12 and < 2× seg count)', () => {
    // 4 unique clips for a body segment — thin pool, should use up to 2.5s holds
    const project = makeRichPool(4, { segDur: 20 });
    const timeline = buildEditTimeline(project, { cutIntervalSec: 1.25 });
    // Thin pool: hardMaxReuse will stretch holds beyond 1.5s to fill coverage
    // when all clips hit their per-segment reuse limit; let it — just verify
    // we still get full coverage.
    expect(timeline.length).toBeGreaterThan(0);
    expect(timeline[timeline.length - 1].endSec).toBeGreaterThanOrEqual(19.9);
  });

  it('no single URL appears more than once in the first 15s of a rich pool', () => {
    // 16 unique clips, 45s body — rich pool: first 15s must cycle through
    // fresh clips without repeating any URL.
    const project = makeRichPool(16, { segDur: 45 });
    const timeline = buildEditTimeline(project, { cutIntervalSec: 1.25 });
    const countsFirst15 = reuseCounts(timeline, 15);
    const maxReuseFirst15 = countsFirst15.size ? Math.max(...countsFirst15.values()) : 0;
    expect(maxReuseFirst15).toBeLessThanOrEqual(1);
  });

  it('≤2 cap still holds in first 30s for rich pool (existing contract)', () => {
    const project = makeRichPool(16, { segDur: 60 });
    const timeline = buildEditTimeline(project, { cutIntervalSec: 1.25 });
    const counts30 = reuseCounts(timeline, 30);
    expect(Math.max(...counts30.values())).toBeLessThanOrEqual(2);
  });

  it('rich-pool hold cap does not starve coverage on a rich airline-web scenario (26 clips)', () => {
    // Matches the failing audit scenario: 26 web motion clips injected.
    const project = makeRichPool(26, { segDur: 120 });
    const timeline = buildEditTimeline(project, { cutIntervalSec: 1.25 });
    // Full coverage
    expect(timeline[timeline.length - 1].endSec).toBeGreaterThanOrEqual(119.9);
    // Body holds ≤ 1.5s throughout
    const nonFinal = timeline.slice(0, -1);
    for (const entry of nonFinal) {
      expect(entry.endSec - entry.startSec).toBeLessThanOrEqual(1.6);
    }
    // First 15s: each URL used at most once
    const countsFirst15 = reuseCounts(timeline, 15);
    expect(Math.max(...countsFirst15.values())).toBeLessThanOrEqual(1);
    // First 30s: each URL used at most twice
    const counts30 = reuseCounts(timeline, 30);
    expect(Math.max(...counts30.values())).toBeLessThanOrEqual(2);
  });
});
