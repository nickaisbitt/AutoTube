import { describe, it, expect, beforeEach } from 'vitest';
import { reorderForHook } from '../segmentReorderer';
import type { VideoProject, ScriptSegment, MediaAsset } from '../../types';

// ── Helpers ──────────────────────────────────────────────────────────────────

let segCounter = 0;
let assetCounter = 0;

function makeSegment(overrides: Partial<ScriptSegment> = {}): ScriptSegment {
  const id = overrides.id ?? `seg-${++segCounter}`;
  return {
    id,
    type: 'section',
    title: `Segment ${id}`,
    narration: `Narration for ${id}.`,
    visualNote: `Visual note for ${id}.`,
    duration: 10,
    ...overrides,
  };
}

function makeAsset(overrides: Partial<MediaAsset> & { segmentId: string }): MediaAsset {
  const id = overrides.id ?? `asset-${++assetCounter}`;
  return {
    id,
    segmentId: overrides.segmentId,
    type: 'image',
    url: `https://example.com/${id}.jpg`,
    alt: overrides.alt ?? 'generic image',
    source: 'DuckDuckGo',
    score: overrides.score ?? 0.5,
    concept: overrides.concept ?? '',
    ...(overrides as Omit<Partial<MediaAsset>, 'segmentId'>),
  };
}

function makeProject(
  segments: ScriptSegment[],
  assets: MediaAsset[],
): VideoProject {
  return {
    id: 'proj-1',
    title: 'Test Project',
    topic: 'Test Topic',
    style: 'business_insider',
    targetDuration: 60,
    script: segments,
    media: assets,
    narration: [],
    version: 1,
    status: 'draft',
    createdAt: new Date('2024-01-01'),
  };
}

