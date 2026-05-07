/**
 * Property-Based Tests — Hook Validator
 *
 * Feature: video-quality-max, Properties 5, 6, 7
 *
 * Validates: Requirements 4.1, 4.2, 4.4, 4.5
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  validateHook,
  detectHookPattern,
  generateTemplateHook,
  MIN_WORD_COUNT,
  MAX_WORD_COUNT,
} from '../hookValidator';
import type { HookPattern } from '../hookValidator';
import type { ScriptSegment } from '../../types';

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Arbitrary for valid hook patterns */
const hookPatternArb: fc.Arbitrary<HookPattern> = fc.constantFrom(
  'surprising_statistic',
  'provocative_question',
  'personal_stakes',
  'counterintuitive_claim',
);

/** Arbitrary for non-empty topic strings */
const topicArb = fc.string({ minLength: 1, maxLength: 100 }).filter(
  (s) => s.trim().length > 0,
);

/** Generate filler words to pad narration to a target word count */
const fillerWordsArb = (minWords: number, maxWords: number): fc.Arbitrary<string> =>
  fc.array(
    fc.constantFrom(
      'the', 'world', 'is', 'changing', 'fast', 'and', 'we', 'need', 'to',
      'understand', 'what', 'happens', 'next', 'in', 'this', 'story', 'about',
      'how', 'things', 'work', 'today', 'for', 'everyone', 'around', 'us',
      'because', 'it', 'matters', 'more', 'than', 'ever', 'before', 'now',
      'people', 'are', 'starting', 'realize', 'that', 'something', 'big',
    ),
    { minLength: minWords, maxLength: maxWords },
  ).map((words) => words.join(' '));

/** Arbitrary for intro narration containing a surprising statistic hook */
const statisticHookNarrationArb = fc.tuple(
  fc.oneof(
    fc.nat({ max: 99 }).map((n) => `Over ${n}% of companies fail within the first year.`),
    fc.nat({ max: 999 }).map((n) => `The market grew by $${n} billion last quarter.`),
    fc.nat({ max: 9999 }).map((n) => `More than ${n.toLocaleString()},000 people were affected.`),
    fc.nat({ max: 50 }).map((n) => `Revenue increased ${n}x in just twelve months.`),
  ),
  fillerWordsArb(20, 40),
).map(([hook, filler]) => `${hook} ${filler}`);

/** Arbitrary for intro narration containing a provocative question hook */
const questionHookNarrationArb = fc.tuple(
  fc.constantFrom(
    'What if everything you believed about technology was wrong?',
    'Have you ever wondered why most startups fail?',
    'Why are millions of people ignoring this critical warning?',
    'Could this be the biggest opportunity of the decade?',
  ),
  fillerWordsArb(20, 40),
).map(([hook, filler]) => `${hook} ${filler}`);

/** Arbitrary for intro narration containing a personal stakes hook */
const personalStakesHookNarrationArb = fc.tuple(
  fc.constantFrom(
    'Your retirement savings could vanish overnight.',
    'You might be making the biggest mistake of your career right now.',
    'Whether you realize it or not, your daily habits are being tracked.',
    'Your future depends on understanding this one critical trend.',
  ),
  fillerWordsArb(20, 40),
).map(([hook, filler]) => `${hook} ${filler}`);

/** Arbitrary for intro narration containing a counterintuitive claim hook
 *  NOTE: These must NOT contain "you/your" language (which triggers personal_stakes first)
 *  or numbers/percentages (which trigger surprising_statistic first)
 *  or question marks (which trigger provocative_question first).
 */
const counterintuitiveHookNarrationArb = fc.tuple(
  fc.constantFrom(
    'Everyone thinks the economy is recovering. But the data tells a different story.',
    'Experts predicted growth. However the reality is far more complex.',
    'The conventional wisdom says to invest early. Actually the opposite might be true.',
    'Surprisingly the biggest winners are doing the exact opposite of expectations.',
  ),
  fillerWordsArb(20, 35),
).map(([hook, filler]) => `${hook} ${filler}`);

/** Arbitrary for intro narration with any valid hook pattern */
const hookNarrationArb = fc.oneof(
  statisticHookNarrationArb,
  questionHookNarrationArb,
  personalStakesHookNarrationArb,
  counterintuitiveHookNarrationArb,
);

