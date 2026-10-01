import { describe, it, expect, beforeEach } from 'vitest';
import { applyEditPlan, createDefaultEditPlan } from '../aiEditor';
import type {
  VideoProject,
  ScriptSegment,
  MediaAsset,
  NarrationClip,
  EditPlan,
  SegmentEditEntry,
} from '../../types';

// ── Helpers ──────────────────────────────────────────────────────────────────

let segCounter = 0;
let assetCounter = 0;
let narrationCounter = 0;

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

function makeAsset(
  overrides: Partial<MediaAsset> & { segmentId: string },
): MediaAsset {
  const id = overrides.id ?? `asset-${++assetCounter}`;
  return {
    id,
    type: 'image',
    url: `https://example.com/${id}.jpg`,
    alt: 'generic image',
    source: 'DuckDuckGo',
    ...overrides,
  };
}

function makeNarration(
  overrides: Partial<NarrationClip> & { segmentId: string },
): NarrationClip {
  const id = overrides.id ?? `narr-${++narrationCounter}`;
  return {
    id,
    text: 'Some narration text.',
    voice: 'default',
    duration: 10,
    status: 'ready',
    ...overrides,
  };
}

function makeProject(
  segments: ScriptSegment[],
  assets: MediaAsset[],
  narration: NarrationClip[] = [],
): VideoProject {
  return {
    id: 'proj-1',
    version: 1,
    title: 'Test Project',
    topic: 'Test Topic',
    style: 'business_insider',
    targetDuration: 60,
    script: segments,
    media: assets,
    narration,
    status: 'draft',
    createdAt: new Date('2024-01-01'),
  };
}

function makeSegmentEntry(
  overrides: Partial<SegmentEditEntry> & { segmentId: string },
): SegmentEditEntry {
  return {
    segmentId: overrides.segmentId,
    shotOrder: overrides.shotOrder ?? [],
    adjustedDuration: overrides.adjustedDuration ?? null,
    originalDuration: overrides.originalDuration ?? 10,
    transition: overrides.transition ?? null,
    kenBurns: overrides.kenBurns ?? {},
    captionSettings: overrides.captionSettings ?? {
      wordsPerWindow: 8,
      displayDurationMs: 2667,
      isFastPaced: false,
    },
    replacementSuggestions: overrides.replacementSuggestions ?? [],
    rationale: overrides.rationale ?? 'Test rationale.',
  };
}

