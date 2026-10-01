// Feature: codebase-robustness-audit, Property 16: parseSegmentsFromContent handles multiple formats
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { parseSegmentsFromContent, stripPartLabels } from '../llm/index';
import type { ScriptSegment } from '../../types';

/**
 * **Validates: Requirements 17.5**
 *
 * Property 16: parseSegmentsFromContent handles multiple formats
 *
 * For any valid segments array serialized as bare JSON array, wrapped in
 * `{ "segments": [...] }`, or enclosed in markdown code fences,
 * `parseSegmentsFromContent` SHALL successfully parse and return valid segments.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_TYPES = new Set(['intro', 'section', 'transition', 'outro']);

function isValidScriptSegment(seg: ScriptSegment): boolean {
  return (
    typeof seg.id === 'string' &&
    seg.id.length > 0 &&
    VALID_TYPES.has(seg.type) &&
    typeof seg.title === 'string' &&
    seg.title.length > 0 &&
    typeof seg.narration === 'string' &&
    seg.narration.length > 0 &&
    typeof seg.visualNote === 'string' &&
    seg.visualNote.length > 0 &&
    typeof seg.duration === 'number' &&
    Number.isFinite(seg.duration) &&
    seg.duration > 0
  );
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Arbitrary for a valid segment object (as it would appear in JSON) */
const validSegmentObjArb = fc.record({
  type: fc.constantFrom('intro', 'section', 'transition', 'outro'),
  title: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
  narration: fc.string({ minLength: 1, maxLength: 200 }).filter((s) => s.trim().length > 0),
  visualNote: fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
  duration: fc.integer({ min: 5, max: 60 }),
});

/** Arbitrary for a non-empty array of valid segment objects */
const segmentsArrayArb = fc.array(validSegmentObjArb, { minLength: 1, maxLength: 5 });

/** Arbitrary for the serialization format */
const formatArb = fc.constantFrom('bare-array', 'segments-wrapper', 'markdown-fences');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Property 16: parseSegmentsFromContent handles multiple formats', () => {
  it('should parse valid segments from bare JSON array, { segments: [...] } wrapper, and markdown code fences', () => {
    fc.assert(
      fc.property(segmentsArrayArb, formatArb, (segmentObjs, format) => {
        const jsonArray = JSON.stringify(segmentObjs);
        let content: string;

        switch (format) {
          case 'bare-array':
            content = jsonArray;
            break;
          case 'segments-wrapper':
            content = JSON.stringify({ segments: segmentObjs });
            break;
          case 'markdown-fences':
            content = '```json\n' + jsonArray + '\n```';
            break;
          default:
            content = jsonArray;
        }

        const result = parseSegmentsFromContent(content);

        // Must return the same number of segments as input
        expect(result.length).toBe(segmentObjs.length);

        // Each returned segment must be a valid ScriptSegment
        for (let i = 0; i < result.length; i++) {
          expect(isValidScriptSegment(result[i])).toBe(true);

          // The parsed segment should preserve the original values
          expect(result[i].type).toBe(segmentObjs[i].type);
          expect(result[i].title).toBe(segmentObjs[i].title.trim());
          expect(result[i].narration).toBe(stripPartLabels(segmentObjs[i].narration.trim()));
          expect(result[i].visualNote).toBe(segmentObjs[i].visualNote.trim());
          expect(result[i].duration).toBe(segmentObjs[i].duration);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('should handle markdown fences with extra whitespace and preamble text', () => {
    fc.assert(
      fc.property(
        segmentsArrayArb,
        fc.string({ maxLength: 50 }).filter((s) => !s.includes('```') && !s.includes('[') && !s.includes('{')),
        (segmentObjs, preamble) => {
          const jsonArray = JSON.stringify(segmentObjs);
          // Simulate LLM response with preamble text before the code fence
          const content = `${preamble}\n\`\`\`json\n${jsonArray}\n\`\`\``;

          const result = parseSegmentsFromContent(content);

          expect(result.length).toBe(segmentObjs.length);
          for (const seg of result) {
            expect(isValidScriptSegment(seg)).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should handle { segments: [...] } wrapper with extra fields', () => {
    fc.assert(
      fc.property(segmentsArrayArb, (segmentObjs) => {
        // Wrap in an object with extra fields (as some LLMs might return)
        const content = JSON.stringify({
          segments: segmentObjs,
          metadata: { model: 'test', version: '1.0' },
        });

        const result = parseSegmentsFromContent(content);

        expect(result.length).toBe(segmentObjs.length);
        for (const seg of result) {
          expect(isValidScriptSegment(seg)).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });
});
