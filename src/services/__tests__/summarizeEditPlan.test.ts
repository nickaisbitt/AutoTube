import { describe, it, expect, beforeEach } from 'vitest';
import { summarizeEditPlan, createDefaultEditPlan } from '../aiEditor';
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
    segmentId: overrides.segmentId,
    type: 'image',
    url: `https://example.com/${id}.jpg`,
    alt: 'generic image',
    source: 'DuckDuckGo',
    ...(overrides as Omit<Partial<MediaAsset>, 'segmentId'>),
  };
}

function makeNarration(
  overrides: Partial<NarrationClip> & { segmentId: string },
): NarrationClip {
  const id = overrides.id ?? `narr-${++narrationCounter}`;
  return {
    id,
    segmentId: overrides.segmentId,
    text: 'Some narration text.',
    voice: 'default',
    duration: 10,
    status: 'ready',
    ...(overrides as Omit<Partial<NarrationClip>, 'segmentId'>),
  };
}

function makeProject(
  segments: ScriptSegment[],
  assets: MediaAsset[],
  narration: NarrationClip[] = [],
): VideoProject {
  return {
    id: 'proj-1',
    title: 'Test Project',
    topic: 'Test Topic',
    style: 'business_insider',
    targetDuration: 60,
    script: segments,
    media: assets,
    narration,
    version: 1,
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

describe('summarizeEditPlan', () => {
  // Requirement 11.1: Default plan returns no-changes message
  it('returns no-changes message for default plan', () => {
    const seg = makeSegment({ id: 'seg-1' });
    const project = makeProject([seg], []);
    const plan = createDefaultEditPlan(project);

    const summary = summarizeEditPlan(plan, project);
    expect(summary).toBe('No changes — default plan applied.');
  });

  // Requirement 11.1: Counts reordered segments
  it('counts segments with reordered shots', () => {
    const seg = makeSegment({ id: 'seg-1' });
    const a1 = makeAsset({ id: 'a1', segmentId: 'seg-1' });
    const a2 = makeAsset({ id: 'a2', segmentId: 'seg-1' });
    const project = makeProject([seg], [a1, a2]);

    const plan: EditPlan = {
      segments: [
        makeSegmentEntry({
          segmentId: 'seg-1',
          shotOrder: ['a2', 'a1'], // reversed from original [a1, a2]
        }),
      ],
      summary: 'Test',
      isDefault: false,
    };

    const summary = summarizeEditPlan(plan, project);
    expect(summary).toContain('Reordered 1 segment');
  });

  // Requirement 11.1: Counts timing adjustments
  it('counts segments with adjusted timing', () => {
    const seg1 = makeSegment({ id: 'seg-1' });
    const seg2 = makeSegment({ id: 'seg-2' });
    const project = makeProject([seg1, seg2], []);

    const plan: EditPlan = {
      segments: [
        makeSegmentEntry({ segmentId: 'seg-1', adjustedDuration: 12 }),
        makeSegmentEntry({ segmentId: 'seg-2', adjustedDuration: 8 }),
      ],
      summary: 'Test',
      isDefault: false,
    };

    const summary = summarizeEditPlan(plan, project);
    expect(summary.toLowerCase()).toContain('adjusted 2 timings');
  });

  // Requirement 11.1: Counts replacement suggestions
  it('counts total media replacement suggestions', () => {
    const seg = makeSegment({ id: 'seg-1' });
    const a1 = makeAsset({ id: 'a1', segmentId: 'seg-1' });
    const project = makeProject([seg], [a1]);

    const plan: EditPlan = {
      segments: [
        makeSegmentEntry({
          segmentId: 'seg-1',
          shotOrder: ['a1'],
          replacementSuggestions: [
            { assetId: 'a1', reason: 'Low quality', alternativeQueries: ['q1', 'q2'] },
            { assetId: 'a1', reason: 'Off topic', alternativeQueries: ['q3', 'q4'] },
          ],
        }),
      ],
      summary: 'Test',
      isDefault: false,
    };

    const summary = summarizeEditPlan(plan, project);
    expect(summary.toLowerCase()).toContain('suggested 2 media replacement');
  });

  // Requirement 11.1: Counts transition changes
  it('counts segments with non-default transitions', () => {
    const seg1 = makeSegment({ id: 'seg-1' });
    const seg2 = makeSegment({ id: 'seg-2' });
    const seg3 = makeSegment({ id: 'seg-3' });
    const project = makeProject([seg1, seg2, seg3], []);

    const plan: EditPlan = {
      segments: [
        makeSegmentEntry({ segmentId: 'seg-1', transition: null }), // default for first
        makeSegmentEntry({
          segmentId: 'seg-2',
          transition: { type: 'cut', durationMs: 0 }, // non-default
        }),
        makeSegmentEntry({
          segmentId: 'seg-3',
          transition: { type: 'crossfade', durationMs: 500 }, // default
        }),
      ],
      summary: 'Test',
      isDefault: false,
    };

    const summary = summarizeEditPlan(plan, project);
    expect(summary).toContain('hanged 1 transition');
  });

  // Requirement 11.1: Combined summary with multiple change types
  it('produces combined summary with all change types', () => {
    const seg1 = makeSegment({ id: 'seg-1' });
    const seg2 = makeSegment({ id: 'seg-2' });
    const a1 = makeAsset({ id: 'a1', segmentId: 'seg-1' });
    const a2 = makeAsset({ id: 'a2', segmentId: 'seg-1' });
    const project = makeProject([seg1, seg2], [a1, a2]);

    const plan: EditPlan = {
      segments: [
        makeSegmentEntry({
          segmentId: 'seg-1',
          shotOrder: ['a2', 'a1'], // reordered
          adjustedDuration: 12,    // timing adjusted
          replacementSuggestions: [
            { assetId: 'a1', reason: 'Low quality', alternativeQueries: ['q1', 'q2'] },
          ],
        }),
        makeSegmentEntry({
          segmentId: 'seg-2',
          transition: { type: 'dissolve', durationMs: 300 }, // non-default
        }),
      ],
      summary: 'Test',
      isDefault: false,
    };

    const summary = summarizeEditPlan(plan, project);
    expect(summary).toContain('Reordered 1 segment');
    expect(summary).toContain('adjusted 1 timing');
    expect(summary).toContain('suggested 1 media replacement');
    expect(summary).toContain('changed 1 transition');
    expect(summary).toMatch(/\.$/); // ends with period
  });

  // Edge case: non-default plan with no actual changes
  it('returns no-changes-detected for non-default plan with no changes', () => {
    const seg = makeSegment({ id: 'seg-1' });
    const a1 = makeAsset({ id: 'a1', segmentId: 'seg-1' });
    const project = makeProject([seg], [a1]);

    const plan: EditPlan = {
      segments: [
        makeSegmentEntry({
          segmentId: 'seg-1',
          shotOrder: ['a1'], // same as original
          adjustedDuration: null,
          transition: null, // default for first segment
        }),
      ],
      summary: 'Test',
      isDefault: false,
    };

    const summary = summarizeEditPlan(plan, project);
    expect(summary).toBe('No changes detected.');
  });
});
