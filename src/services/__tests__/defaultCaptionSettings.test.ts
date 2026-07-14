import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { defaultCaptionSettings, YOUTUBE_CAPTION_MAX_WORDS } from '../aiEditor';

// ── Unit Tests ──────────────────────────────────────────────────────────────

describe('defaultCaptionSettings', () => {
  /**
   * YouTube-ready: always ≤4 words per caption window (Hormozi-style).
   */
  it('returns 4-word YouTube defaults for empty string', () => {
    const result = defaultCaptionSettings('');
    expect(result).toEqual({
      wordsPerWindow: YOUTUBE_CAPTION_MAX_WORDS,
      displayDurationMs: Math.round((YOUTUBE_CAPTION_MAX_WORDS / 3) * 1000),
      isFastPaced: true,
    });
  });

  it('returns 4-word YouTube defaults for whitespace-only string', () => {
    const result = defaultCaptionSettings('   \t\n  ');
    expect(result.wordsPerWindow).toBe(4);
    expect(result.isFastPaced).toBe(true);
  });

  it('caps wordsPerWindow at 4 for short narration', () => {
    const result = defaultCaptionSettings('This is a valid narration text');
    expect(result.wordsPerWindow).toBe(4);
    expect(result.displayDurationMs).toBe(1333);
  });

  it('caps wordsPerWindow at 4 for medium narration (51-100 words)', () => {
    const text = Array(60).fill('word').join(' ');
    const result = defaultCaptionSettings(text);
    expect(result.wordsPerWindow).toBe(4);
    expect(result.isFastPaced).toBe(true);
  });

  it('caps wordsPerWindow at 4 for long narration (>100 words)', () => {
    const text = Array(120).fill('word').join(' ');
    const result = defaultCaptionSettings(text);
    expect(result.wordsPerWindow).toBe(4);
    expect(result.isFastPaced).toBe(true);
  });
});

// ── Property-Based Tests ────────────────────────────────────────────────────

describe('defaultCaptionSettings property tests', () => {
  it('wordsPerWindow is always exactly 4 for any string input', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const result = defaultCaptionSettings(input);
        expect(result.wordsPerWindow).toBe(YOUTUBE_CAPTION_MAX_WORDS);
        expect(result.wordsPerWindow).toBeLessThanOrEqual(20);
        expect(result.wordsPerWindow).toBeGreaterThanOrEqual(1);
      }),
      { numRuns: 200 },
    );
  });
});
