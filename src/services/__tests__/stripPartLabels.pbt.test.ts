// Feature: video-quality-from-reviews, Properties for stripPartLabels
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { stripPartLabels } from '../llm/index';

/**
 * **Validates: Requirements 2.3**
 *
 * Property 10: stripPartLabels idempotency
 *
 * For any input string, applying `stripPartLabels` twice yields the same
 * result as applying it once:
 *   stripPartLabels(stripPartLabels(text)) === stripPartLabels(text)
 */

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Generates strings that include "Part X of Y" patterns mixed with other text */
const partLabelStringArb = fc.tuple(
  fc.string({ maxLength: 50 }),
  fc.constantFrom('Part', 'Section', 'Segment'),
  fc.integer({ min: 1, max: 99 }),
  fc.option(fc.integer({ min: 1, max: 99 }), { nil: undefined }),
  fc.constantFrom(':', ' ', '- ', '— ', '– ', ': '),
  fc.string({ maxLength: 50 }),
).map(([prefix, label, num, total, sep, suffix]) => {
  const ofPart = total !== undefined ? ` of ${total}` : '';
  return `${prefix}${label} ${num}${ofPart}${sep}${suffix}`;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Property 10: stripPartLabels idempotency', () => {
  it('should be idempotent for arbitrary strings', () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        const once = stripPartLabels(text);
        const twice = stripPartLabels(once);
        expect(twice).toBe(once);
      }),
      { numRuns: 200 },
    );
  });

  it('should be idempotent for strings containing part label patterns', () => {
    fc.assert(
      fc.property(partLabelStringArb, (text) => {
        const once = stripPartLabels(text);
        const twice = stripPartLabels(once);
        expect(twice).toBe(once);
      }),
      { numRuns: 200 },
    );
  });
});

/**
 * **Validates: Requirements 2.1**
 *
 * Property: stripPartLabels output never contains part label patterns
 *
 * For any input string (including strings that contain part label patterns),
 * the output of `stripPartLabels` must NOT match the core part label regex:
 *   /\b(?:Part|Section|Segment)\s+\d+\s*(?:of\s+\d+)?/gi
 */

const PART_LABEL_CORE_REGEX = /\b(?:Part|Section|Segment)\s+\d+\s*(?:of\s+\d+)?/gi;

describe('Property: stripPartLabels output never contains part label patterns', () => {
  it('should produce output with no part label patterns for arbitrary strings', () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        const result = stripPartLabels(text);
        expect(result).not.toMatch(PART_LABEL_CORE_REGEX);
      }),
      { numRuns: 200 },
    );
  });

  it('should produce output with no part label patterns for strings containing part labels', () => {
    fc.assert(
      fc.property(partLabelStringArb, (text) => {
        const result = stripPartLabels(text);
        expect(result).not.toMatch(PART_LABEL_CORE_REGEX);
      }),
      { numRuns: 200 },
    );
  });
});
