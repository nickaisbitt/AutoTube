import { describe, it, expect, beforeEach } from 'vitest';
import { createDefaultEditPlan, validateEditPlanResponse } from '../aiEditor';
import type {
  VideoProject,
  ScriptSegment,
  MediaAsset,
  NarrationClip,
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

beforeEach(() => {
  segCounter = 0;
  assetCounter = 0;
  narrationCounter = 0;
});

// ── createDefaultEditPlan ────────────────────────────────────────────────────

describe('createDefaultEditPlan', () => {
  // Requirement 8.4: Default plan has isDefault: true with no modifications
  it('produces a plan with isDefault: true', () => {
    const seg = makeSegment({ id: 'seg-1' });
    const project = makeProject([seg], []);

    const plan = createDefaultEditPlan(project);

    expect(plan.isDefault).toBe(true);
  });

  it('sets adjustedDuration to null for every segment', () => {
    const seg1 = makeSegment({ id: 'seg-1', duration: 10 });
    const seg2 = makeSegment({ id: 'seg-2', duration: 15 });
    const project = makeProject([seg1, seg2], []);

    const plan = createDefaultEditPlan(project);

    for (const entry of plan.segments) {
      expect(entry.adjustedDuration).toBeNull();
    }
  });

  it('preserves original shot order for each segment', () => {
    const seg = makeSegment({ id: 'seg-1' });
    const a1 = makeAsset({ id: 'a1', segmentId: 'seg-1' });
    const a2 = makeAsset({ id: 'a2', segmentId: 'seg-1' });
    const a3 = makeAsset({ id: 'a3', segmentId: 'seg-1' });
    const project = makeProject([seg], [a1, a2, a3]);

    const plan = createDefaultEditPlan(project);

    expect(plan.segments[0].shotOrder).toEqual(['a1', 'a2', 'a3']);
  });

  it('generates Ken Burns params for each asset with alternating pan directions', () => {
    const seg = makeSegment({ id: 'seg-1' });
    const a1 = makeAsset({ id: 'a1', segmentId: 'seg-1' });
    const a2 = makeAsset({ id: 'a2', segmentId: 'seg-1' });
    const a3 = makeAsset({ id: 'a3', segmentId: 'seg-1' });
    const project = makeProject([seg], [a1, a2, a3]);

    const plan = createDefaultEditPlan(project);
    const kb = plan.segments[0].kenBurns;

    // Each asset should have Ken Burns params
    expect(kb['a1']).toBeDefined();
    expect(kb['a2']).toBeDefined();
    expect(kb['a3']).toBeDefined();

    // Zoom values should be in valid range
    for (const assetId of ['a1', 'a2', 'a3']) {
      expect(kb[assetId].zoomStart).toBeGreaterThanOrEqual(1.0);
      expect(kb[assetId].zoomStart).toBeLessThanOrEqual(1.25);
      expect(kb[assetId].zoomEnd).toBeGreaterThanOrEqual(1.0);
      expect(kb[assetId].zoomEnd).toBeLessThanOrEqual(1.25);
    }

    // Consecutive assets should have distinct pan directions
    expect(
      kb['a1'].panDirectionX === kb['a2'].panDirectionX &&
      kb['a1'].panDirectionY === kb['a2'].panDirectionY,
    ).toBe(false);
  });

  it('sets null transition for first segment and crossfade for others', () => {
    const seg1 = makeSegment({ id: 'seg-1' });
    const seg2 = makeSegment({ id: 'seg-2' });
    const seg3 = makeSegment({ id: 'seg-3' });
    const project = makeProject([seg1, seg2, seg3], []);

    const plan = createDefaultEditPlan(project);

    expect(plan.segments[0].transition).toBeNull();
    expect(plan.segments[1].transition).toEqual({ type: 'crossfade', durationMs: 500 });
    expect(plan.segments[2].transition).toEqual({ type: 'crossfade', durationMs: 500 });
  });

  it('records originalDuration matching the segment duration', () => {
    const seg = makeSegment({ id: 'seg-1', duration: 42 });
    const project = makeProject([seg], []);

    const plan = createDefaultEditPlan(project);

    expect(plan.segments[0].originalDuration).toBe(42);
  });

  it('has empty replacementSuggestions for every segment', () => {
    const seg = makeSegment({ id: 'seg-1' });
    const a1 = makeAsset({ id: 'a1', segmentId: 'seg-1' });
    const project = makeProject([seg], [a1]);

    const plan = createDefaultEditPlan(project);

    expect(plan.segments[0].replacementSuggestions).toEqual([]);
  });

  it('creates one entry per script segment', () => {
    const seg1 = makeSegment({ id: 'seg-1' });
    const seg2 = makeSegment({ id: 'seg-2' });
    const seg3 = makeSegment({ id: 'seg-3' });
    const project = makeProject([seg1, seg2, seg3], []);

    const plan = createDefaultEditPlan(project);

    expect(plan.segments).toHaveLength(3);
    expect(plan.segments.map((s) => s.segmentId)).toEqual(['seg-1', 'seg-2', 'seg-3']);
  });
});

// ── validateEditPlanResponse ─────────────────────────────────────────────────

describe('validateEditPlanResponse', () => {
  // Requirement 10.4: Rejects completely invalid JSON (returns null)
  describe('rejects completely invalid input', () => {
    const seg = makeSegment({ id: 'seg-1' });
    const project = makeProject([seg], []);

    it('returns null for null input', () => {
      expect(validateEditPlanResponse(null, project)).toBeNull();
    });

    it('returns null for undefined input', () => {
      expect(validateEditPlanResponse(undefined, project)).toBeNull();
    });

    it('returns null for string input', () => {
      expect(validateEditPlanResponse('hello', project)).toBeNull();
    });

    it('returns null for number input', () => {
      expect(validateEditPlanResponse(42, project)).toBeNull();
    });

    it('returns null for array input', () => {
      expect(validateEditPlanResponse([1, 2, 3], project)).toBeNull();
    });

    it('returns null for object without segments array', () => {
      expect(validateEditPlanResponse({ foo: 'bar' }, project)).toBeNull();
    });

    it('returns null for object with non-array segments', () => {
      expect(validateEditPlanResponse({ segments: 'not-array' }, project)).toBeNull();
    });
  });

  // Requirement 10.5: Merges partial JSON with defaults
  describe('merges partial JSON with defaults', () => {
    it('fills in missing fields for segment entries that have a valid segmentId', () => {
      const seg = makeSegment({ id: 'seg-1', duration: 10 });
      const a1 = makeAsset({ id: 'a1', segmentId: 'seg-1' });
      const project = makeProject([seg], [a1]);

      const raw = {
        segments: [
          { segmentId: 'seg-1' }, // only segmentId, everything else missing
        ],
      };

      const result = validateEditPlanResponse(raw, project);

      expect(result).not.toBeNull();
      expect(result!.isDefault).toBe(false);
      expect(result!.segments).toHaveLength(1);

      const entry = result!.segments[0];
      expect(entry.segmentId).toBe('seg-1');
      // Should fall back to default shot order
      expect(entry.shotOrder).toEqual(['a1']);
      // Should fall back to default adjustedDuration
      expect(entry.adjustedDuration).toBeNull();
      // Should have default Ken Burns params
      expect(entry.kenBurns['a1']).toBeDefined();
      expect(entry.kenBurns['a1'].zoomStart).toBeGreaterThanOrEqual(1.0);
      // Should have default caption settings
      expect(entry.captionSettings).toBeDefined();
      expect(entry.captionSettings.wordsPerWindow).toBeGreaterThan(0);
    });

    it('adds default entries for segments not covered by raw response', () => {
      const seg1 = makeSegment({ id: 'seg-1' });
      const seg2 = makeSegment({ id: 'seg-2' });
      const project = makeProject([seg1, seg2], []);

      const raw = {
        segments: [
          { segmentId: 'seg-1' }, // only covers seg-1
        ],
      };

      const result = validateEditPlanResponse(raw, project);

      expect(result).not.toBeNull();
      expect(result!.segments).toHaveLength(2);
      expect(result!.segments[0].segmentId).toBe('seg-1');
      expect(result!.segments[1].segmentId).toBe('seg-2');
    });

    it('skips entries with invalid segmentId', () => {
      const seg = makeSegment({ id: 'seg-1' });
      const project = makeProject([seg], []);

      const raw = {
        segments: [
          { segmentId: 'nonexistent' },
          { segmentId: 'seg-1' },
        ],
      };

      const result = validateEditPlanResponse(raw, project);

      expect(result).not.toBeNull();
      expect(result!.segments).toHaveLength(1);
      expect(result!.segments[0].segmentId).toBe('seg-1');
    });

    it('uses default summary when raw summary is missing', () => {
      const seg = makeSegment({ id: 'seg-1' });
      const project = makeProject([seg], []);

      const raw = { segments: [{ segmentId: 'seg-1' }] };

      const result = validateEditPlanResponse(raw, project);

      expect(result).not.toBeNull();
      expect(result!.summary).toBe('AI-generated edit plan.');
    });

    it('preserves valid summary from raw input', () => {
      const seg = makeSegment({ id: 'seg-1' });
      const project = makeProject([seg], []);

      const raw = {
        segments: [{ segmentId: 'seg-1' }],
        summary: 'Custom AI summary.',
      };

      const result = validateEditPlanResponse(raw, project);

      expect(result).not.toBeNull();
      expect(result!.summary).toBe('Custom AI summary.');
    });
  });

  // Requirement 8.3: Clamps out-of-range Ken Burns values
  describe('clamps out-of-range Ken Burns values', () => {
    it('clamps zoomStart above 1.25 down to 1.25', () => {
      const seg = makeSegment({ id: 'seg-1' });
      const a1 = makeAsset({ id: 'a1', segmentId: 'seg-1' });
      const project = makeProject([seg], [a1]);

      const raw = {
        segments: [
          {
            segmentId: 'seg-1',
            shotOrder: ['a1'],
            kenBurns: {
              a1: { zoomStart: 2.0, zoomEnd: 1.5, panDirectionX: 0, panDirectionY: 0 },
            },
          },
        ],
      };

      const result = validateEditPlanResponse(raw, project);

      expect(result).not.toBeNull();
      expect(result!.segments[0].kenBurns['a1'].zoomStart).toBe(1.25);
      expect(result!.segments[0].kenBurns['a1'].zoomEnd).toBe(1.25);
    });

    it('clamps zoomStart below 1.0 up to 1.0', () => {
      const seg = makeSegment({ id: 'seg-1' });
      const a1 = makeAsset({ id: 'a1', segmentId: 'seg-1' });
      const project = makeProject([seg], [a1]);

      const raw = {
        segments: [
          {
            segmentId: 'seg-1',
            shotOrder: ['a1'],
            kenBurns: {
              a1: { zoomStart: 0.5, zoomEnd: 0.8, panDirectionX: 0, panDirectionY: 0 },
            },
          },
        ],
      };

      const result = validateEditPlanResponse(raw, project);

      expect(result).not.toBeNull();
      expect(result!.segments[0].kenBurns['a1'].zoomStart).toBe(1.0);
      expect(result!.segments[0].kenBurns['a1'].zoomEnd).toBe(1.0);
    });

    it('clamps panDirection values to [-1, 1]', () => {
      const seg = makeSegment({ id: 'seg-1' });
      const a1 = makeAsset({ id: 'a1', segmentId: 'seg-1' });
      const project = makeProject([seg], [a1]);

      const raw = {
        segments: [
          {
            segmentId: 'seg-1',
            shotOrder: ['a1'],
            kenBurns: {
              a1: { zoomStart: 1.1, zoomEnd: 1.1, panDirectionX: 5, panDirectionY: -3 },
            },
          },
        ],
      };

      const result = validateEditPlanResponse(raw, project);

      expect(result).not.toBeNull();
      expect(result!.segments[0].kenBurns['a1'].panDirectionX).toBe(1);
      expect(result!.segments[0].kenBurns['a1'].panDirectionY).toBe(-1);
    });

    it('passes through valid Ken Burns values unchanged', () => {
      const seg = makeSegment({ id: 'seg-1' });
      const a1 = makeAsset({ id: 'a1', segmentId: 'seg-1' });
      const project = makeProject([seg], [a1]);

      const raw = {
        segments: [
          {
            segmentId: 'seg-1',
            shotOrder: ['a1'],
            kenBurns: {
              a1: { zoomStart: 1.1, zoomEnd: 1.2, panDirectionX: -0.5, panDirectionY: 0.5 },
            },
          },
        ],
      };

      const result = validateEditPlanResponse(raw, project);

      expect(result).not.toBeNull();
      const kb = result!.segments[0].kenBurns['a1'];
      expect(kb.zoomStart).toBe(1.1);
      expect(kb.zoomEnd).toBe(1.2);
      expect(kb.panDirectionX).toBe(-0.5);
      expect(kb.panDirectionY).toBe(0.5);
    });
  });

  // Requirement 10.5: Replaces invalid transition types with 'crossfade'
  describe('validates transition types', () => {
    it('replaces invalid transition type with crossfade', () => {
      const seg1 = makeSegment({ id: 'seg-1' });
      const seg2 = makeSegment({ id: 'seg-2' });
      const project = makeProject([seg1, seg2], []);

      const raw = {
        segments: [
          { segmentId: 'seg-1' },
          {
            segmentId: 'seg-2',
            transition: { type: 'fade', durationMs: 300 }, // 'fade' is not valid
          },
        ],
      };

      const result = validateEditPlanResponse(raw, project);

      expect(result).not.toBeNull();
      // seg-2 is not the first segment, so it should have a transition
      expect(result!.segments[1].transition).not.toBeNull();
      expect(result!.segments[1].transition!.type).toBe('crossfade');
      expect(result!.segments[1].transition!.durationMs).toBe(300);
    });

    it('preserves valid transition types', () => {
      const seg1 = makeSegment({ id: 'seg-1' });
      const seg2 = makeSegment({ id: 'seg-2' });
      const project = makeProject([seg1, seg2], []);

      const raw = {
        segments: [
          { segmentId: 'seg-1' },
          {
            segmentId: 'seg-2',
            transition: { type: 'cut', durationMs: 0 },
          },
        ],
      };

      const result = validateEditPlanResponse(raw, project);

      expect(result).not.toBeNull();
      expect(result!.segments[1].transition!.type).toBe('cut');
    });

    it('forces null transition for first segment even if raw provides one', () => {
      const seg1 = makeSegment({ id: 'seg-1' });
      const project = makeProject([seg1], []);

      const raw = {
        segments: [
          {
            segmentId: 'seg-1',
            transition: { type: 'dissolve', durationMs: 500 },
          },
        ],
      };

      const result = validateEditPlanResponse(raw, project);

      expect(result).not.toBeNull();
      expect(result!.segments[0].transition).toBeNull();
    });
  });

  // Requirement 8.3: Validates shotOrder contains exactly the same asset IDs
  describe('validates shotOrder', () => {
    it('accepts valid shotOrder with same asset IDs in different order', () => {
      const seg = makeSegment({ id: 'seg-1' });
      const a1 = makeAsset({ id: 'a1', segmentId: 'seg-1' });
      const a2 = makeAsset({ id: 'a2', segmentId: 'seg-1' });
      const project = makeProject([seg], [a1, a2]);

      const raw = {
        segments: [
          {
            segmentId: 'seg-1',
            shotOrder: ['a2', 'a1'], // valid reorder
          },
        ],
      };

      const result = validateEditPlanResponse(raw, project);

      expect(result).not.toBeNull();
      expect(result!.segments[0].shotOrder).toEqual(['a2', 'a1']);
    });

    it('falls back to default order when shotOrder has extra IDs', () => {
      const seg = makeSegment({ id: 'seg-1' });
      const a1 = makeAsset({ id: 'a1', segmentId: 'seg-1' });
      const project = makeProject([seg], [a1]);

      const raw = {
        segments: [
          {
            segmentId: 'seg-1',
            shotOrder: ['a1', 'a99'], // a99 doesn't exist
          },
        ],
      };

      const result = validateEditPlanResponse(raw, project);

      expect(result).not.toBeNull();
      expect(result!.segments[0].shotOrder).toEqual(['a1']); // falls back to default
    });

    it('falls back to default order when shotOrder has missing IDs', () => {
      const seg = makeSegment({ id: 'seg-1' });
      const a1 = makeAsset({ id: 'a1', segmentId: 'seg-1' });
      const a2 = makeAsset({ id: 'a2', segmentId: 'seg-1' });
      const project = makeProject([seg], [a1, a2]);

      const raw = {
        segments: [
          {
            segmentId: 'seg-1',
            shotOrder: ['a1'], // missing a2
          },
        ],
      };

      const result = validateEditPlanResponse(raw, project);

      expect(result).not.toBeNull();
      expect(result!.segments[0].shotOrder).toEqual(['a1', 'a2']); // falls back to default
    });

    it('falls back to default order when shotOrder has duplicates', () => {
      const seg = makeSegment({ id: 'seg-1' });
      const a1 = makeAsset({ id: 'a1', segmentId: 'seg-1' });
      const a2 = makeAsset({ id: 'a2', segmentId: 'seg-1' });
      const project = makeProject([seg], [a1, a2]);

      const raw = {
        segments: [
          {
            segmentId: 'seg-1',
            shotOrder: ['a1', 'a1'], // duplicate
          },
        ],
      };

      const result = validateEditPlanResponse(raw, project);

      expect(result).not.toBeNull();
      expect(result!.segments[0].shotOrder).toEqual(['a1', 'a2']); // falls back to default
    });

    // Bug 13 fix: valid shotOrder accepted via explicit per-element mapping
    it('accepts valid shotOrder and produces properly typed string array', () => {
      const seg = makeSegment({ id: 'seg-1' });
      const a1 = makeAsset({ id: 'a1', segmentId: 'seg-1' });
      const a2 = makeAsset({ id: 'a2', segmentId: 'seg-1' });
      const a3 = makeAsset({ id: 'a3', segmentId: 'seg-1' });
      const project = makeProject([seg], [a1, a2, a3]);

      const raw = {
        segments: [
          {
            segmentId: 'seg-1',
            shotOrder: ['a3', 'a1', 'a2'], // valid reorder of all 3 assets
          },
        ],
      };

      const result = validateEditPlanResponse(raw, project);

      expect(result).not.toBeNull();
      expect(result!.segments[0].shotOrder).toEqual(['a3', 'a1', 'a2']);
      // Verify every element is a string (not just cast)
      for (const id of result!.segments[0].shotOrder) {
        expect(typeof id).toBe('string');
      }
    });

    // Bug 13 fix: shotOrder with non-string elements falls back to default
    it('falls back to default order when shotOrder contains non-string elements', () => {
      const seg = makeSegment({ id: 'seg-1' });
      const a1 = makeAsset({ id: 'a1', segmentId: 'seg-1' });
      const a2 = makeAsset({ id: 'a2', segmentId: 'seg-1' });
      const project = makeProject([seg], [a1, a2]);

      const raw = {
        segments: [
          {
            segmentId: 'seg-1',
            shotOrder: [42, true], // non-string elements
          },
        ],
      };

      const result = validateEditPlanResponse(raw, project);

      expect(result).not.toBeNull();
      // Should fall back to default order since elements are not strings
      expect(result!.segments[0].shotOrder).toEqual(['a1', 'a2']);
    });

    it('falls back to default order when shotOrder mixes strings and non-strings', () => {
      const seg = makeSegment({ id: 'seg-1' });
      const a1 = makeAsset({ id: 'a1', segmentId: 'seg-1' });
      const a2 = makeAsset({ id: 'a2', segmentId: 'seg-1' });
      const project = makeProject([seg], [a1, a2]);

      const raw = {
        segments: [
          {
            segmentId: 'seg-1',
            shotOrder: ['a1', 123], // mixed types
          },
        ],
      };

      const result = validateEditPlanResponse(raw, project);

      expect(result).not.toBeNull();
      // Should fall back to default order since not all elements are strings
      expect(result!.segments[0].shotOrder).toEqual(['a1', 'a2']);
    });
  });

  // Validates replacement suggestions
  describe('validates replacement suggestions', () => {
    it('preserves valid replacement suggestions', () => {
      const seg = makeSegment({ id: 'seg-1' });
      const a1 = makeAsset({ id: 'a1', segmentId: 'seg-1' });
      const project = makeProject([seg], [a1]);

      const raw = {
        segments: [
          {
            segmentId: 'seg-1',
            shotOrder: ['a1'],
            replacementSuggestions: [
              { assetId: 'a1', reason: 'Low quality', alternativeQueries: ['q1', 'q2'] },
            ],
          },
        ],
      };

      const result = validateEditPlanResponse(raw, project);

      expect(result).not.toBeNull();
      expect(result!.segments[0].replacementSuggestions).toHaveLength(1);
      expect(result!.segments[0].replacementSuggestions[0].assetId).toBe('a1');
    });

    it('filters out malformed replacement suggestions', () => {
      const seg = makeSegment({ id: 'seg-1' });
      const a1 = makeAsset({ id: 'a1', segmentId: 'seg-1' });
      const project = makeProject([seg], [a1]);

      const raw = {
        segments: [
          {
            segmentId: 'seg-1',
            shotOrder: ['a1'],
            replacementSuggestions: [
              { assetId: 123, reason: 'bad' }, // invalid: assetId not string, missing alternativeQueries
              { assetId: 'a1', reason: 'Low quality', alternativeQueries: ['q1', 'q2'] }, // valid
            ],
          },
        ],
      };

      const result = validateEditPlanResponse(raw, project);

      expect(result).not.toBeNull();
      expect(result!.segments[0].replacementSuggestions).toHaveLength(1);
      expect(result!.segments[0].replacementSuggestions[0].assetId).toBe('a1');
    });
  });

  // Segments are sorted in project script order
  describe('output ordering', () => {
    it('sorts validated segments to match project script order', () => {
      const seg1 = makeSegment({ id: 'seg-1' });
      const seg2 = makeSegment({ id: 'seg-2' });
      const seg3 = makeSegment({ id: 'seg-3' });
      const project = makeProject([seg1, seg2, seg3], []);

      // Provide segments in reverse order
      const raw = {
        segments: [
          { segmentId: 'seg-3' },
          { segmentId: 'seg-1' },
          { segmentId: 'seg-2' },
        ],
      };

      const result = validateEditPlanResponse(raw, project);

      expect(result).not.toBeNull();
      expect(result!.segments.map((s) => s.segmentId)).toEqual([
        'seg-1',
        'seg-2',
        'seg-3',
      ]);
    });
  });

  // Validates caption settings
  describe('validates caption settings', () => {
    it('clamps wordsPerWindow to valid range', () => {
      const seg = makeSegment({ id: 'seg-1' });
      const project = makeProject([seg], []);

      const raw = {
        segments: [
          {
            segmentId: 'seg-1',
            captionSettings: { wordsPerWindow: 50, displayDurationMs: 3000, isFastPaced: false },
          },
        ],
      };

      const result = validateEditPlanResponse(raw, project);

      expect(result).not.toBeNull();
      expect(result!.segments[0].captionSettings.wordsPerWindow).toBeLessThanOrEqual(20);
    });

    it('clamps displayDurationMs to valid range', () => {
      const seg = makeSegment({ id: 'seg-1' });
      const project = makeProject([seg], []);

      const raw = {
        segments: [
          {
            segmentId: 'seg-1',
            captionSettings: { wordsPerWindow: 8, displayDurationMs: 100, isFastPaced: false },
          },
        ],
      };

      const result = validateEditPlanResponse(raw, project);

      expect(result).not.toBeNull();
      expect(result!.segments[0].captionSettings.displayDurationMs).toBeGreaterThanOrEqual(500);
    });
  });

  // Duplicate segment entries
  describe('handles duplicate segment entries', () => {
    it('uses only the first entry for a duplicated segmentId', () => {
      const seg = makeSegment({ id: 'seg-1' });
      const a1 = makeAsset({ id: 'a1', segmentId: 'seg-1' });
      const project = makeProject([seg], [a1]);

      const raw = {
        segments: [
          {
            segmentId: 'seg-1',
            rationale: 'First entry',
            shotOrder: ['a1'],
          },
          {
            segmentId: 'seg-1',
            rationale: 'Duplicate entry',
            shotOrder: ['a1'],
          },
        ],
      };

      const result = validateEditPlanResponse(raw, project);

      expect(result).not.toBeNull();
      expect(result!.segments).toHaveLength(1);
      expect(result!.segments[0].rationale).toBe('First entry');
    });
  });
});

// ── buildEditPrompt & runAIEditPass ──────────────────────────────────────────

import { vi } from 'vitest';
import { buildEditPrompt, runAIEditPass } from '../aiEditor';

vi.mock('../../utils/fetchWithTimeout', () => ({
  fetchWithTimeout: vi.fn(),
}));

import { fetchWithTimeout } from '../../utils/fetchWithTimeout';
const mockFetch = vi.mocked(fetchWithTimeout);

describe('buildEditPrompt', () => {
  beforeEach(() => {
    segCounter = 0;
    assetCounter = 0;
    narrationCounter = 0;
  });

  // Requirement 10.1: Prompt includes all project data
  it('includes segment titles, asset IDs, and narration durations in the prompt', () => {
    const seg1 = makeSegment({ id: 'seg-1', title: 'The Rise of AI', duration: 12 });
    const seg2 = makeSegment({ id: 'seg-2', title: 'Market Impact', duration: 8 });
    const a1 = makeAsset({ id: 'asset-alpha', segmentId: 'seg-1' });
    const a2 = makeAsset({ id: 'asset-beta', segmentId: 'seg-2' });
    const n1 = makeNarration({ segmentId: 'seg-1', duration: 11.5 });
    const n2 = makeNarration({ segmentId: 'seg-2', duration: 7.2 });
    const project = makeProject([seg1, seg2], [a1, a2], [n1, n2]);

    const { system, user } = buildEditPrompt(project);
    const combined = system + user;

    // Segment titles
    expect(combined).toContain('The Rise of AI');
    expect(combined).toContain('Market Impact');

    // Asset IDs
    expect(combined).toContain('asset-alpha');
    expect(combined).toContain('asset-beta');

    // Narration durations
    expect(combined).toContain('11.5');
    expect(combined).toContain('7.2');
  });

  it('includes style-specific transition preferences for warfront style', () => {
    const seg = makeSegment({ id: 'seg-1' });
    const project = makeProject([seg], []);
    project.style = 'warfront';

    const { system } = buildEditPrompt(project);

    expect(system).toContain('event');
    expect(system).toContain('data');
    expect(system).toContain('cut');
  });

  it('includes style-specific transition preferences for documentary style', () => {
    const seg = makeSegment({ id: 'seg-1' });
    const project = makeProject([seg], []);
    project.style = 'documentary';

    const { system } = buildEditPrompt(project);

    expect(system).toContain('event');
    expect(system).toContain('data');
    expect(system).toContain('cut');
  });

  it('does not include warfront/documentary transition note for business_insider style', () => {
    const seg = makeSegment({ id: 'seg-1' });
    const project = makeProject([seg], []);
    project.style = 'business_insider';

    const { system } = buildEditPrompt(project);

    // The style-specific note about "event" or "data" beats preferring "cut" should not appear
    expect(system).not.toContain('prefer "cut" transitions for immediacy');
  });
});

describe('runAIEditPass', () => {
  beforeEach(() => {
    segCounter = 0;
    assetCounter = 0;
    narrationCounter = 0;
    vi.clearAllMocks();
  });

  function makeTestProject(): ReturnType<typeof makeProject> {
    const seg1 = makeSegment({ id: 'seg-1', duration: 10 });
    const seg2 = makeSegment({ id: 'seg-2', duration: 15 });
    const a1 = makeAsset({ id: 'a1', segmentId: 'seg-1' });
    const a2 = makeAsset({ id: 'a2', segmentId: 'seg-2' });
    const n1 = makeNarration({ segmentId: 'seg-1', duration: 10 });
    const n2 = makeNarration({ segmentId: 'seg-2', duration: 15 });
    return makeProject([seg1, seg2], [a1, a2], [n1, n2]);
  }

  // Requirement 10.4: Returns default plan when LLM returns garbage JSON
  it('returns default plan when LLM returns garbage JSON', async () => {
    const project = makeTestProject();

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'not json at all' } }],
      }),
    } as unknown as Response);

    const { editPlan } = await runAIEditPass(project, 'test-key');

    expect(editPlan.isDefault).toBe(true);
    expect(editPlan.segments).toHaveLength(2);
  });

  // Requirement 10.3: Returns default plan when LLM times out
  it('returns default plan when LLM times out', async () => {
    const project = makeTestProject();

    mockFetch.mockRejectedValue(new Error('timeout'));

    const { editPlan, editedProject } = await runAIEditPass(project, 'test-key');

    expect(editPlan.isDefault).toBe(true);
    expect(editedProject.script).toHaveLength(2);
  });

  // Requirement 10.5: Handles partial JSON by merging with defaults
  it('handles partial JSON by merging with defaults', async () => {
    const project = makeTestProject();

    const partialPlan = {
      segments: [{ segmentId: 'seg-1' }],
      // seg-2 is missing — should be filled with defaults
    };

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify(partialPlan) } }],
      }),
    } as unknown as Response);

    const { editPlan } = await runAIEditPass(project, 'test-key');

    // Should NOT be default since partial JSON was successfully merged
    expect(editPlan.isDefault).toBe(false);
    // Should have entries for both segments (seg-2 filled with defaults)
    expect(editPlan.segments).toHaveLength(2);
    expect(editPlan.segments[0].segmentId).toBe('seg-1');
    expect(editPlan.segments[1].segmentId).toBe('seg-2');
  });

  // Requirement 10.6: Respects AbortSignal cancellation
  it('respects AbortSignal cancellation', async () => {
    const project = makeTestProject();

    const controller = new AbortController();
    controller.abort();

    await expect(
      runAIEditPass(project, 'test-key', { signal: controller.signal }),
    ).rejects.toThrow();
  });

  it('returns default plan when response is not ok', async () => {
    const project = makeTestProject();

    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    } as unknown as Response);

    const { editPlan } = await runAIEditPass(project, 'test-key');

    expect(editPlan.isDefault).toBe(true);
  });

  it('calls onProgress with phase messages', async () => {
    const project = makeTestProject();
    const progressCalls: Array<[number, string]> = [];

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'not json' } }],
      }),
    } as unknown as Response);

    await runAIEditPass(project, 'test-key', {
      onProgress: (pct, msg) => progressCalls.push([pct, msg]),
    });

    // Should have reported progress at multiple phases
    expect(progressCalls.length).toBeGreaterThanOrEqual(3);
    expect(progressCalls.some(([pct]) => pct === 10)).toBe(true);
    expect(progressCalls.some(([, msg]) => msg.includes('Analyzing'))).toBe(true);
  });
});
