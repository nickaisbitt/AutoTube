/**
 * Property-Based Tests — Media Quality Gate
 *
 * Feature: video-quality-max, Properties 8, 9
 *
 * Validates: Requirements 5.4, 5.6
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  rejectClicheCandidates,
  detectClichePattern,
  computeVideoClipPlan,
  DEFAULT_QUALITY_GATE_CONFIG,
} from '../mediaQualityGate';
import type { MediaCandidate } from '../media';

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Known cliché patterns from the default config */
const CLICHE_PATTERNS = DEFAULT_QUALITY_GATE_CONFIG.clichePatterns;

/** Arbitrary for a cliché alt text (contains one of the known cliché patterns) */
const clicheAltArb: fc.Arbitrary<string> = fc.constantFrom(...CLICHE_PATTERNS).map(
  (pattern) => `A photo of ${pattern} in a dark room`,
);

/** Arbitrary for a non-cliché alt text (does not contain any cliché pattern) */
const nonClicheAltArb: fc.Arbitrary<string> = fc
  .string({ minLength: 5, maxLength: 80 })
  .filter((s) => {
    const lower = s.toLowerCase();
    return CLICHE_PATTERNS.every((p) => !lower.includes(p.toLowerCase()));
  });

/** Arbitrary for a base MediaCandidate with configurable alt and score */
function candidateArb(opts: {
  altArb: fc.Arbitrary<string>;
  scoreMin: number;
  scoreMax: number;
}): fc.Arbitrary<MediaCandidate> {
  return fc.tuple(opts.altArb, fc.integer({ min: opts.scoreMin, max: opts.scoreMax })).map(
    ([alt, score]) => ({
      url: `https://example.com/img-${score}.jpg`,
      alt,
      source: 'test',
      query: 'test query',
      baseScore: score,
      finalScore: score,
      qualityCompositeScore: score,
      width: 1920,
      height: 1080,
      type: 'image' as const,
    }),
  );
}

/** Arbitrary for a cliché candidate (any score) */
const clicheCandidateArb: fc.Arbitrary<MediaCandidate> = candidateArb({
  altArb: clicheAltArb,
  scoreMin: 0,
  scoreMax: 300,
});

/** Arbitrary for a non-cliché candidate scoring above 150 (strong alternative) */
const strongAlternativeArb: fc.Arbitrary<MediaCandidate> = candidateArb({
  altArb: nonClicheAltArb,
  scoreMin: 151,
  scoreMax: 300,
});

/** Arbitrary for a non-cliché candidate scoring at or below 150 (weak alternative) */
const weakAlternativeArb: fc.Arbitrary<MediaCandidate> = candidateArb({
  altArb: nonClicheAltArb,
  scoreMin: 0,
  scoreMax: 150,
});

/** Arbitrary for segment count N >= 3 */
const segmentCountArb: fc.Arbitrary<number> = fc.integer({ min: 3, max: 100 });

/** Arbitrary for video clip interval (positive integer) */
const intervalArb: fc.Arbitrary<number> = fc.integer({ min: 1, max: 10 });

// ---------------------------------------------------------------------------
// Property 8: Cliché Media Rejection
// ---------------------------------------------------------------------------

