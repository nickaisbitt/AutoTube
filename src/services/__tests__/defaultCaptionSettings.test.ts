import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { defaultCaptionSettings } from '../aiEditor';

// ── Unit Tests ──────────────────────────────────────────────────────────────

describe('defaultCaptionSettings', () => {
  /**
   * Task 11.2: Empty narration text returns safe defaults.
   * **Validates: Requirements 2.11**
   */
  it('returns safe defaults for empty string', () => {
    const result = defaultCaptionSettings('');
    expect(result).toEqual({
      wordsPerWindow: 8,
      displayDurationMs: 2667,
      isFastPaced: false,
    });
  });

  it('returns safe defaults for whitespace-only string', () => {
    const result = defaultCaptionSettings('   \t\n  ');
    expect(result).toEqual({
      wordsPerWindow: 8,
      displayDurationMs: 2667,
      isFastPaced: false,
    });
  });

  /**
   * Task 11.3: Valid narration text produces unchanged behavior.
   * **Validates: Requirements 3.11**
   */
  it('returns wordsPerWindow 6 for short text (≤50 words)', () => {
    const result = defaultCaptionSettings('This is a valid narration text');
    expect(result.wordsPerWindow).toBe(6);
    expect(result.displayDurationMs).toBe(2000);
    expect(result.isFastPaced).toBe(false);
  });

  it('returns wordsPerWindow 8 for medium text (51-100 words)', () => {
    // Generate exactly 60 words
    const text = Array(60).fill('word').join(' ');
    const result = defaultCaptionSettings(text);
    expect(result.wordsPerWindow).toBe(8);
    expect(result.displayDurationMs).toBe(2667);
    expect(result.isFastPaced).toBe(false);
  });

  it('returns wordsPerWindow 10 for long text (>100 words)', () => {
    const text = Array(120).fill('word').join(' ');
    const result = defaultCaptionSettings(text);
    expect(result.wordsPerWindow).toBe(10);
    expect(result.displayDurationMs).toBe(3333);
    expect(result.isFastPaced).toBe(false);
  });
});

// ── Property-Based Tests ────────────────────────────────────────────────────

describe('defaultCaptionSettings property tests', () => {
  /**
   * Task 11.4: For any random string, wordsPerWindow is always in [1, 20].
   * **Validates: Requirements 2.11**
   */
  it('wordsPerWindow is always in [1, 20] for any string input', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const result = defaultCaptionSettings(input);
        expect(result.wordsPerWindow).toBeGreaterThanOrEqual(1);
        expect(result.wordsPerWindow).toBeLessThanOrEqual(20);
      }),
      { numRuns: 200 },
    );
  });
});
