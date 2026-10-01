/**
 * Bug Condition Exploration Test — JSON Extraction from Wrapped LLM Responses
 *
 * This test verifies that the extractJson utility correctly handles LLM responses
 * containing:
 * (a) Markdown fences with trailing content after closing fence
 * (b) Prose wrapping around JSON
 * (c) Mixed prose + fences
 *
 * The old parsing logic used anchored regex (^/$) which failed on these cases.
 * The new extractJson utility uses flexible strategies to handle all wrapping formats.
 *
 * EXPECTED: This test PASSES on fixed code — confirms the bug is fixed.
 *
 * Validates: Requirements 1.4, 1.5
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { extractJson } from '../extractJson';

// ---------------------------------------------------------------------------
// Property-Based Test: Bug Condition — JSON Extraction Fails on Wrapped Responses
// ---------------------------------------------------------------------------

function deepEqualWithNegativeZero(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null) {
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const aKeys = Object.keys(aObj);
    const bKeys = Object.keys(bObj);
    if (aKeys.length !== bKeys.length) return false;
    for (const key of aKeys) {
      if (!(key in bObj)) return false;
      const av = aObj[key];
      const bv = bObj[key];
      if (av === 0 && bv === 0) continue;
      if (!deepEqualWithNegativeZero(av, bv)) return false;
    }
    return true;
  }
  return false;
}

describe('Bug Condition: JSON Extraction Succeeds on Wrapped LLM Responses', () => {
  /**
   * **Validates: Requirements 1.4**
   *
   * Property: When valid JSON is wrapped in markdown fences with extra text
   * after the closing fence (e.g., a trailing explanation or extra newlines
   * with whitespace), extractJson should extract the JSON object.
   */
  it('should extract JSON from markdown fences with content after closing fence', () => {
    fc.assert(
      fc.property(
        fc.dictionary(fc.string({ minLength: 1, maxLength: 5 }), fc.oneof(
          fc.float({ noNaN: true, noDefaultInfinity: true }),
          fc.string({ maxLength: 10 }),
          fc.boolean(),
          fc.integer(),
        ), { minKeys: 1, maxKeys: 4 }),
        (obj) => {
          const jsonStr = JSON.stringify(obj);
          // Wrap in fences with trailing text after closing fence (triggers bug 1.4)
          // LLMs often add explanatory text after the code block
          const wrapped = '```json\n' + jsonStr + '\n```\nHope this helps!';

          const result = extractJson(wrapped);
          expect(deepEqualWithNegativeZero(result, obj)).toBe(true);
        },
      ),
      { numRuns: 50 },
    );
  });

  /**
   * **Validates: Requirements 1.5**
   *
   * Property: When valid JSON is embedded within prose text (e.g.,
   * "Here is the result: {...}"), extractJson should extract the JSON object.
   */
  it('should extract JSON from prose-wrapped responses', () => {
    fc.assert(
      fc.property(
        fc.dictionary(fc.string({ minLength: 1, maxLength: 5 }), fc.oneof(
          fc.float({ noNaN: true, noDefaultInfinity: true }),
          fc.string({ maxLength: 10 }),
          fc.boolean(),
          fc.integer(),
        ), { minKeys: 1, maxKeys: 4 }),
        (obj) => {
          const jsonStr = JSON.stringify(obj);
          // Wrap in prose (triggers bug 1.5)
          const wrapped = 'Here is the result: ' + jsonStr;

          const result = extractJson(wrapped);
          expect(deepEqualWithNegativeZero(result, obj)).toBe(true);
        },
      ),
      { numRuns: 50 },
    );
  });

  /**
   * **Validates: Requirements 1.4, 1.5**
   *
   * Property: When valid JSON is wrapped in markdown fences with prose text
   * before and after (e.g., "Based on analysis:\n```json\n{...}\n```\nLet me know"),
   * extractJson should extract the JSON object.
   */
  it('should extract JSON from mixed prose + fence responses', () => {
    fc.assert(
      fc.property(
        fc.dictionary(fc.string({ minLength: 1, maxLength: 5 }), fc.oneof(
          fc.float({ noNaN: true, noDefaultInfinity: true }),
          fc.string({ maxLength: 10 }),
          fc.boolean(),
          fc.integer(),
        ), { minKeys: 1, maxKeys: 4 }),
        (obj) => {
          const jsonStr = JSON.stringify(obj);
          // Mixed prose + fences (triggers both 1.4 and 1.5)
          const wrapped = 'Based on analysis:\n```json\n' + jsonStr + '\n```\nLet me know';

          const result = extractJson(wrapped);
          expect(deepEqualWithNegativeZero(result, obj)).toBe(true);
        },
      ),
      { numRuns: 50 },
    );
  });
});