beforeEach(() => {
  segCounter = 0;
  assetCounter = 0;
  narrationCounter = 0;
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('applyEditPlan', () => {
  // Requirement 9.2: Must NOT mutate input project or plan
  it('does not mutate the input project or plan', () => {
    const seg = makeSegment({ id: 'seg-1', duration: 10 });
    const asset = makeAsset({ id: 'a1', segmentId: 'seg-1' });
    const project = makeProject([seg], [asset]);

    const plan: EditPlan = {
      segments: [
        makeSegmentEntry({
          segmentId: 'seg-1',
          shotOrder: ['a1'],
          adjustedDuration: 15,
          originalDuration: 10,
        }),
      ],
      summary: 'Test plan',
      isDefault: false,
    };

    // Deep snapshot before
    const projectBefore = JSON.stringify(project);
    const planBefore = JSON.stringify(plan);

    applyEditPlan(project, plan);

    expect(JSON.stringify(project)).toBe(projectBefore);
    expect(JSON.stringify(plan)).toBe(planBefore);
  });

  // Requirement 2.2, 2.3: Shot reordering preserves all assets
  it('reorders media assets according to shotOrder', () => {
    const seg = makeSegment({ id: 'seg-1' });
    const a1 = makeAsset({ id: 'a1', segmentId: 'seg-1' });
    const a2 = makeAsset({ id: 'a2', segmentId: 'seg-1' });
    const a3 = makeAsset({ id: 'a3', segmentId: 'seg-1' });
    const project = makeProject([seg], [a1, a2, a3]);

    const plan: EditPlan = {
      segments: [
        makeSegmentEntry({
          segmentId: 'seg-1',
          shotOrder: ['a3', 'a1', 'a2'],
        }),
      ],
      summary: 'Reorder test',
      isDefault: false,
    };

    const result = applyEditPlan(project, plan);

    const resultIds = result.media.map((a) => a.id);
    expect(resultIds).toEqual(['a3', 'a1', 'a2']);
  });

  // Requirement 9.3: Same set of assets after reordering
  it('preserves the same set of media assets after reordering', () => {
    const seg = makeSegment({ id: 'seg-1' });
    const a1 = makeAsset({ id: 'a1', segmentId: 'seg-1' });
    const a2 = makeAsset({ id: 'a2', segmentId: 'seg-1' });
    const project = makeProject([seg], [a1, a2]);

    const plan: EditPlan = {
      segments: [
        makeSegmentEntry({
          segmentId: 'seg-1',
          shotOrder: ['a2', 'a1'],
        }),
      ],
      summary: 'Test',
      isDefault: false,
    };

    const result = applyEditPlan(project, plan);

    const originalIds = new Set(project.media.map((a) => a.id));
    const resultIds = new Set(result.media.map((a) => a.id));
    expect(resultIds).toEqual(originalIds);
  });

  // Requirement 3.2: Timing adjustments applied
  it('applies timing adjustments from adjustedDuration', () => {
    const seg = makeSegment({ id: 'seg-1', duration: 10 });
    const project = makeProject([seg], []);

    const plan: EditPlan = {
      segments: [
        makeSegmentEntry({
          segmentId: 'seg-1',
          adjustedDuration: 12,
          originalDuration: 10,
        }),
      ],
      summary: 'Timing test',
      isDefault: false,
    };

    const result = applyEditPlan(project, plan);
    // 12 is within 10% of 10 (max = 11), so it will be scaled
    // But let's check the logic: original total = 10, new total = 12, max = 11
    // 12 > 11, so it should be scaled down to 11
    expect(result.script[0].duration).toBeCloseTo(11, 5);
  });

  // Requirement 3.2: null adjustedDuration preserves original
  it('preserves original duration when adjustedDuration is null', () => {
    const seg = makeSegment({ id: 'seg-1', duration: 10 });
    const project = makeProject([seg], []);

    const plan: EditPlan = {
      segments: [
        makeSegmentEntry({
          segmentId: 'seg-1',
          adjustedDuration: null,
          originalDuration: 10,
        }),
      ],
      summary: 'No change test',
      isDefault: false,
    };

    const result = applyEditPlan(project, plan);
    expect(result.script[0].duration).toBe(10);
  });

  // Requirement 3.3, 9.4: Total duration bounded within 10%
  it('scales adjusted durations when total exceeds 10% of original', () => {
    const seg1 = makeSegment({ id: 'seg-1', duration: 10 });
    const seg2 = makeSegment({ id: 'seg-2', duration: 10 });
    const project = makeProject([seg1, seg2], []);
    // Original total = 20, max allowed = 22

    const plan: EditPlan = {
      segments: [
        makeSegmentEntry({
          segmentId: 'seg-1',
          adjustedDuration: 20, // way too much
          originalDuration: 10,
        }),
        makeSegmentEntry({
          segmentId: 'seg-2',
          adjustedDuration: 20, // way too much
          originalDuration: 10,
        }),
      ],
      summary: 'Scaling test',
      isDefault: false,
    };

    const result = applyEditPlan(project, plan);
    const totalDuration = result.script.reduce((s, seg) => s + seg.duration, 0);

    // Total should be clamped to max allowed (22)
    expect(totalDuration).toBeCloseTo(22, 5);
  });

  // Requirement 3.3: Total duration bounded below (within 10%)
  it('scales adjusted durations when total is below 90% of original', () => {
    const seg1 = makeSegment({ id: 'seg-1', duration: 10 });
    const seg2 = makeSegment({ id: 'seg-2', duration: 10 });
    const project = makeProject([seg1, seg2], []);
    // Original total = 20, min allowed = 18

    const plan: EditPlan = {
      segments: [
        makeSegmentEntry({
          segmentId: 'seg-1',
          adjustedDuration: 2, // way too short
          originalDuration: 10,
        }),
        makeSegmentEntry({
          segmentId: 'seg-2',
          adjustedDuration: 2, // way too short
          originalDuration: 10,
        }),
      ],
      summary: 'Scaling down test',
      isDefault: false,
    };

    const result = applyEditPlan(project, plan);
    const totalDuration = result.script.reduce((s, seg) => s + seg.duration, 0);

    // Total should be scaled up to min allowed (18)
    expect(totalDuration).toBeCloseTo(18, 5);
  });

  // Requirement 9.5: No-op plan identity
  it('produces equivalent project when applying default no-op plan', () => {
    const seg1 = makeSegment({ id: 'seg-1', duration: 10 });
    const seg2 = makeSegment({ id: 'seg-2', duration: 15 });
    const a1 = makeAsset({ id: 'a1', segmentId: 'seg-1' });
    const a2 = makeAsset({ id: 'a2', segmentId: 'seg-2' });
    const narr = makeNarration({ segmentId: 'seg-1' });
    const project = makeProject([seg1, seg2], [a1, a2], [narr]);

    const defaultPlan = createDefaultEditPlan(project);
    const result = applyEditPlan(project, defaultPlan);

    // Script durations should be unchanged
    expect(result.script.map((s) => s.duration)).toEqual(
      project.script.map((s) => s.duration),
    );

    // Media order should be unchanged
    expect(result.media.map((a) => a.id)).toEqual(
      project.media.map((a) => a.id),
    );

    // Narration should be unchanged
    expect(result.narration.map((n) => n.id)).toEqual(
      project.narration.map((n) => n.id),
    );
  });

  // Stores the editPlan on the returned project
  it('attaches the editPlan to the returned project', () => {
    const seg = makeSegment({ id: 'seg-1' });
    const project = makeProject([seg], []);

    const plan: EditPlan = {
      segments: [
        makeSegmentEntry({ segmentId: 'seg-1' }),
      ],
      summary: 'Attach test',
      isDefault: false,
    };

    const result = applyEditPlan(project, plan);
    expect(result.editPlan).toBeDefined();
    expect(result.editPlan!.summary).toBe('Attach test');
  });

  // Multi-segment reordering with interleaved assets
  it('correctly reorders assets across multiple segments', () => {
    const seg1 = makeSegment({ id: 'seg-1' });
    const seg2 = makeSegment({ id: 'seg-2' });
    const a1 = makeAsset({ id: 'a1', segmentId: 'seg-1' });
    const a2 = makeAsset({ id: 'a2', segmentId: 'seg-1' });
    const b1 = makeAsset({ id: 'b1', segmentId: 'seg-2' });
    const b2 = makeAsset({ id: 'b2', segmentId: 'seg-2' });
    const project = makeProject([seg1, seg2], [a1, a2, b1, b2]);

    const plan: EditPlan = {
      segments: [
        makeSegmentEntry({
          segmentId: 'seg-1',
          shotOrder: ['a2', 'a1'], // reversed
        }),
        makeSegmentEntry({
          segmentId: 'seg-2',
          shotOrder: ['b2', 'b1'], // reversed
        }),
      ],
      summary: 'Multi-segment reorder',
      isDefault: false,
    };

    const result = applyEditPlan(project, plan);

    // seg-1 assets should be reordered
    const seg1Assets = result.media.filter((a) => a.segmentId === 'seg-1');
    expect(seg1Assets.map((a) => a.id)).toEqual(['a2', 'a1']);

    // seg-2 assets should be reordered
    const seg2Assets = result.media.filter((a) => a.segmentId === 'seg-2');
    expect(seg2Assets.map((a) => a.id)).toEqual(['b2', 'b1']);
  });

  // Mixed: some segments adjusted, some not — only adjusted ones get scaled
  it('only scales adjusted segments when total exceeds bounds', () => {
    const seg1 = makeSegment({ id: 'seg-1', duration: 10 });
    const seg2 = makeSegment({ id: 'seg-2', duration: 10 });
    const project = makeProject([seg1, seg2], []);
    // Original total = 20, max = 22

    const plan: EditPlan = {
      segments: [
        makeSegmentEntry({
          segmentId: 'seg-1',
          adjustedDuration: null, // not adjusted
          originalDuration: 10,
        }),
        makeSegmentEntry({
          segmentId: 'seg-2',
          adjustedDuration: 30, // way too much
          originalDuration: 10,
        }),
      ],
      summary: 'Mixed scaling test',
      isDefault: false,
    };

    const result = applyEditPlan(project, plan);

    // seg-1 should remain at 10 (not adjusted)
    expect(result.script[0].duration).toBe(10);

    // seg-2 should be scaled: budget = 22 - 10 = 12
    expect(result.script[1].duration).toBeCloseTo(12, 5);

    // Total should be within bounds
    const total = result.script.reduce((s, seg) => s + seg.duration, 0);
    expect(total).toBeCloseTo(22, 5);
  });

  // Requirement 2.12: Minimum duration floor enforced when scaling produces sub-second values
  it('enforces minimum 1s duration when scaling would produce sub-second values', () => {
    // Create a project where scaling will produce very small durations
    // 10 segments at 10s each = 100s total, max allowed = 110s
    const segments = Array.from({ length: 10 }, (_, i) =>
      makeSegment({ id: `seg-${i}`, duration: 10 }),
    );
    const project = makeProject(segments, []);
    // Original total = 100, min allowed = 90

    // Set all segments to very small adjusted durations (e.g., 2s each = 20s total)
    // This is below minAllowed (90), so scaling up: budget = 90 - 0 = 90
    // But let's create a scenario where scaling DOWN produces sub-second:
    // Set one segment to a very small duration, and the rest to huge values
    // to force the scale factor to be very small.
    const plan: EditPlan = {
      segments: segments.map((seg, i) =>
        makeSegmentEntry({
          segmentId: seg.id,
          adjustedDuration: i === 0 ? 2 : 100, // seg-0 = 2s, rest = 100s each
          originalDuration: 10,
        }),
      ),
      summary: 'Sub-second floor test',
      isDefault: false,
    };
    // New total = 2 + 9*100 = 902, maxAllowed = 110
    // scaleFactor = 110 / 902 ≈ 0.122
    // seg-0 duration = 2 * 0.122 = 0.244 → should be clamped to 1

    const result = applyEditPlan(project, plan);

    // seg-0 should be at least 1s (the floor)
    expect(result.script[0].duration).toBeGreaterThanOrEqual(1);
    // Verify no segment is below 1s
    for (const seg of result.script) {
      expect(seg.duration).toBeGreaterThanOrEqual(1);
    }
  });

  // Requirement 3.12: Scaling that produces above-1s durations should not be modified
  it('does not modify durations that are already above 1s after scaling', () => {
    const seg1 = makeSegment({ id: 'seg-1', duration: 10 });
    const seg2 = makeSegment({ id: 'seg-2', duration: 10 });
    const project = makeProject([seg1, seg2], []);
    // Original total = 20, max allowed = 22

    const plan: EditPlan = {
      segments: [
        makeSegmentEntry({
          segmentId: 'seg-1',
          adjustedDuration: 15,
          originalDuration: 10,
        }),
        makeSegmentEntry({
          segmentId: 'seg-2',
          adjustedDuration: 15,
          originalDuration: 10,
        }),
      ],
      summary: 'Above-floor scaling test',
      isDefault: false,
    };
    // New total = 30, maxAllowed = 22
    // scaleFactor = 22 / 30 ≈ 0.733
    // seg-1 = 15 * 0.733 = 11, seg-2 = 15 * 0.733 = 11
    // Both well above 1s, so Math.max(1, ...) should not change anything

    const result = applyEditPlan(project, plan);

    // Both durations should be ~11s (scaled proportionally to fit 22s total)
    expect(result.script[0].duration).toBeCloseTo(11, 1);
    expect(result.script[1].duration).toBeCloseTo(11, 1);

    // Total should be clamped to max allowed (22)
    const total = result.script.reduce((s, seg) => s + seg.duration, 0);
    expect(total).toBeCloseTo(22, 5);
  });

  // Within-bounds adjustments should not be scaled
  it('does not scale when total is within 10% bounds', () => {
    const seg1 = makeSegment({ id: 'seg-1', duration: 10 });
    const seg2 = makeSegment({ id: 'seg-2', duration: 10 });
    const project = makeProject([seg1, seg2], []);
    // Original total = 20, range = [18, 22]

    const plan: EditPlan = {
      segments: [
        makeSegmentEntry({
          segmentId: 'seg-1',
          adjustedDuration: 11, // +1
          originalDuration: 10,
        }),
        makeSegmentEntry({
          segmentId: 'seg-2',
          adjustedDuration: 10, // same
          originalDuration: 10,
        }),
      ],
      summary: 'Within bounds test',
      isDefault: false,
    };

    const result = applyEditPlan(project, plan);

    // Total = 21, which is within [18, 22], so no scaling
    expect(result.script[0].duration).toBe(11);
    expect(result.script[1].duration).toBe(10);
  });
});