/** Arbitrary for a ScriptSegment with intro type and hook narration */
const introSegmentWithHookArb: fc.Arbitrary<ScriptSegment> = hookNarrationArb.map(
  (narration) => ({
    id: 'intro-1',
    type: 'intro' as const,
    title: 'Introduction',
    narration,
    visualNote: 'Opening shot',
    duration: 15,
  }),
);

/** Generate narration with word count in [40, 60] range */
const validWordCountNarrationArb = fc.integer({ min: 40, max: 60 }).chain((targetWords) =>
  fc.array(
    fc.constantFrom(
      'the', 'world', 'is', 'changing', 'fast', 'and', 'we', 'need', 'to',
      'understand', 'what', 'happens', 'next', 'in', 'this', 'story', 'about',
      'how', 'things', 'work', 'today', 'for', 'everyone', 'around', 'us',
      'because', 'it', 'matters', 'more', 'than', 'ever', 'before', 'now',
      'people', 'are', 'starting', 'realize', 'that', 'something', 'big',
      'over', 'fifty', 'percent', 'of', 'companies', 'fail', 'within',
    ),
    { minLength: targetWords, maxLength: targetWords },
  ).map((words) => words.join(' ')),
);

/** Arbitrary for a ScriptSegment with valid word count */
const introSegmentValidWordCountArb: fc.Arbitrary<ScriptSegment> =
  validWordCountNarrationArb.map((narration) => ({
    id: 'intro-1',
    type: 'intro' as const,
    title: 'Introduction',
    narration,
    visualNote: 'Opening shot',
    duration: 15,
  }));

// ---------------------------------------------------------------------------
// Property 5: Hook Validation and Pattern Detection
// ---------------------------------------------------------------------------