describe('Feature: video-quality-max, Property 8: Cliché Media Rejection', () => {
  /**
   * **Validates: Requirements 5.4**
   *
   * For any set of media candidates where at least one candidate matches a
   * cliché visual pattern (hooded hacker, generic binary code, abstract circuit
   * boards) AND at least one alternative candidate scores above 150, the cliché
   * candidate SHALL NOT be selected as the final asset.
   */

  it('rejects cliché candidates when a strong alternative (score > 150) exists', () => {
    fc.assert(
      fc.property(
        fc.array(clicheCandidateArb, { minLength: 1, maxLength: 5 }),
        fc.array(strongAlternativeArb, { minLength: 1, maxLength: 5 }),
        (cliches, alternatives) => {
          const candidates = [...cliches, ...alternatives];
          const filtered = rejectClicheCandidates(candidates, DEFAULT_QUALITY_GATE_CONFIG);

          // No cliché candidate should remain in the filtered result
          for (const candidate of filtered) {
            const matchedPattern = detectClichePattern(
              candidate,
              DEFAULT_QUALITY_GATE_CONFIG.clichePatterns,
            );
            expect(matchedPattern).toBeNull();
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('retains cliché candidates when no alternative scores above 150', () => {
    fc.assert(
      fc.property(
        fc.array(clicheCandidateArb, { minLength: 1, maxLength: 5 }),
        fc.array(weakAlternativeArb, { minLength: 0, maxLength: 5 }),
        (cliches, weakAlts) => {
          const candidates = [...cliches, ...weakAlts];
          const filtered = rejectClicheCandidates(candidates, DEFAULT_QUALITY_GATE_CONFIG);

          // All original candidates should be retained (no rejection without strong alt)
          expect(filtered.length).toBe(candidates.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('filtered result is non-empty when strong alternatives exist', () => {
    fc.assert(
      fc.property(
        fc.array(clicheCandidateArb, { minLength: 1, maxLength: 5 }),
        fc.array(strongAlternativeArb, { minLength: 1, maxLength: 5 }),
        (cliches, alternatives) => {
          const candidates = [...cliches, ...alternatives];
          const filtered = rejectClicheCandidates(candidates, DEFAULT_QUALITY_GATE_CONFIG);

          // At least the strong alternatives should remain
          expect(filtered.length).toBeGreaterThanOrEqual(alternatives.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('detectClichePattern identifies cliché patterns in alt text', () => {
    fc.assert(
      fc.property(clicheCandidateArb, (candidate) => {
        const pattern = detectClichePattern(
          candidate,
          DEFAULT_QUALITY_GATE_CONFIG.clichePatterns,
        );
        expect(pattern).not.toBeNull();
        expect(CLICHE_PATTERNS).toContain(pattern);
      }),
      { numRuns: 100 },
    );
  });

  it('detectClichePattern returns null for non-cliché candidates', () => {
    fc.assert(
      fc.property(
        candidateArb({ altArb: nonClicheAltArb, scoreMin: 0, scoreMax: 300 }),
        (candidate) => {
          const pattern = detectClichePattern(
            candidate,
            DEFAULT_QUALITY_GATE_CONFIG.clichePatterns,
          );
          expect(pattern).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 9: Video Clip Sourcing Frequency
// ---------------------------------------------------------------------------

describe('Feature: video-quality-max, Property 9: Video Clip Sourcing Frequency', () => {
  /**
   * **Validates: Requirements 5.6**
   *
   * For any segment count N >= 3, the media sourcer SHALL attempt to source
   * at least ⌊N/3⌋ video clips to add motion variety.
   */

  it('computeVideoClipPlan targets at least ⌊N/3⌋ video clips for N >= 3', () => {
    fc.assert(
      fc.property(segmentCountArb, (totalSegments) => {
        const plan = computeVideoClipPlan(totalSegments);
        const expectedMinClips = Math.floor(totalSegments / 3);

        expect(plan.targetVideoClips).toBeGreaterThanOrEqual(expectedMinClips);
      }),
      { numRuns: 100 },
    );
  });

  it('computeVideoClipPlan returns exactly ⌊N/interval⌋ target clips', () => {
    fc.assert(
      fc.property(segmentCountArb, intervalArb, (totalSegments, interval) => {
        const plan = computeVideoClipPlan(totalSegments, interval);
        const expected = Math.floor(totalSegments / interval);

        expect(plan.targetVideoClips).toBe(expected);
      }),
      { numRuns: 100 },
    );
  });

  it('videoSegmentIndices length matches targetVideoClips', () => {
    fc.assert(
      fc.property(segmentCountArb, (totalSegments) => {
        const plan = computeVideoClipPlan(totalSegments);

        expect(plan.videoSegmentIndices.length).toBe(plan.targetVideoClips);
      }),
      { numRuns: 100 },
    );
  });

  it('all videoSegmentIndices are valid segment indices (0 to N-1)', () => {
    fc.assert(
      fc.property(segmentCountArb, (totalSegments) => {
        const plan = computeVideoClipPlan(totalSegments);

        for (const index of plan.videoSegmentIndices) {
          expect(index).toBeGreaterThanOrEqual(0);
          expect(index).toBeLessThan(totalSegments);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('videoSegmentIndices are distributed (no duplicates)', () => {
    fc.assert(
      fc.property(segmentCountArb, (totalSegments) => {
        const plan = computeVideoClipPlan(totalSegments);
        const uniqueIndices = new Set(plan.videoSegmentIndices);

        expect(uniqueIndices.size).toBe(plan.videoSegmentIndices.length);
      }),
      { numRuns: 100 },
    );
  });

  it('totalSegments in plan matches input', () => {
    fc.assert(
      fc.property(segmentCountArb, intervalArb, (totalSegments, interval) => {
        const plan = computeVideoClipPlan(totalSegments, interval);

        expect(plan.totalSegments).toBe(totalSegments);
      }),
      { numRuns: 100 },
    );
  });
});
