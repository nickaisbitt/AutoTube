/**
 * Property-Based Tests — Segment-Narration Visual Relevance
 *
 * Feature: blind-review-quality-fixes, Property 5: Keyword match relevance threshold
 * Feature: blind-review-quality-fixes, Property 6: Narration noun phrases appear in search queries
 * Feature: blind-review-quality-fixes, Property 7: Segment title appears in search queries
 *
 * Validates: Requirements 3.1, 3.2, 3.4
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { scoreCandidate } from '../media';
import type { MediaCandidate } from '../media';
import { generateQueries, extractNounPhrases } from '../visualPlanner';
import type { TopicContext, NarrativeBeat } from '../../types';

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Arbitrary for a word that is > 2 chars (for keyword matching) */
const keywordArb: fc.Arbitrary<string> = fc.stringMatching(/^[a-z]{3,8}$/);

/** Arbitrary for a safe domain (not in watermark list) */
const safeDomainArb: fc.Arbitrary<string> = fc.stringMatching(/^[a-z]{4,8}\.(org|io|dev)$/);

/** Arbitrary for a NarrativeBeat */
const beatArb: fc.Arbitrary<NarrativeBeat> = fc.constantFrom(
  'hook', 'context', 'data', 'quote', 'event', 'analysis', 'conclusion', 'transition',
);

/**
 * Build a MediaCandidate with controlled alt text and safe domain.
 */
function buildCandidate(opts: { alt: string; domain?: string }): MediaCandidate {
  const domain = opts.domain || 'example.org';
  return {
    url: `https://${domain}/images/photo.jpg`,
    alt: opts.alt,
    source: 'Generic Source',
    sourceUrl: `https://${domain}/page`,
    width: 1920,
    height: 1080,
    baseScore: 100,
    query: 'test query words',
    finalScore: 0,
    type: 'image',
  };
}

/**
 * Build a minimal TopicContext for testing.
 */
function buildTopicContext(topic: string): TopicContext {
  return {
    topic,
    coreSubject: topic,
    subjectCandidates: [topic],
    kind: 'organization',
    description: '',
    entities: [],
    parseReasoning: 'test',
  };
}

// ---------------------------------------------------------------------------
// Property 5: Keyword match relevance threshold
// ---------------------------------------------------------------------------

