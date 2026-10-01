import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { scoreCandidate } from '../media';
import type { MediaCandidate } from '../media';
import type { TopicContext } from '../../types';

/**
 * **Validates: Requirements 2.14**
 *
 * Property: For any candidate set containing both Picsum/Unsplash fallback
 * images and real DDG/Wikimedia results that have positive topic overlap,
 * the fallback images should never outrank the real results.
 */

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Generate a topic word (3+ chars, lowercase alpha) */
const topicWordArb = fc.stringMatching(/^[a-z]{3,10}$/);

/** Generate a topic context with 1-3 topic words */
const topicContextArb = fc
  .array(topicWordArb, { minLength: 1, maxLength: 3 })
  .map((words): TopicContext => {
    const topic = words.join(' ');
    return {
      topic,
      coreSubject: words[0],
      subjectCandidates: words,
      kind: 'concept',
      description: `About ${topic}`,
      entities: [],
      parseReasoning: 'generated',
    };
  });

/** Generate a Picsum fallback candidate (baseScore 30) */
const picsumCandidateArb = fc
  .record({
    seed: fc.stringMatching(/^[a-z0-9-]{1,20}$/),
    query: fc.stringMatching(/^[a-z]{3,8}( [a-z]{3,8}){0,2}$/),
  })
  .map(({ seed, query }): MediaCandidate => ({
    url: `https://picsum.photos/seed/${seed}/1280/720`,
    alt: query,
    source: fc.sample(fc.constantFrom('Picsum Photos', 'Picsum (Unsplash fallback)'), 1)[0],
    baseScore: 30,
    query,
    finalScore: 0,
    type: 'image',
    width: 1280,
    height: 720,
  }));

/** Generate a "real" DDG or Wikimedia candidate that has positive topic overlap.
 *  The alt text includes at least one topic word to ensure topic overlap. */
const realCandidateArb = (topicWords: string[]) => {
  // Pick one topic word to embed in the alt text for guaranteed overlap
  const topicWord = topicWords[0];
  return fc
    .record({
      sourceType: fc.constantFrom('ddg', 'wikimedia') as fc.Arbitrary<'ddg' | 'wikimedia'>,
      extraAlt: fc.stringMatching(/^[a-z]{3,8}( [a-z]{3,8}){0,2}$/),
    })
    .map(({ sourceType, extraAlt }): MediaCandidate => {
      const isDDG = sourceType === 'ddg';
      const query = `${topicWord} ${extraAlt}`;
      return {
        url: isDDG
          ? `https://example.com/${topicWord}-image.jpg`
          : `https://upload.wikimedia.org/${topicWord}.png`,
        alt: `${topicWord} ${extraAlt}`,
        source: isDDG ? `DuckDuckGo · example.com` : 'Wikimedia Commons',
        sourceUrl: isDDG
          ? `https://example.com/${topicWord}-article`
          : `https://commons.wikimedia.org/wiki/File:${topicWord}.png`,
        width: 1280,
        height: 720,
        baseScore: isDDG ? 180 : 160,
        query,
        finalScore: 0,
        type: 'image',
      };
    });
};

// ---------------------------------------------------------------------------
// Property test
// ---------------------------------------------------------------------------

describe('Fallback image score property test', () => {
  it('14.5 Picsum/Unsplash candidates never outrank real results with positive topic overlap', () => {
    fc.assert(
      fc.property(
        topicContextArb.chain((ctx) =>
          fc.tuple(
            fc.constant(ctx),
            fc.array(picsumCandidateArb, { minLength: 1, maxLength: 4 }),
            fc.array(realCandidateArb(ctx.subjectCandidates), { minLength: 1, maxLength: 4 }),
            fc.constantFrom('stock' as const, 'raw' as const),
          ),
        ),
        ([topicContext, picsumCandidates, realCandidates, sourceType]) => {
          // Score all candidates
          const picsumScores = picsumCandidates.map((c) =>
            scoreCandidate(c, topicContext, undefined, sourceType),
          );
          const realScores = realCandidates.map((c) =>
            scoreCandidate(c, topicContext, undefined, sourceType),
          );

          const maxPicsumScore = Math.max(...picsumScores);
          const maxRealScore = Math.max(...realScores);

          // The best real result (with topic overlap) should always beat the best Picsum result
          expect(maxPicsumScore).toBeLessThan(maxRealScore);
        },
      ),
      { numRuns: 200 },
    );
  });
});
