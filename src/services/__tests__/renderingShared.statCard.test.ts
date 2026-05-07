import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { assignSceneLayouts, hasStatisticalContent } from '../renderingShared';
import type { SceneLayoutType } from '../../types';

// ---------------------------------------------------------------------------
// Property 3: Stat-Heavy Segments Prefer Stat-Card Layout
// Feature: autotube-quality-phase-3
// **Validates: Requirement 3.3**
// ---------------------------------------------------------------------------

/** All valid scene layout types for output validation. */
const VALID_LAYOUTS: SceneLayoutType[] = [
  'centered-text',
  'left-text-right-image',
  'lower-third-overlay',
  'stat-card',
  'quote-card',
];

/**
 * Arbitrary that produces narration text containing statistical content
 * (dollar amounts, percentages, or magnitude words).
 */
const statNarrationArb = fc.oneof(
  fc.tuple(fc.integer({ min: 1, max: 999999 })).map(([n]) => `Revenue reached $${n.toLocaleString()} this quarter.`),
  fc.integer({ min: 1, max: 100 }).map((n) => `Growth surged by ${n}% year over year.`),
  fc.integer({ min: 1, max: 500 }).map((n) => `The company is now worth ${n} billion dollars.`),
  fc.integer({ min: 1, max: 999 }).map((n) => `Profits hit $${n} million in the last fiscal year.`),
);

/**
 * Arbitrary for a non-stat segment that will NOT get stat-card as its
 * preferred layout. We use type 'intro' with no purpose tag and plain
 * narration that has no statistical content.
 */
const nonStatSegmentArb = fc.record({
  type: fc.constant('intro' as string),
  purposeTag: fc.constant(undefined as string | undefined),
  narration: fc.constant('This is a simple introductory narration without any numbers.'),
});

/**
 * Arbitrary for a stat-heavy segment. Uses type 'section' (so the stat
 * content drives layout, not the segment type) and narration with stats.
 */
const statSegmentArb = statNarrationArb.map((narration) => ({
  type: 'section' as string,
  purposeTag: undefined as string | undefined,
  narration,
}));

describe('Property 3: Stat-Heavy Segments Prefer Stat-Card Layout', () => {
  it('stat-heavy segments get stat-card when the previous segment has a different layout', () => {
    // Build a 2-element array: [nonStatSegment, statSegment].
    // The non-stat segment will get a layout other than 'stat-card' (intro → 'centered-text'),
    // so the stat segment is free to get its preferred 'stat-card' layout.
    const pairArb = fc.tuple(nonStatSegmentArb, statSegmentArb).map(([a, b]) => [a, b]);

    fc.assert(
      fc.property(pairArb, (segments) => {
        const layouts = assignSceneLayouts(segments);

        // Sanity: output length matches input
        expect(layouts).toHaveLength(2);

        // All layouts are valid
        for (const layout of layouts) {
          expect(VALID_LAYOUTS).toContain(layout);
        }

        // The first segment (intro, no stats) should NOT be stat-card
        expect(layouts[0]).not.toBe('stat-card');

        // The second segment has statistical content and the previous layout
        // is not stat-card, so it should get 'stat-card'
        expect(hasStatisticalContent(segments[1].narration!)).toBe(true);
        expect(layouts[1]).toBe('stat-card');
      }),
      { numRuns: 300 },
    );
  });

  it('hasStatisticalContent correctly detects dollar amounts, percentages, and magnitude words', () => {
    // Positive cases: strings with statistical content
    const statTextArb = fc.oneof(
      fc.integer({ min: 1, max: 999999 }).map((n) => `Worth $${n}`),
      fc.integer({ min: 1, max: 100 }).map((n) => `Up ${n}%`),
      fc.integer({ min: 1, max: 500 }).map((n) => `${n} billion in revenue`),
      fc.integer({ min: 1, max: 999 }).map((n) => `${n} million users`),
      fc.integer({ min: 1, max: 999 }).map((n) => `${n} trillion dollar market`),
    );

    fc.assert(
      fc.property(statTextArb, (text) => {
        expect(hasStatisticalContent(text)).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  it('hasStatisticalContent returns false for plain text without stats', () => {
    // Negative cases: plain alphabetic text without statistical patterns
    const plainTextArb = fc
      .array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz '.split('')), {
        minLength: 5,
        maxLength: 100,
      })
      .map((chars) => chars.join(''));

    fc.assert(
      fc.property(plainTextArb, (text) => {
        expect(hasStatisticalContent(text)).toBe(false);
      }),
      { numRuns: 200 },
    );
  });
});
