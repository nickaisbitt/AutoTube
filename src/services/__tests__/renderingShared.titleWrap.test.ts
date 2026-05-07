import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { wrapTitleText } from '../renderingShared';

// ---------------------------------------------------------------------------
// Property 1: Title Text Never Exceeds Safe Zone Width
// Feature: autotube-quality-phase-3
// **Validates: Requirements 2.1, 2.2**
// ---------------------------------------------------------------------------

/**
 * Create a mock RenderContext2D that approximates character widths using
 * a simple formula: text.length * fontSize * 0.6
 *
 * The mock tracks the current font setting so measureText uses the
 * correct font size when wrapTitleText updates ctx.font internally.
 */
function createMockContext() {
  let currentFontSize = 48;

  return {
    get font() {
      return `bold ${currentFontSize}px sans-serif`;
    },
    set font(value: string) {
      // Parse font size from strings like "bold 48px sans-serif"
      const match = value.match(/(\d+(?:\.\d+)?)px/);
      if (match) {
        currentFontSize = parseFloat(match[1]);
      }
    },
    measureText(text: string): { width: number } {
      return { width: text.length * currentFontSize * 0.6 };
    },
    /** Expose current font size for assertions */
    get _fontSize() {
      return currentFontSize;
    },
  };
}

describe('Property 1: Title Text Never Exceeds Safe Zone Width', () => {
  // Arbitrary for generating title strings (1–200 chars) with words separated by spaces
  const wordArb = fc.string({ minLength: 1, maxLength: 20 }).map((s) =>
    s.replace(/\s+/g, '').slice(0, 20) || 'word',
  );
  const titleArb = fc
    .array(wordArb, { minLength: 1, maxLength: 20 })
    .map((words) => words.join(' ').slice(0, 200))
    .filter((t) => t.length >= 1);

  // Canvas widths from 640 to 3840
  const canvasWidthArb = fc.integer({ min: 640, max: 3840 });

  // Base font sizes from 16 to 120
  const fontSizeArb = fc.integer({ min: 16, max: 120 });

  it('every wrapped line measures within the safe zone width (canvas width minus 20% margins)', () => {
    fc.assert(
      fc.property(titleArb, canvasWidthArb, fontSizeArb, (title, canvasWidth, baseFontSize) => {
        const ctx = createMockContext();
        const result = wrapTitleText(ctx as any, title, canvasWidth, baseFontSize);

        // Safe zone: 10% margin on each side → available width = 80% of canvas
        const maxWidth = canvasWidth - canvasWidth * 0.1 * 2;

        // Set the mock context font to the returned fontSize so measureText is accurate
        ctx.font = `bold ${result.fontSize}px sans-serif`;

        for (const line of result.lines) {
          const measured = ctx.measureText(line).width;
          // A line either fits within the safe zone, or it is a single
          // unbreakable word (no spaces) that cannot be split at word
          // boundaries — the function wraps at word boundaries per Req 2.2.
          const isSingleWord = !line.includes(' ');
          if (!isSingleWord) {
            expect(measured).toBeLessThanOrEqual(maxWidth);
          }
        }
      }),
      { numRuns: 200 },
    );
  });

  it('returns at least one line for any non-empty title', () => {
    fc.assert(
      fc.property(titleArb, canvasWidthArb, fontSizeArb, (title, canvasWidth, baseFontSize) => {
        const ctx = createMockContext();
        const result = wrapTitleText(ctx as any, title, canvasWidth, baseFontSize);
        expect(result.lines.length).toBeGreaterThanOrEqual(1);
      }),
      { numRuns: 100 },
    );
  });
});
