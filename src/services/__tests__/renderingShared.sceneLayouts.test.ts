import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { assignSceneLayouts } from '../renderingShared';
import type { SegmentPurposeTag, SceneLayoutType } from '../../types';

// ---------------------------------------------------------------------------
// Property 2: No Consecutive Scene Layouts Are Identical
// Feature: autotube-quality-phase-3
// **Validates: Requirement 3.2**
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
 * Arbitrary for an array of 2–20 segments (minimum 2 to test consecutive constraint).
 */
const segmentsArb = fc.array(segmentArb, { minLength: 2, maxLength: 20 });

describe('Property 2: No Consecutive Scene Layouts Are Identical', () => {
  it('no two adjacent segments share the same layout for random segment arrays', () => {
    fc.assert(
      fc.property(segmentsArb, (segments) => {
        const layouts = assignSceneLayouts(segments);

        // Output length must match input length
        expect(layouts).toHaveLength(segments.length);

        // Every layout must be a valid SceneLayoutType
        for (const layout of layouts) {
          expect(VALID_LAYOUTS).toContain(layout);
        }

        // Core property: no consecutive layouts are identical
        for (let i = 0; i < layouts.length - 1; i++) {
          expect(layouts[i]).not.toBe(layouts[i + 1]);
        }
      }),
      { numRuns: 300 },
    );
  });

  it('holds for arrays where all segments have the same type and purpose tag', () => {
    // Edge case: when every segment would naturally prefer the same layout,
    // the no-consecutive-duplicate constraint must still be enforced.
    const uniformSegmentsArb = fc
      .record({
        type: fc.constantFrom(...SEGMENT_TYPES),
        purposeTag: fc.constantFrom(...PURPOSE_TAGS),
      })
      .chain(({ type, purposeTag }) =>
        fc.array(
          fc.constant({ type, purposeTag, narration: 'Some generic narration text.' }),
          { minLength: 2, maxLength: 20 },
        ),
      );

    fc.assert(
      fc.property(uniformSegmentsArb, (segments) => {
        const layouts = assignSceneLayouts(segments);

        for (let i = 0; i < layouts.length - 1; i++) {
          expect(layouts[i]).not.toBe(layouts[i + 1]);
        }
      }),
      { numRuns: 200 },
    );
  });
});