describe('Feature: video-quality-max, Property 5: Hook Validation and Pattern Detection', () => {
  /**
   * **Validates: Requirements 4.1, 4.2**
   *
   * For any intro segment produced by the pipeline, the hook validator SHALL
   * identify a hook within the first 2 sentences that matches one of the four
   * valid patterns (surprising statistic, provocative question, personal-stakes
   * statement, or counterintuitive claim).
   */

  it('detects surprising_statistic pattern in narration with statistics', () => {
    fc.assert(
      fc.property(statisticHookNarrationArb, (narration) => {
        const pattern = detectHookPattern(narration);
        expect(pattern).toBe('surprising_statistic');
      }),
      { numRuns: 100 },
    );
  });

  it('detects provocative_question pattern in narration with questions', () => {
    fc.assert(
      fc.property(questionHookNarrationArb, (narration) => {
        const pattern = detectHookPattern(narration);
        expect(pattern).toBe('provocative_question');
      }),
      { numRuns: 100 },
    );
  });

  it('detects personal_stakes pattern in narration with you/your language', () => {
    fc.assert(
      fc.property(personalStakesHookNarrationArb, (narration) => {
        const pattern = detectHookPattern(narration);
        expect(pattern).toBe('personal_stakes');
      }),
      { numRuns: 100 },
    );
  });

  it('detects counterintuitive_claim pattern in narration with but/however/actually', () => {
    fc.assert(
      fc.property(counterintuitiveHookNarrationArb, (narration) => {
        const pattern = detectHookPattern(narration);
        expect(pattern).toBe('counterintuitive_claim');
      }),
      { numRuns: 100 },
    );
  });

  it('validateHook identifies a hook pattern for any intro segment with a hook', () => {
    fc.assert(
      fc.property(introSegmentWithHookArb, (segment) => {
        const result = validateHook(segment);

        // Must detect a hook
        expect(result.hasHook).toBe(true);

        // Pattern must be one of the four valid patterns
        expect(result.pattern).not.toBeNull();
        expect([
          'surprising_statistic',
          'provocative_question',
          'personal_stakes',
          'counterintuitive_claim',
        ]).toContain(result.pattern);

        // Hook text should be non-empty (extracted from first 2 sentences)
        expect(result.hookText.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });

  it('detectHookPattern returns null for empty or whitespace-only text', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('', '   ', '\t', '\n', '  \n  '),
        (text) => {
          const pattern = detectHookPattern(text);
          expect(pattern).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 6: Template Hook Contains Topic
// ---------------------------------------------------------------------------

describe('Feature: video-quality-max, Property 6: Template Hook Contains Topic', () => {
  /**
   * **Validates: Requirements 4.4**
   *
   * For any non-empty topic string and any valid hook pattern, the template-based
   * hook generator SHALL produce text that contains the topic name (case-insensitive
   * substring match).
   */

  it('generated template hook always contains the topic name (case-insensitive)', () => {
    fc.assert(
      fc.property(topicArb, hookPatternArb, (topic, pattern) => {
        const hook = generateTemplateHook(topic, pattern);

        // The hook must contain the topic (case-insensitive)
        expect(hook.toLowerCase()).toContain(topic.trim().toLowerCase());
      }),
      { numRuns: 100 },
    );
  });

  it('generated template hook is non-empty for any valid inputs', () => {
    fc.assert(
      fc.property(topicArb, hookPatternArb, (topic, pattern) => {
        const hook = generateTemplateHook(topic, pattern);

        expect(hook.length).toBeGreaterThan(0);
        expect(hook.trim().length).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });

  it('template hook produces different text for different patterns', () => {
    fc.assert(
      fc.property(topicArb, (topic) => {
        const hooks = new Set<string>();
        const patterns: HookPattern[] = [
          'surprising_statistic',
          'provocative_question',
          'personal_stakes',
          'counterintuitive_claim',
        ];

        for (const pattern of patterns) {
          hooks.add(generateTemplateHook(topic, pattern));
        }

        // All four patterns should produce distinct hooks
        expect(hooks.size).toBe(4);
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 7: Intro Segment Word Count
// ---------------------------------------------------------------------------

describe('Feature: video-quality-max, Property 7: Intro Segment Word Count', () => {
  /**
   * **Validates: Requirements 4.5**
   *
   * For any valid intro segment, the narration word count SHALL be between
   * 40 and 60 words inclusive.
   */

  it('validateHook reports correct word count for intro segments', () => {
    fc.assert(
      fc.property(introSegmentValidWordCountArb, (segment) => {
        const result = validateHook(segment);

        // Word count should be between 40 and 60
        expect(result.wordCount).toBeGreaterThanOrEqual(MIN_WORD_COUNT);
        expect(result.wordCount).toBeLessThanOrEqual(MAX_WORD_COUNT);

        // isWithinTarget should be true for valid word counts
        expect(result.isWithinTarget).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('validateHook reports isWithinTarget=false when word count is outside [40, 60]', () => {
    // Generate narration with too few words (1-39)
    const tooFewWordsArb = fc.integer({ min: 1, max: 39 }).chain((targetWords) =>
      fc.array(
        fc.constantFrom('word', 'test', 'short', 'text', 'here', 'now', 'go'),
        { minLength: targetWords, maxLength: targetWords },
      ).map((words) => words.join(' ')),
    );

    fc.assert(
      fc.property(tooFewWordsArb, (narration) => {
        const segment: ScriptSegment = {
          id: 'intro-1',
          type: 'intro',
          title: 'Introduction',
          narration,
          visualNote: 'Opening shot',
          duration: 15,
        };

        const result = validateHook(segment);

        expect(result.wordCount).toBeLessThan(MIN_WORD_COUNT);
        expect(result.isWithinTarget).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('validateHook reports isWithinTarget=false when word count exceeds 60', () => {
    // Generate narration with too many words (61-100)
    const tooManyWordsArb = fc.integer({ min: 61, max: 100 }).chain((targetWords) =>
      fc.array(
        fc.constantFrom(
          'word', 'test', 'long', 'text', 'here', 'now', 'go', 'more',
          'extra', 'padding', 'fill', 'space', 'with', 'many', 'words',
        ),
        { minLength: targetWords, maxLength: targetWords },
      ).map((words) => words.join(' ')),
    );

    fc.assert(
      fc.property(tooManyWordsArb, (narration) => {
        const segment: ScriptSegment = {
          id: 'intro-1',
          type: 'intro',
          title: 'Introduction',
          narration,
          visualNote: 'Opening shot',
          duration: 15,
        };

        const result = validateHook(segment);

        expect(result.wordCount).toBeGreaterThan(MAX_WORD_COUNT);
        expect(result.isWithinTarget).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('word count equals the number of whitespace-separated tokens', () => {
    fc.assert(
      fc.property(introSegmentValidWordCountArb, (segment) => {
        const result = validateHook(segment);
        const expectedWordCount = segment.narration.trim().split(/\s+/).length;

        expect(result.wordCount).toBe(expectedWordCount);
      }),
      { numRuns: 100 },
    );
  });
});
