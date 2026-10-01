/**
 * Property-Based Tests — Transitions
 *
 * Feature: video-quality-max, Properties 10, 11, 12, 13
 *
 * Validates: Requirements 6.1, 6.2, 6.4, 6.5, 6.6
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  getTransitionConfigForSectionChange,
  getStatisticalCardDuration,
  getSectionTitleCardDuration,
  computeVisualChangeCount,
} from '../renderer/canvas/transitions';
import { getSectionDesignTemplate, SECTION_DESIGN_TEMPLATES } from '../templates';
import { hasStatisticalContent } from '../renderingShared';

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** All valid section types from SECTION_DESIGN_TEMPLATES */
const SECTION_TYPES = Object.keys(SECTION_DESIGN_TEMPLATES);

/** Arbitrary for a valid section type */
const sectionTypeArb: fc.Arbitrary<string> = fc.constantFrom(...SECTION_TYPES);

/** Arbitrary for a pair of different section types */
const differentSectionTypePairArb: fc.Arbitrary<[string, string]> = fc
  .tuple(sectionTypeArb, sectionTypeArb)
  .filter(([from, to]) => from !== to);

/** Arbitrary for narration text containing statistical content */
const statisticalNarrationArb: fc.Arbitrary<string> = fc.oneof(
  // Dollar amounts
  fc.tuple(
    fc.constantFrom('The company lost', 'Revenue reached', 'They invested', 'Total damages exceeded'),
    fc.integer({ min: 1, max: 999 }),
    fc.constantFrom('billion', 'million', 'trillion'),
    fc.constantFrom(' in revenue.', ' last year.', ' this quarter.', ' over the period.'),
  ).map(([prefix, num, magnitude, suffix]) => `${prefix} $${num} ${magnitude}${suffix}`),
  // Percentages
  fc.tuple(
    fc.constantFrom('Growth was', 'The market dropped', 'Adoption increased by', 'Costs rose'),
    fc.integer({ min: 1, max: 99 }),
    fc.constantFrom(' this year.', ' in Q4.', ' since launch.', ' across all regions.'),
  ).map(([prefix, pct, suffix]) => `${prefix} ${pct}%${suffix}`),
  // Years / 4-digit numbers
  fc.tuple(
    fc.constantFrom('Founded in', 'Since', 'By the year', 'Starting from'),
    fc.integer({ min: 1900, max: 2099 }),
    fc.constantFrom(', the company grew rapidly.', ', everything changed.', ', adoption skyrocketed.'),
  ).map(([prefix, year, suffix]) => `${prefix} ${year}${suffix}`),
  // Large numbers with magnitude words
  fc.tuple(
    fc.constantFrom('Over', 'More than', 'Approximately', 'Nearly'),
    fc.integer({ min: 1, max: 999 }),
    fc.constantFrom(' billion', ' million', ' trillion'),
    fc.constantFrom(' users were affected.', ' devices are connected.', ' transactions processed.'),
  ).map(([prefix, num, magnitude, suffix]) => `${prefix} ${num}${magnitude}${suffix}`),
);

/** Arbitrary for narration text WITHOUT statistical content */
const nonStatisticalNarrationArb: fc.Arbitrary<string> = fc
  .array(
    fc.constantFrom(
      'The landscape is changing rapidly.',
      'Experts warn about emerging threats.',
      'This affects everyone who uses the internet.',
      'Security researchers have identified new vulnerabilities.',
      'Companies must adapt their strategies accordingly.',
      'The implications are far-reaching and complex.',
      'Understanding these risks is crucial for protection.',
      'New approaches are needed to address these challenges.',
    ),
    { minLength: 2, maxLength: 5 },
  )
  .map((sentences) => sentences.join(' '));

/** Arbitrary for segment duration >= 10 seconds */
const longDurationArb: fc.Arbitrary<number> = fc.integer({ min: 10, max: 120 });

/** Arbitrary for asset count (positive) */
const assetCountArb: fc.Arbitrary<number> = fc.integer({ min: 1, max: 20 });

// ---------------------------------------------------------------------------
// Property 10: Section-Appropriate Transitions
// ---------------------------------------------------------------------------

