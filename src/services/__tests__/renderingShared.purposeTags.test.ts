import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { assignPurposeTag } from '../renderingShared';
import type { SegmentPurposeTag } from '../../types';

// ---------------------------------------------------------------------------
// Property 7: Purpose Tags Are From Valid Set
// Feature: autotube-quality-phase-3
// **Validates: Requirement 11.1**
// ---------------------------------------------------------------------------

const VALID_PURPOSE_TAGS: SegmentPurposeTag[] = [
  'stat_hook',
  'history',
  'moat',
  'risk',
  'prediction',
  'human_story',
  'competitive_analysis',
  'transition_bridge',
  'conclusion',
];

const SEGMENT_TYPES = ['intro', 'section', 'transition', 'outro'] as const;

describe('Property 7: Purpose Tags Are From Valid Set', () => {
  /**
   * Arbitrary for random segments: random type from the valid set,
   * random title and narration strings of varying lengths.
   */
  const segmentArb = fc.record({
    type: fc.constantFrom(...SEGMENT_TYPES),
    title: fc.string({ minLength: 0, maxLength: 200 }),
    narration: fc.string({ minLength: 0, maxLength: 500 }),
  });

  it('returns a valid purpose tag for all random segments', () => {
    fc.assert(
      fc.property(segmentArb, (segment) => {
        const tag = assignPurposeTag(segment);
        expect(VALID_PURPOSE_TAGS).toContain(tag);
      }),
      { numRuns: 1000 },
    );
  });

  it('returns a valid purpose tag for segments with statistical content in narration', () => {
    const statNarrationArb = fc.oneof(
      fc.constant('Revenue grew by 42% last quarter.'),
      fc.constant('The company is worth $3.5 billion today.'),
      fc.constant('Over 1 million users signed up in 2024.'),
      fc.nat({ max: 999999 }).map(n => `They earned $${n.toLocaleString()} in revenue.`),
      fc.nat({ max: 100 }).map(n => `Market share increased by ${n}% year over year.`),
    );

    const statSegmentArb = fc.record({
      type: fc.constantFrom(...SEGMENT_TYPES),
      title: fc.string({ minLength: 0, maxLength: 100 }),
      narration: statNarrationArb,
    });

    fc.assert(
      fc.property(statSegmentArb, (segment) => {
        const tag = assignPurposeTag(segment);
        expect(VALID_PURPOSE_TAGS).toContain(tag);
      }),
      { numRuns: 300 },
    );
  });

  it('returns a valid purpose tag for segments with keyword-rich content', () => {
    const keywordNarrations = [
      'The risk of failure is enormous.',
      'Experts predict this will change by 2030.',
      'The history of the company began in 1998.',
      'Their competitive advantage is unmatched.',
      'The moat around this business is deep.',
      'John Smith led the transformation.',
    ];

    const keywordSegmentArb = fc.record({
      type: fc.constantFrom(...SEGMENT_TYPES),
      title: fc.string({ minLength: 0, maxLength: 100 }),
      narration: fc.constantFrom(...keywordNarrations),
    });

    fc.assert(
      fc.property(keywordSegmentArb, (segment) => {
        const tag = assignPurposeTag(segment);
        expect(VALID_PURPOSE_TAGS).toContain(tag);
      }),
      { numRuns: 300 },
    );
  });

  it('returns transition_bridge for transition segments', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 200 }),
        fc.string({ minLength: 0, maxLength: 500 }),
        (title, narration) => {
          const tag = assignPurposeTag({ type: 'transition', title, narration });
          expect(tag).toBe('transition_bridge');
        },
      ),
      { numRuns: 200 },
    );
  });

  it('returns conclusion for outro segments', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 200 }),
        fc.string({ minLength: 0, maxLength: 500 }),
        (title, narration) => {
          const tag = assignPurposeTag({ type: 'outro', title, narration });
          expect(tag).toBe('conclusion');
        },
      ),
      { numRuns: 200 },
    );
  });
});
