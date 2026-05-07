import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { computePacingScore } from '../renderingShared';

// ---------------------------------------------------------------------------
// Property 6: Pacing Score Is Always In [1, 5]
// Feature: autotube-quality-phase-3
// **Validates: Requirement 13.1**
// ---------------------------------------------------------------------------

describe('Property 6: Pacing Score Is Always In [1, 5]', () => {
  /**
   * Arbitrary for diverse narration strings: 0–2000 characters drawn from
   * printable ASCII including letters, digits, punctuation, and whitespace.
   * This covers empty strings, all-punctuation strings, single words, and
   * long multi-sentence narrations.
   */
  const narrationArb = fc.string({ minLength: 0, maxLength: 2000 });

  it('returns an integer in [1, 5] for all random narration strings', () => {
    fc.assert(
      fc.property(narrationArb, (narration) => {
        const score = computePacingScore(narration);
        expect(Number.isInteger(score)).toBe(true);
        expect(score).toBeGreaterThanOrEqual(1);
        expect(score).toBeLessThanOrEqual(5);
      }),
      { numRuns: 1000 },
    );
  });

  it('returns an integer in [1, 5] for strings composed entirely of punctuation', () => {
    const punctChars = '!?.,:;-()"\' ';
    const punctuationArb = fc.array(
      fc.integer({ min: 0, max: punctChars.length - 1 }),
      { minLength: 1, maxLength: 500 },
    ).map(indices => indices.map(i => punctChars[i]).join(''));

    fc.assert(
      fc.property(punctuationArb, (narration) => {
        const score = computePacingScore(narration);
        expect(Number.isInteger(score)).toBe(true);
        expect(score).toBeGreaterThanOrEqual(1);
        expect(score).toBeLessThanOrEqual(5);
      }),
      { numRuns: 300 },
    );
  });

  it('returns an integer in [1, 5] for single-word inputs', () => {
    const singleWordArb = fc.string({ minLength: 1, maxLength: 50 })
      .map(s => s.replace(/\s/g, 'a'))
      .filter(s => s.trim().length > 0);

    fc.assert(
      fc.property(singleWordArb, (word) => {
        const score = computePacingScore(word);
        expect(Number.isInteger(score)).toBe(true);
        expect(score).toBeGreaterThanOrEqual(1);
        expect(score).toBeLessThanOrEqual(5);
      }),
      { numRuns: 300 },
    );
  });

  it('returns 3 for empty string input', () => {
    expect(computePacingScore('')).toBe(3);
  });

  it('returns 3 for whitespace-only input', () => {
    const wsChars = ' \t\n\r';
    const whitespaceArb = fc.array(
      fc.integer({ min: 0, max: wsChars.length - 1 }),
      { minLength: 1, maxLength: 100 },
    ).map(indices => indices.map(i => wsChars[i]).join(''));

    fc.assert(
      fc.property(whitespaceArb, (whitespace) => {
        expect(computePacingScore(whitespace)).toBe(3);
      }),
      { numRuns: 100 },
    );
  });
});
