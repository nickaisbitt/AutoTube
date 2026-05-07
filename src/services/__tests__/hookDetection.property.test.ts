/**
 * Property-Based Tests — Weak Hook Detection
 *
 * Feature: blind-review-quality-fixes, Property 20: Weak hook detection
 *
 * Validates: Requirements 7.2
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  detectWeakHook,
  PERSONAL_STAKES_KEYWORDS,
  STATISTIC_PATTERN,
} from '../visualPlanner';

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/**
 * Words that are guaranteed NOT to be personal-stakes keywords and NOT to
 * contain numeric patterns that match STATISTIC_PATTERN.
 */
const SAFE_WORDS = [
  'technology', 'landscape', 'industry', 'global', 'market',
  'innovation', 'platform', 'network', 'digital', 'enterprise',
  'strategy', 'framework', 'solution', 'approach', 'concept',
  'development', 'infrastructure', 'architecture', 'protocol', 'standard',
  'evolution', 'transformation', 'paradigm', 'methodology', 'ecosystem',
  'integration', 'optimization', 'implementation', 'deployment', 'operation',
];

/**
 * Arbitrary that generates a sentence composed entirely of safe words
 * (no personal-stakes keywords, no statistics).
 */
const safeSentenceArb: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(...SAFE_WORDS), { minLength: 3, maxLength: 10 })
  .map((words) => {
    // Capitalize first word and end with a period
    const sentence = words.join(' ');
    return sentence.charAt(0).toUpperCase() + sentence.slice(1) + '.';
  });

/**
 * Arbitrary that generates narration text with at least 2 sentences,
 * none of which contain personal-stakes keywords or statistics.
 */
const weakNarrationArb: fc.Arbitrary<string> = fc
  .array(safeSentenceArb, { minLength: 2, maxLength: 5 })
  .map((sentences) => sentences.join(' '));

/**
 * Arbitrary that generates narration text where the first 2 sentences
 * contain at least one personal-stakes keyword.
 */
const personalStakesNarrationArb: fc.Arbitrary<string> = fc
  .tuple(
    fc.constantFrom(...PERSONAL_STAKES_KEYWORDS),
    safeSentenceArb,
    fc.array(safeSentenceArb, { minLength: 0, maxLength: 3 }),
  )
  .map(([keyword, secondSentence, rest]) => {
    // Insert the keyword into the first sentence
    const firstSentence = `This affects ${keyword} directly.`;
    return [firstSentence, secondSentence, ...rest].join(' ');
  });

/**
 * Arbitrary that generates narration text where the first 2 sentences
 * contain a statistic matching STATISTIC_PATTERN.
 */
const statisticNarrationArb: fc.Arbitrary<string> = fc
  .tuple(
    fc.nat({ max: 999 }).map((n) => n + 1),
    fc.constantFrom('%', ' billion', ' million', ' trillion', ' dollars', ' people', ' victims', ' attacks'),
    safeSentenceArb,
    fc.array(safeSentenceArb, { minLength: 0, maxLength: 3 }),
  )
  .map(([num, unit, secondSentence, rest]) => {
    const firstSentence = `Over ${num}${unit} were affected last quarter.`;
    return [firstSentence, secondSentence, ...rest].join(' ');
  });

// ---------------------------------------------------------------------------
// Property 20: Weak hook detection
// ---------------------------------------------------------------------------

describe('Feature: blind-review-quality-fixes, Property 20: Weak hook detection', () => {
  /**
   * **Validates: Requirements 7.2**
   *
   * For any narration text where the first 2 sentences contain neither a
   * personal-stakes keyword nor a statistical figure (number + unit pattern),
   * detectWeakHook SHALL return { isWeak: true }.
   */

  it('returns isWeak: true when first 2 sentences lack personal-stakes keywords and statistics', () => {
    fc.assert(
      fc.property(weakNarrationArb, (narration) => {
        const result = detectWeakHook(narration);
        expect(result.isWeak).toBe(true);
        expect(result.hasPersonalStakes).toBe(false);
        expect(result.hasStatistic).toBe(false);
      }),
      { numRuns: 30 },
    );
  });

  it('returns isWeak: false when first 2 sentences contain a personal-stakes keyword', () => {
    fc.assert(
      fc.property(personalStakesNarrationArb, (narration) => {
        const result = detectWeakHook(narration);
        expect(result.isWeak).toBe(false);
        expect(result.hasPersonalStakes).toBe(true);
      }),
      { numRuns: 30 },
    );
  });

  it('returns isWeak: false when first 2 sentences contain a statistic', () => {
    fc.assert(
      fc.property(statisticNarrationArb, (narration) => {
        const result = detectWeakHook(narration);
        expect(result.isWeak).toBe(false);
        expect(result.hasStatistic).toBe(true);
      }),
      { numRuns: 30 },
    );
  });

  it('returns isWeak: true for empty narration', () => {
    const result = detectWeakHook('');
    expect(result.isWeak).toBe(true);
    expect(result.hasPersonalStakes).toBe(false);
    expect(result.hasStatistic).toBe(false);
  });
});