// Reset counters before each test suite so IDs are predictable
beforeEach(() => {
  segCounter = 0;
  assetCounter = 0;
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('reorderForHook', () => {
  // Requirement 6.1, 6.2: chart asset at index 2 → segment moves to index 0
  it('moves the segment associated with a chart asset at index 2 to index 0', () => {
    const seg0 = makeSegment({ id: 'seg-0', type: 'intro' });
    const seg1 = makeSegment({ id: 'seg-1', type: 'section' });
    const seg2 = makeSegment({ id: 'seg-2', type: 'section' });

    const asset = makeAsset({
      segmentId: 'seg-2',
      concept: 'revenue chart',
      score: 0.9,
    });

    const project = makeProject([seg0, seg1, seg2], [asset]);
    const result = reorderForHook(project);

    expect(result.script[0].id).toBe('seg-2');
  });

  // Requirement 6.3: moved segment gets type = 'intro'
  it('sets type to "intro" on the segment moved to index 0', () => {
    const seg0 = makeSegment({ id: 'seg-0', type: 'intro' });
    const seg1 = makeSegment({ id: 'seg-1', type: 'section' });
    const seg2 = makeSegment({ id: 'seg-2', type: 'section' });

    const asset = makeAsset({
      segmentId: 'seg-2',
      concept: 'revenue chart',
      score: 0.9,
    });

    const project = makeProject([seg0, seg1, seg2], [asset]);
    const result = reorderForHook(project);

    expect(result.script[0].type).toBe('intro');
  });

  // Requirement 6.5: the originally-displaced segment at index 0 retains its original type
  it('preserves the original type of the segment displaced from index 0', () => {
    const seg0 = makeSegment({ id: 'seg-0', type: 'intro' });
    const seg1 = makeSegment({ id: 'seg-1', type: 'section' });
    const seg2 = makeSegment({ id: 'seg-2', type: 'section' });

    const asset = makeAsset({
      segmentId: 'seg-2',
      concept: 'revenue chart',
      score: 0.9,
    });

    const project = makeProject([seg0, seg1, seg2], [asset]);
    const result = reorderForHook(project);

    // seg-0 was originally at index 0 with type 'intro'; it should still be 'intro'
    const displaced = result.script.find((s) => s.id === 'seg-0');
    expect(displaced?.type).toBe('intro');
  });

  // Requirement 10.4: all ScriptSegment fields are preserved after reordering
  it('preserves all ScriptSegment fields (narration, title, duration) after reordering', () => {
    const seg0 = makeSegment({ id: 'seg-0', type: 'intro' });
    const seg2 = makeSegment({
      id: 'seg-2',
      type: 'section',
      title: 'Revenue Breakdown',
      narration: 'Revenue grew 200% year over year.',
      duration: 25,
    });

    const asset = makeAsset({
      segmentId: 'seg-2',
      concept: 'revenue chart',
      score: 0.9,
    });

    const project = makeProject([seg0, seg2], [asset]);
    const result = reorderForHook(project);

    const movedSeg = result.script[0];
    expect(movedSeg.id).toBe('seg-2');
    expect(movedSeg.title).toBe('Revenue Breakdown');
    expect(movedSeg.narration).toBe('Revenue grew 200% year over year.');
    expect(movedSeg.duration).toBe(25);
  });

  // Requirement 6.4: no chart assets → script order is unchanged
  it('returns the project unchanged when no chart assets exist', () => {
    const seg0 = makeSegment({ id: 'seg-0', type: 'intro' });
    const seg1 = makeSegment({ id: 'seg-1', type: 'section' });

    const asset = makeAsset({
      segmentId: 'seg-0',
      concept: 'CEO portrait',
      score: 0.9,
    });

    const project = makeProject([seg0, seg1], [asset]);
    const result = reorderForHook(project);

    // Should return the same reference (no reordering needed)
    expect(result).toBe(project);
    expect(result.script[0].id).toBe('seg-0');
    expect(result.script[1].id).toBe('seg-1');
  });

  // Requirement 6.1: multiple chart assets → the one with the highest score is selected
  it('selects the chart asset with the highest score when multiple chart assets exist', () => {
    const seg0 = makeSegment({ id: 'seg-0', type: 'intro' });
    const seg1 = makeSegment({ id: 'seg-1', type: 'section' });
    const seg2 = makeSegment({ id: 'seg-2', type: 'section' });

    const lowScoreAsset = makeAsset({
      segmentId: 'seg-1',
      concept: 'stock chart',
      score: 0.5,
    });
    const highScoreAsset = makeAsset({
      segmentId: 'seg-2',
      concept: 'revenue graph',
      score: 0.95,
    });

    const project = makeProject([seg0, seg1, seg2], [lowScoreAsset, highScoreAsset]);
    const result = reorderForHook(project);

    // The segment associated with the highest-scored chart asset should be at index 0
    expect(result.script[0].id).toBe('seg-2');
  });

  // Requirement 6.7: segmentId values in project.media still match the correct segments
  it('keeps segmentId values in project.media referencing the correct segments after reordering', () => {
    const seg0 = makeSegment({ id: 'seg-0', type: 'intro' });
    const seg1 = makeSegment({ id: 'seg-1', type: 'section' });
    const seg2 = makeSegment({ id: 'seg-2', type: 'section' });

    const asset0 = makeAsset({ segmentId: 'seg-0', concept: 'CEO portrait', score: 0.3 });
    const asset1 = makeAsset({ segmentId: 'seg-1', concept: 'product image', score: 0.4 });
    const chartAsset = makeAsset({ segmentId: 'seg-2', concept: 'revenue chart', score: 0.9 });

    const project = makeProject([seg0, seg1, seg2], [asset0, asset1, chartAsset]);
    const result = reorderForHook(project);

    // After reordering, each asset's segmentId should still match a segment with the same id
    for (const asset of result.media) {
      const matchingSegment = result.script.find((s) => s.id === asset.segmentId);
      expect(matchingSegment).toBeDefined();
    }

    // Specifically, the chart asset's segmentId should still point to the moved segment
    const movedChartAsset = result.media.find((a) => a.id === chartAsset.id);
    expect(movedChartAsset?.segmentId).toBe('seg-2');
    expect(result.script[0].id).toBe('seg-2');
  });

  // Edge case: chart asset already at index 0 → no reordering needed
  it('returns the project unchanged when the best chart asset is already at index 0', () => {
    const seg0 = makeSegment({ id: 'seg-0', type: 'intro' });
    const seg1 = makeSegment({ id: 'seg-1', type: 'section' });

    const asset = makeAsset({
      segmentId: 'seg-0',
      concept: 'revenue chart',
      score: 0.9,
    });

    const project = makeProject([seg0, seg1], [asset]);
    const result = reorderForHook(project);

    expect(result).toBe(project);
  });

  // Edge case: all CHART_KEYWORDS are recognised
  it.each([
    'chart',
    'graph',
    'revenue',
    'stock',
    'salary',
    'growth',
    'market cap',
  ])('recognises "%s" as a chart keyword', (keyword) => {
    const seg0 = makeSegment({ id: 'seg-0', type: 'section' });
    const seg1 = makeSegment({ id: 'seg-1', type: 'section' });

    const asset = makeAsset({
      segmentId: 'seg-1',
      concept: `${keyword} data`,
      score: 0.8,
    });

    const project = makeProject([seg0, seg1], [asset]);
    const result = reorderForHook(project);

    expect(result.script[0].id).toBe('seg-1');
  });
});