describe('Feature: video-quality-max, Property 10: Section-Appropriate Transitions', () => {
  /**
   * **Validates: Requirements 6.1, 6.2**
   *
   * For any pair of consecutive segments with different section types, the
   * renderer SHALL apply the motif transition defined by the outgoing segment's
   * SECTION_DESIGN_TEMPLATES entry (transitionOut field).
   */

  it('transition type matches outgoing section template transitionOut field', () => {
    fc.assert(
      fc.property(differentSectionTypePairArb, ([fromType, toType]) => {
        const config = getTransitionConfigForSectionChange(fromType, toType);
        const template = getSectionDesignTemplate(fromType);

        expect(config.type).toBe(template.transitionOut);
      }),
      { numRuns: 100 },
    );
  });

  it('transition config preserves from and to section types', () => {
    fc.assert(
      fc.property(differentSectionTypePairArb, ([fromType, toType]) => {
        const config = getTransitionConfigForSectionChange(fromType, toType);

        expect(config.fromSectionType).toBe(fromType);
        expect(config.toSectionType).toBe(toType);
      }),
      { numRuns: 100 },
    );
  });

  it('transition config includes accent color from outgoing template', () => {
    fc.assert(
      fc.property(differentSectionTypePairArb, ([fromType, toType]) => {
        const config = getTransitionConfigForSectionChange(fromType, toType);
        const template = getSectionDesignTemplate(fromType);

        expect(config.accentColor).toBe(template.colorBalance.primary);
      }),
      { numRuns: 100 },
    );
  });

  it('transition config has a positive duration', () => {
    fc.assert(
      fc.property(differentSectionTypePairArb, ([fromType, toType]) => {
        const config = getTransitionConfigForSectionChange(fromType, toType);

        expect(config.durationMs).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 11: Statistical Text Card Display
// ---------------------------------------------------------------------------

describe('Feature: video-quality-max, Property 11: Statistical Text Card Display', () => {
  /**
   * **Validates: Requirements 6.4**
   *
   * For any segment where hasStatisticalContent(narration) returns true, the
   * render plan SHALL include an animated text card overlay with a duration
   * between 2 and 3 seconds.
   */

  it('returns duration between 2 and 3 seconds for statistical narration', () => {
    fc.assert(
      fc.property(statisticalNarrationArb, (narration) => {
        // Precondition: narration must be detected as statistical
        fc.pre(hasStatisticalContent(narration));

        const duration = getStatisticalCardDuration(narration);

        expect(duration).toBeGreaterThanOrEqual(2);
        expect(duration).toBeLessThanOrEqual(3);
      }),
      { numRuns: 100 },
    );
  });

  it('returns 0 for non-statistical narration (no text card)', () => {
    fc.assert(
      fc.property(nonStatisticalNarrationArb, (narration) => {
        // Precondition: narration must NOT be detected as statistical
        fc.pre(!hasStatisticalContent(narration));

        const duration = getStatisticalCardDuration(narration);

        expect(duration).toBe(0);
      }),
      { numRuns: 100 },
    );
  });

  it('statistical content detection is consistent with card duration', () => {
    fc.assert(
      fc.property(statisticalNarrationArb, (narration) => {
        const isStatistical = hasStatisticalContent(narration);
        const duration = getStatisticalCardDuration(narration);

        if (isStatistical) {
          expect(duration).toBeGreaterThan(0);
        } else {
          expect(duration).toBe(0);
        }
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 12: Section Title Cards at Topic Changes
// ---------------------------------------------------------------------------

describe('Feature: video-quality-max, Property 12: Section Title Cards at Topic Changes', () => {
  /**
   * **Validates: Requirements 6.5**
   *
   * For any pair of consecutive segments where the section type changes, the
   * renderer SHALL schedule a title card with duration of 1200ms (±50ms).
   */

  it('returns 1200ms (±50ms) when section types differ', () => {
    fc.assert(
      fc.property(differentSectionTypePairArb, ([fromType, toType]) => {
        const duration = getSectionTitleCardDuration(fromType, toType);

        expect(duration).toBeGreaterThanOrEqual(1150);
        expect(duration).toBeLessThanOrEqual(1250);
      }),
      { numRuns: 100 },
    );
  });

  it('returns 0 when section types are the same (no title card)', () => {
    fc.assert(
      fc.property(sectionTypeArb, (sectionType) => {
        const duration = getSectionTitleCardDuration(sectionType, sectionType);

        expect(duration).toBe(0);
      }),
      { numRuns: 100 },
    );
  });

  it('returns 0 when either section type is undefined', () => {
    fc.assert(
      fc.property(sectionTypeArb, (sectionType) => {
        const durationNoFrom = getSectionTitleCardDuration(undefined, sectionType);
        const durationNoTo = getSectionTitleCardDuration(sectionType, undefined);

        expect(durationNoFrom).toBe(0);
        expect(durationNoTo).toBe(0);
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 13: Visual Change Density
// ---------------------------------------------------------------------------

describe('Feature: video-quality-max, Property 13: Visual Change Density', () => {
  /**
   * **Validates: Requirements 6.6**
   *
   * For any segment with duration >= 10 seconds, the shot plan SHALL contain
   * at least 2 visual changes (cuts, zooms, transitions, or overlay changes)
   * within each 10-second window.
   */

  it('returns at least 2 visual changes per 10-second window for segments >= 10s', () => {
    fc.assert(
      fc.property(longDurationArb, assetCountArb, (duration, assetCount) => {
        const changeCount = computeVisualChangeCount(duration, assetCount);
        const windows = Math.ceil(duration / 10);
        const minExpected = windows * 2;

        expect(changeCount).toBeGreaterThanOrEqual(minExpected);
      }),
      { numRuns: 100 },
    );
  });

  it('returns at least 1 for any positive duration', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.1, max: 120, noNaN: true }),
        assetCountArb,
        (duration, assetCount) => {
          const changeCount = computeVisualChangeCount(duration, assetCount);

          expect(changeCount).toBeGreaterThanOrEqual(1);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('returns 0 for zero or negative duration', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -100, max: 0, noNaN: true }),
        assetCountArb,
        (duration, assetCount) => {
          const changeCount = computeVisualChangeCount(duration, assetCount);

          expect(changeCount).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('visual change count scales with duration (longer segments need more changes)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 10, max: 50 }),
        fc.integer({ min: 51, max: 120 }),
        assetCountArb,
        (shortDuration, longDuration, assetCount) => {
          const shortChanges = computeVisualChangeCount(shortDuration, assetCount);
          const longChanges = computeVisualChangeCount(longDuration, assetCount);

          expect(longChanges).toBeGreaterThanOrEqual(shortChanges);
        },
      ),
      { numRuns: 100 },
    );
  });
});
