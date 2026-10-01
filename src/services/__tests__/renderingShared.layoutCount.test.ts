import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { assignSceneLayouts } from '../renderingShared';
import type { SegmentPurposeTag, SceneLayoutType } from '../../types';

// ---------------------------------------------------------------------------
// Property 10: Scene Layout Assignment Produces Exactly One Layout Per Segment
// Feature: autotube-quality-phase-3
// **Validates: Requirements 3.5**
// ---------------------------------------------------------------------------

/** All valid segment types used in the pipeline. */
const SEGMENT_TYPES = ['intro', 'section', 'transition', 'outro'] as const;

/** All valid purpose tags (or undefined). */
const PURPOSE_TAGS: (SegmentPurposeTag | undefined)[] = [
  'stat_hook',
  'history',
  'moat',
  'risk',
  'prediction',
  'human_story',
  'competitive_analysis',
  'transition_bridge',
  'conclusion',
  undefined,
];

/** All valid scene layout types for output validation. */
const VALID_LAYOUTS: SceneLayoutType[] = [
  'centered-text',
  'left-text-right-image',
  'lower-third-overlay',
  'stat-card',
  'quote-card',
];

/**
 * Arbitrary for a single segment with random type, purposeTag, and narration.
 */
const segmentArb = fc.record({
  type: fc.constantFrom(...SEGMENT_TYPES),
  purposeTag: fc.constantFrom(...PURPOSE_TAGS),
  narration: fc.oneof(
    fc.constant(''),
    fc.constant(undefined as unknown as string),
    // Plain narration text
    fc.lorem({ maxCount: 10, mode: 'sentences' }),
    // Narration with statistical content (dollar amounts, percentages, large numbers)
    fc.lorem({ maxCount: 5, mode: 'sentences' }).map(
      (text) => `${text} Revenue hit $4.2 billion, up 35% year over year.`,
    ),
  ),
});

/**
 * Arbitrary for an array of 1–20 segments.
 */
const segmentsArb = fc.array(segmentArb, { minLength: 1, maxLength: 20 });

describe('Property 10: Scene Layout Assignment Produces Exactly One Layout Per Segment', () => {
  it('output length matches input length and all values are valid SceneLayoutType values', () => {
    fc.assert(
      fc.property(segmentsArb, (segments) => {
        const layouts = assignSceneLayouts(segments);

        // Output length must match input length
        expect(layouts).toHaveLength(segments.length);

        // Every element must be a valid SceneLayoutType
        for (const layout of layouts) {
          expect(VALID_LAYOUTS).toContain(layout);
        }
      }),
      { numRuns: 300 },
    );
  });

  it('produces exactly one layout for a single-segment array', () => {
    fc.assert(
      fc.property(segmentArb, (segment) => {
        const layouts = assignSceneLayouts([segment]);

        expect(layouts).toHaveLength(1);
        expect(VALID_LAYOUTS).toContain(layouts[0]);
      }),
      { numRuns: 200 },
    );
  });

  it('handles arrays where all segments have identical configuration', () => {
    const uniformSegmentsArb = fc
      .record({
        type: fc.constantFrom(...SEGMENT_TYPES),
        purposeTag: fc.constantFrom(...PURPOSE_TAGS),
      })
      .chain(({ type, purposeTag }) =>
        fc.array(
          fc.constant({ type, purposeTag, narration: 'Some generic narration text.' }),
          { minLength: 1, maxLength: 20 },
        ),
      );

    fc.assert(
      fc.property(uniformSegmentsArb, (segments) => {
        const layouts = assignSceneLayouts(segments);

        // Output length must match input length
        expect(layouts).toHaveLength(segments.length);

        // Every element must be a valid SceneLayoutType
        for (const layout of layouts) {
          expect(VALID_LAYOUTS).toContain(layout);
        }
      }),
      { numRuns: 200 },
    );
  });
});
