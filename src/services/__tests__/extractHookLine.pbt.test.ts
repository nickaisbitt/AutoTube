// Feature: video-quality-from-reviews, Property for extractHookLine length bound
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { extractHookLine } from '../seoTitles';
import type { ScriptSegment } from '../../types';

/**
 * **Validates: Requirements 11.1**
 *
 * Property: extractHookLine always returns a string of length ≤ 100
 *
 * For any array of ScriptSegment-like objects (including those with type
 * 'intro' and narrations of varying lengths), `extractHookLine(segments)`
 * must always return a string whose length is at most 100 characters.
 */

const SEGMENT_TYPES = ['intro', 'section', 'transition', 'outro'] as const;

/** Generates a minimal ScriptSegment with arbitrary narration. */
const segmentArb = (type?: ScriptSegment['type']) =>
  fc.record({
    id: fc.uuid(),
    type: fc.constant(type ?? 'section'),
    title: fc.string({ minLength: 0, maxLength: 50 }),
    narration: fc.string({ minLength: 0, maxLength: 500 }),
    visualNote: fc.string({ minLength: 0, maxLength: 50 }),
    duration: fc.nat({ max: 300 }),
  }) as fc.Arbitrary<ScriptSegment>;

/** Generates a ScriptSegment with a random valid type. */
const anySegmentArb = fc.constantFrom(...SEGMENT_TYPES).chain(type => segmentArb(type));

describe('Property: extractHookLine always returns a string of length ≤ 100', () => {
  it('should return length ≤ 100 for arbitrary arrays of segments', () => {
    fc.assert(
      fc.property(
        fc.array(anySegmentArb, { minLength: 0, maxLength: 10 }),
        (segments) => {
          const result = extractHookLine(segments);
          expect(result.length).toBeLessThanOrEqual(100);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('should return length ≤ 100 for intro segments with very long narrations without sentence boundaries', () => {
    // Generate narrations that are long and contain no sentence-ending punctuation
    const longNarrationWithoutBoundary = fc.string({ minLength: 101, maxLength: 500 })
      .map(s => s.replace(/[.!?]/g, ' ')); // Remove all sentence boundaries

    fc.assert(
      fc.property(
        longNarrationWithoutBoundary,
        (narration) => {
          const segments: ScriptSegment[] = [{
            id: 'intro-1',
            type: 'intro',
            title: 'Hook',
            narration,
            visualNote: '',
            duration: 20,
          }];
          const result = extractHookLine(segments);
          expect(result.length).toBeLessThanOrEqual(100);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('should return length ≤ 100 for intro segments with very long first sentences', () => {
    // Generate narrations where the first sentence boundary is far away (> 100 chars)
    const longFirstSentence = fc.string({ minLength: 101, maxLength: 400 })
      .map(s => s.replace(/[.!?]/g, ' ') + '. And then something else.');

    fc.assert(
      fc.property(
        longFirstSentence,
        (narration) => {
          const segments: ScriptSegment[] = [{
            id: 'intro-1',
            type: 'intro',
            title: 'Hook',
            narration,
            visualNote: '',
            duration: 20,
          }];
          const result = extractHookLine(segments);
          expect(result.length).toBeLessThanOrEqual(100);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('should return empty string for empty arrays', () => {
    const result = extractHookLine([]);
    expect(result).toBe('');
    expect(result.length).toBeLessThanOrEqual(100);
  });

  it('should return empty string for arrays without intro segments', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.constantFrom('section' as const, 'transition' as const, 'outro' as const)
            .chain(type => segmentArb(type)),
          { minLength: 1, maxLength: 10 },
        ),
        (segments) => {
          const result = extractHookLine(segments);
          expect(result).toBe('');
        },
      ),
      { numRuns: 200 },
    );
  });
});