describe('Feature: blind-review-quality-fixes, Property 5: Keyword match relevance threshold', () => {
  /**
   * **Validates: Requirements 3.1**
   *
   * For any MediaCandidate and narration text pair where the number of shared
   * keywords (words > 2 chars) between the candidate's alt text and the narration
   * is fewer than 2, the relevance score component SHALL be non-positive.
   *
   * To test this, we call scoreCandidate with and without narrationText and verify
   * that the narration relevance contribution is non-positive (score with narration
   * <= score without narration).
   */

  it('relevance component is non-positive when shared keywords < 2', () => {
    fc.assert(
      fc.property(
        // Generate alt text words that won't overlap with narration
        fc.array(keywordArb, { minLength: 1, maxLength: 5 }),
        // Generate narration words that are completely different from alt words
        fc.array(keywordArb, { minLength: 2, maxLength: 8 }),
        safeDomainArb,
        (altWords, narrationWords, domain) => {
          // Ensure alt and narration share fewer than 2 keywords
          const altSet = new Set(altWords);
          const filteredNarration = narrationWords.filter(w => !altSet.has(w));

          // Need at least 2 narration words that don't overlap
          if (filteredNarration.length < 2) return; // skip degenerate case

          const altText = altWords.join(' ');
          const narrationText = filteredNarration.join(' ');

          // Verify precondition: shared keywords < 2
          const altKeywords = new Set(altText.toLowerCase().split(/\s+/).filter(w => w.length > 2));
          const narrationKeywords = new Set(narrationText.toLowerCase().split(/\s+/).filter(w => w.length > 2));
          let sharedCount = 0;
          for (const w of altKeywords) {
            if (narrationKeywords.has(w)) sharedCount++;
          }
          if (sharedCount >= 2) return; // skip if precondition not met

          const candidate = buildCandidate({ alt: altText, domain });
          const ctx = buildTopicContext('unrelated topic xyz');

          // Score without narration (baseline)
          const scoreWithout = scoreCandidate(candidate, ctx, undefined, 'stock', undefined);
          // Score with narration (should have non-positive relevance contribution)
          const scoreWith = scoreCandidate(candidate, ctx, undefined, 'stock', narrationText);

          // The relevance component should be non-positive:
          // scoreWith <= scoreWithout (narration didn't add positive value)
          expect(scoreWith).toBeLessThanOrEqual(scoreWithout);
        },
      ),
      { numRuns: 30 },
    );
  });

  it('relevance component is non-positive even with exactly 1 shared keyword', () => {
    fc.assert(
      fc.property(
        keywordArb,
        fc.array(keywordArb, { minLength: 2, maxLength: 5 }),
        fc.array(keywordArb, { minLength: 2, maxLength: 5 }),
        safeDomainArb,
        (sharedWord, altOnlyWords, narrationOnlyWords, domain) => {
          // Ensure the "only" words don't accidentally include the shared word
          const altOnly = altOnlyWords.filter(w => w !== sharedWord);
          const narrationOnly = narrationOnlyWords.filter(w => w !== sharedWord);

          if (altOnly.length === 0 || narrationOnly.length === 0) return;

          // Build alt with exactly 1 shared keyword
          const altText = [sharedWord, ...altOnly].join(' ');
          const narrationText = [sharedWord, ...narrationOnly].join(' ');

          // Verify precondition: exactly 1 shared keyword
          const altKeywords = new Set(altText.toLowerCase().split(/\s+/).filter(w => w.length > 2));
          const narrationKeywords = new Set(narrationText.toLowerCase().split(/\s+/).filter(w => w.length > 2));
          let sharedCount = 0;
          for (const w of altKeywords) {
            if (narrationKeywords.has(w)) sharedCount++;
          }
          if (sharedCount >= 2) return; // skip if more than 1 shared

          const candidate = buildCandidate({ alt: altText, domain });
          const ctx = buildTopicContext('unrelated topic xyz');

          const scoreWithout = scoreCandidate(candidate, ctx, undefined, 'stock', undefined);
          const scoreWith = scoreCandidate(candidate, ctx, undefined, 'stock', narrationText);

          expect(scoreWith).toBeLessThanOrEqual(scoreWithout);
        },
      ),
      { numRuns: 30 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 6: Narration noun phrases appear in search queries
// ---------------------------------------------------------------------------

describe('Feature: blind-review-quality-fixes, Property 6: Narration noun phrases appear in search queries', () => {
  /**
   * **Validates: Requirements 3.2**
   *
   * For any ScriptSegment with non-empty narration containing at least one
   * multi-word noun phrase, the search queries generated by generateQueries
   * SHALL include at least one query that contains a noun phrase extracted
   * from the narration text.
   */

  it('at least one query contains a narration-derived noun phrase', () => {
    fc.assert(
      fc.property(
        beatArb,
        // Generate a narration with at least one multi-word noun phrase
        // We construct narration with capitalized multi-word phrases
        fc.tuple(keywordArb, keywordArb, keywordArb).map(
          ([w1, w2, w3]) => `The ${w1} ${w2} is important for ${w3} development`,
        ),
        fc.stringMatching(/^[A-Z][a-z]{3,8}$/).map(e => [e]),
        safeDomainArb,
        (beat, narration, entities, _domain) => {
          const ctx = buildTopicContext('Technology Innovation');

          // Verify precondition: narration has at least one multi-word noun phrase
          const nounPhrases = extractNounPhrases(narration);
          const multiWordPhrases = nounPhrases.filter(p => p.includes(' '));
          if (multiWordPhrases.length === 0) return; // skip if no multi-word phrases

          const queries = generateQueries(beat, entities, ctx, narration, 'Test Title');

          // At least one query should contain a narration-derived noun phrase
          const hasNarrationPhrase = queries.some(query => {
            const qLower = query.toLowerCase();
            return multiWordPhrases.some(phrase => qLower.includes(phrase.toLowerCase()));
          });

          expect(hasNarrationPhrase).toBe(true);
        },
      ),
      { numRuns: 30 },
    );
  });

  it('multi-word noun phrases from narration appear in queries for various beats', () => {
    fc.assert(
      fc.property(
        beatArb,
        // Generate narration with clear multi-word noun phrases
        fc.tuple(keywordArb, keywordArb).map(
          ([w1, w2]) => `The ${w1} ${w2} changed everything in the industry`,
        ),
        (beat, narration) => {
          const ctx = buildTopicContext('Global Markets');
          const entities = ['Markets'];

          const nounPhrases = extractNounPhrases(narration);
          const multiWordPhrases = nounPhrases.filter(p => p.includes(' '));
          if (multiWordPhrases.length === 0) return;

          const queries = generateQueries(beat, entities, ctx, narration, 'Segment Title');

          const hasNarrationPhrase = queries.some(query => {
            const qLower = query.toLowerCase();
            return multiWordPhrases.some(phrase => qLower.includes(phrase.toLowerCase()));
          });

          expect(hasNarrationPhrase).toBe(true);
        },
      ),
      { numRuns: 30 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 7: Segment title appears in search queries
// ---------------------------------------------------------------------------

describe('Feature: blind-review-quality-fixes, Property 7: Segment title appears in search queries', () => {
  /**
   * **Validates: Requirements 3.4**
   *
   * For any ScriptSegment with a non-empty title (length > 2), the search queries
   * generated by generateQueries SHALL include at least one query containing the
   * segment title or its significant words.
   */

  it('at least one query contains the segment title or its significant words', () => {
    fc.assert(
      fc.property(
        beatArb,
        // Generate a meaningful segment title (> 2 chars, multi-word)
        fc.tuple(keywordArb, keywordArb).map(([w1, w2]) => `${w1} ${w2}`),
        fc.constant('The narration discusses various important topics in detail'),
        (beat, title, narration) => {
          // Precondition: title length > 2
          if (title.length <= 2) return;

          const ctx = buildTopicContext('Technology Innovation');
          const entities = ['Innovation'];

          const queries = generateQueries(beat, entities, ctx, narration, title);

          // Extract significant words from title (> 2 chars, not generic)
          const GENERIC_TOPIC_WORDS = new Set([
            'launch', 'event', 'story', 'rise', 'fall', 'truth', 'secret', 'history',
            'future', 'end', 'death', 'making', 'inside', 'untold', 'real', 'meet',
            'introducing', 'breaking', 'watch', 'see', 'explained', 'revealed',
            'exposed', 'breakdown', 'analysis', 'deep', 'dive', 'minute', 'second',
            'video', 'documentary', 'short', 'movie', 'film', 'clip',
          ]);
          const USELESS_ANCHOR_WORDS = new Set([
            'the', 'real', 'true', 'actual', 'full', 'complete', 'whole', 'entire',
            'big', 'huge', 'massive', 'enormous', 'great', 'good', 'bad', 'new', 'old',
            'first', 'last', 'next', 'final', 'only', 'just', 'very', 'really',
            'look', 'looks', 'like', 'thing', 'things', 'way', 'ways', 'time', 'times',
            'now', 'then', 'here', 'there', 'where', 'when', 'what', 'who', 'how', 'why',
          ]);

          const titleWords = title
            .replace(/^(the|a|an)\s+/i, '')
            .split(/\s+/)
            .filter(w =>
              w.length > 2 &&
              !GENERIC_TOPIC_WORDS.has(w.toLowerCase()) &&
              !USELESS_ANCHOR_WORDS.has(w.toLowerCase()),
            );

          // If no significant words remain after filtering, skip
          if (titleWords.length === 0) return;

          // At least one query should contain the title or its significant words
          const titleInQuery = queries.some(q => {
            const qLower = q.toLowerCase();
            // Check if full title appears
            if (qLower.includes(title.toLowerCase())) return true;
            // Check if any significant word appears
            return titleWords.some(w => qLower.includes(w.toLowerCase()));
          });

          expect(titleInQuery).toBe(true);
        },
      ),
      { numRuns: 30 },
    );
  });

  it('title with single significant word still appears in queries', () => {
    fc.assert(
      fc.property(
        beatArb,
        // Generate a single-word title that's > 2 chars
        keywordArb.filter(w => w.length > 2),
        (beat, title) => {
          const ctx = buildTopicContext('Global Economy');
          const entities = ['Economy'];
          const narration = 'This segment covers important developments in the field';

          const queries = generateQueries(beat, entities, ctx, narration, title);

          // The title word should appear in at least one query
          const titleInQuery = queries.some(q =>
            q.toLowerCase().includes(title.toLowerCase()),
          );

          expect(titleInQuery).toBe(true);
        },
      ),
      { numRuns: 30 },
    );
  });
});
