// Feature: video-quality-from-reviews, Property for computeVisualStyle range
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { computeVisualStyle } from '../renderer';
import type { VisualStyleType } from '../renderer';

/**
 * **Validates: Requirements 10.1**
 *
 * Property: computeVisualStyle always returns a valid VisualStyleType
 *
 * For any non-negative frameTime, positive segmentDuration, and valid
 * segmentType, `computeVisualStyle` must return one of
 * `'b-roll' | 'kinetic-text' | 'diagram'`.
 */

const VALID_STYLES: VisualStyleType[] = ['b-roll', 'kinetic-text', 'diagram'];

describe('Property: computeVisualStyle always returns a valid VisualStyleType', () => {
  it('should return a valid VisualStyleType for any valid inputs', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 10000, noNaN: true }),
        fc.double({ min: 0.01, max: 10000, noNaN: true }),
        fc.constantFrom('intro' as const, 'section' as const, 'transition' as const, 'outro' as const),
        (frameTime, segmentDuration, segmentType) => {
          const result = computeVisualStyle(frameTime, segmentDuration, segmentType);
          expect(VALID_STYLES).toContain(result);
        },
      ),
      { numRuns: 200 },
    );
  });
});

/**
 * **Validates: Requirements 10.2**
 *
 * Property: computeVisualStyle always returns 'b-roll' for intro and outro segments
 *
 * For any non-negative frameTime and positive segmentDuration, when the
 * segmentType is 'intro' or 'outro', `computeVisualStyle` must always
 * return `'b-roll'`.
 */
describe('Property: computeVisualStyle returns b-roll for intro and outro segments', () => {
  it('should always return b-roll for intro or outro regardless of frameTime', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 10000, noNaN: true }),
        fc.double({ min: 0.01, max: 10000, noNaN: true }),
        fc.constantFrom('intro' as const, 'outro' as const),
        (frameTime, segmentDuration, segmentType) => {
          const result = computeVisualStyle(frameTime, segmentDuration, segmentType);
          expect(result).toBe('b-roll');
        },
      ),
      { numRuns: 200 },
    );
  });
});
