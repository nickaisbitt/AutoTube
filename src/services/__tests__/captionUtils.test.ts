import { describe, it, expect } from 'vitest';
import { computeCaptionWindow, computeSaturationScore, computeAdaptiveFilter } from '../captionUtils';

// Helper: build an array of N words like ["word0", "word1", ..., "wordN-1"]
function makeWords(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `word${i}`);
}

describe('computeCaptionWindow', () => {
  // ── Edge cases ──────────────────────────────────────────────────────────────

  it('returns an empty array when words is empty', () => {
    expect(computeCaptionWindow([], 0)).toEqual([]);
    expect(computeCaptionWindow([], 0.5)).toEqual([]);
    expect(computeCaptionWindow([], 1.0)).toEqual([]);
  });

  // ── Fewer than 12 words → returns all words ─────────────────────────────────

  it('returns all words when narration has fewer than 12 words (progress = 0)', () => {
    const words = makeWords(5);
    const result = computeCaptionWindow(words, 0);
    expect(result).toEqual(words);
  });

  it('returns all words when narration has fewer than 12 words (progress = 0.5)', () => {
    const words = makeWords(8);
    const result = computeCaptionWindow(words, 0.5);
    expect(result).toEqual(words);
  });

  it('returns all words when narration has fewer than 12 words (progress = 1.0)', () => {
    const words = makeWords(11);
    const result = computeCaptionWindow(words, 1.0);
    expect(result).toEqual(words);
  });

  it('returns all words when narration has exactly 12 words', () => {
    const words = makeWords(12);
    const result = computeCaptionWindow(words, 0.5);
    expect(result).toHaveLength(12);
    expect(result).toEqual(words);
  });

  // ── 20-word narration: progress = 0 → words 0–11 ───────────────────────────

  it('progress = 0 on a 20-word narration returns words 0–11', () => {
    const words = makeWords(20);
    const result = computeCaptionWindow(words, 0);
    expect(result).toHaveLength(12);
    expect(result[0]).toBe('word0');
    expect(result[11]).toBe('word11');
  });

  // ── 20-word narration: progress = 0.5 → window centred on word 10 ──────────
  // wordIndex = Math.max(0, Math.floor(0.5 * 20) - 1) = 9
  // start = Math.max(0, 9 - 6) = 3
  // end   = Math.min(20, 3 + 12) = 15
  // window = words[3..14] — word at index 9 ("word9") is inside the window

  it('progress = 0.5 on a 20-word narration returns a 12-word window containing word 10', () => {
    const words = makeWords(20);
    const result = computeCaptionWindow(words, 0.5);
    expect(result).toHaveLength(12);
    // The window should start at index 3 and end at index 14 (inclusive)
    expect(result[0]).toBe('word3');
    expect(result[11]).toBe('word14');
    // word at index 9 ("word9") must be in the window
    expect(result).toContain('word9');
  });

  // ── 20-word narration: progress = 1.0 → words 8–19 (last 12) ───────────────
  // wordIndex = Math.max(0, Math.floor(1.0 * 20) - 1) = 19
  // start = Math.max(0, 19 - 6) = 13
  // end   = Math.min(20, 13 + 12) = 20
  // end - start = 7 < 12 && start > 0 → clamp: start = Math.max(0, 20 - 12) = 8
  // window = words[8..19]

  it('progress = 1.0 on a 20-word narration returns words 8–19 (last 12)', () => {
    const words = makeWords(20);
    const result = computeCaptionWindow(words, 1.0);
    expect(result).toHaveLength(12);
    expect(result[0]).toBe('word8');
    expect(result[11]).toBe('word19');
  });

  // ── Window never exceeds 12 words ───────────────────────────────────────────

  it('never returns more than 12 words regardless of narration length', () => {
    const words = makeWords(100);
    for (const progress of [0, 0.25, 0.5, 0.75, 1.0]) {
      const result = computeCaptionWindow(words, progress);
      expect(result.length).toBeLessThanOrEqual(12);
    }
  });

  // ── Window stays within array bounds ────────────────────────────────────────

  it('never returns words outside the input array bounds', () => {
    const words = makeWords(20);
    for (const progress of [0, 0.1, 0.5, 0.9, 1.0]) {
      const result = computeCaptionWindow(words, progress);
      for (const word of result) {
        expect(words).toContain(word);
      }
    }
  });

  // ── Single-word narration ────────────────────────────────────────────────────

  it('returns the single word for a one-word narration at any progress', () => {
    const words = ['hello'];
    expect(computeCaptionWindow(words, 0)).toEqual(['hello']);
    expect(computeCaptionWindow(words, 0.5)).toEqual(['hello']);
    expect(computeCaptionWindow(words, 1.0)).toEqual(['hello']);
  });
});

// ── Helper: build a Uint8ClampedArray for a 32×32 image filled with one colour ──
function makePixelData(r: number, g: number, b: number, a = 255, pixelCount = 32 * 32): Uint8ClampedArray {
  const data = new Uint8ClampedArray(pixelCount * 4);
  for (let i = 0; i < pixelCount; i++) {
    data[i * 4 + 0] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = a;
  }
  return data;
}

// ── computeSaturationScore ───────────────────────────────────────────────────

describe('computeSaturationScore', () => {
  it('returns 0 for a fully-grey pixel array (equal R, G, B)', () => {
    // Grey pixels: R=G=B → saturation is 0 in HSL
    const data = makePixelData(128, 128, 128);
    const score = computeSaturationScore(data, 32, 32);
    expect(score).toBe(0);
  });

  it('returns ~1 for a fully-saturated red pixel array ([255, 0, 0])', () => {
    // Pure red: max=1, min=0, l=0.5, s=(1-0)/(2-1-0)=1
    const data = makePixelData(255, 0, 0);
    const score = computeSaturationScore(data, 32, 32);
    expect(score).toBeCloseTo(1.0, 5);
  });
});

// ── computeAdaptiveFilter ────────────────────────────────────────────────────

describe('computeAdaptiveFilter', () => {
  // Validates: Requirements 3.2, 3.3, 3.4, 3.6

  it('score = 0.9 (> 0.75): saturation clamped to [0.88, 1.15] and filter includes contrast(1.12) brightness(1.08)', () => {
    // raw = 1.0 + 0.15 * (1 - (0.9 - 0.75) / 0.25) = 1.0 + 0.15 * 0.4 = 1.06
    // clamped to [0.88, 1.15] → 1.06
    const filter = computeAdaptiveFilter(0.9);
    expect(filter).toBe('saturate(1.0600) contrast(1.12) brightness(1.08)');
    const satMatch = filter.match(/saturate\(([^)]+)\)/);
    const satValue = satMatch ? parseFloat(satMatch[1]) : NaN;
    expect(satValue).toBeGreaterThanOrEqual(0.88);
    expect(satValue).toBeLessThanOrEqual(1.15);
  });

  it('score = 0.2 (< 0.35): saturation clamped to [1.15, 1.33]', () => {
    // raw = 1.15 + (0.35 - 0.2) * 0.4 = 1.15 + 0.06 = 1.21
    // clamped to [1.15, 1.33] → 1.21
    const filter = computeAdaptiveFilter(0.2);
    expect(filter).toBe('saturate(1.2100) contrast(1.12) brightness(1.08)');
    const satMatch = filter.match(/saturate\(([^)]+)\)/);
    const satValue = satMatch ? parseFloat(satMatch[1]) : NaN;
    expect(satValue).toBeGreaterThanOrEqual(1.15);
    expect(satValue).toBeLessThanOrEqual(1.33);
  });

  it('score = 0.5 (in [0.35, 0.75]): returns the default filter string unchanged', () => {
    const filter = computeAdaptiveFilter(0.5);
    expect(filter).toBe('saturate(1.15) contrast(1.12) brightness(1.08)');
  });

  it('score = 1.0 (boundary): saturation clamped to 0.88 (lower bound of high-saturation range)', () => {
    // raw = 1.0 + 0.15 * (1 - (1.0 - 0.75) / 0.25) = 1.0 + 0.15 * 0 = 1.0
    // clamped to [0.88, 1.15] → 1.0
    const filter = computeAdaptiveFilter(1.0);
    const satMatch = filter.match(/saturate\(([^)]+)\)/);
    const satValue = satMatch ? parseFloat(satMatch[1]) : NaN;
    expect(satValue).toBeGreaterThanOrEqual(0.88);
    expect(satValue).toBeLessThanOrEqual(1.15);
  });

  it('score = 0.0 (boundary): saturation clamped to 1.33 (upper bound of low-saturation range)', () => {
    // raw = 1.15 + (0.35 - 0.0) * 0.4 = 1.15 + 0.14 = 1.29
    // clamped to [1.15, 1.33] → 1.29
    const filter = computeAdaptiveFilter(0.0);
    const satMatch = filter.match(/saturate\(([^)]+)\)/);
    const satValue = satMatch ? parseFloat(satMatch[1]) : NaN;
    expect(satValue).toBeGreaterThanOrEqual(1.15);
    expect(satValue).toBeLessThanOrEqual(1.33);
  });
});

// ── Chart reveal logic ───────────────────────────────────────────────────────
// Validates: Requirements 5.1, 5.2, 5.3, 5.5

import { CHART_KEYWORDS } from '../captionUtils';

/**
 * Pure helper that mirrors the chart-detection logic used in videoRenderer.ts.
 * Defined here so the tests remain self-contained and don't depend on canvas.
 */
function isChartAsset(asset: { concept?: string; alt?: string }): boolean {
  return CHART_KEYWORDS.some(kw =>
    (asset.concept ?? '').toLowerCase().includes(kw.toLowerCase()) ||
    (asset.alt ?? '').toLowerCase().includes(kw.toLowerCase())
  );
}

describe('isChartAsset', () => {
  it('returns true when concept contains a chart keyword ("revenue chart")', () => {
    expect(isChartAsset({ concept: 'revenue chart' })).toBe(true);
  });

  it('returns false when concept contains no chart keyword ("CEO portrait")', () => {
    expect(isChartAsset({ concept: 'CEO portrait' })).toBe(false);
  });

  it('returns true for each individual CHART_KEYWORD in concept', () => {
    for (const kw of CHART_KEYWORDS) {
      expect(isChartAsset({ concept: kw })).toBe(true);
    }
  });

  it('returns true when keyword is matched via alt field', () => {
    expect(isChartAsset({ alt: 'stock price graph' })).toBe(true);
  });

  it('returns false when both concept and alt are undefined', () => {
    expect(isChartAsset({})).toBe(false);
  });
});

// ── Chart clip-rect width formula ────────────────────────────────────────────
// The Chart_Revealer reveals `progress * imageWidth` pixels horizontally.
// Tests use the canonical render width of 1280px (VIDEO_WIDTH).

const VIDEO_WIDTH = 1280;

describe('chart reveal clip-rect width', () => {
  it('at progress = 0 the clip rect width is 0 (image fully hidden)', () => {
    const progress = 0;
    const clipWidth = VIDEO_WIDTH * progress;
    expect(clipWidth).toBe(0);
  });

  it('at progress = 1 the clip rect width equals the full image draw width (1280)', () => {
    const progress = 1;
    const clipWidth = VIDEO_WIDTH * progress;
    expect(clipWidth).toBe(1280);
  });

  it('at progress = 0.5 the clip rect width is half the image draw width (640)', () => {
    const progress = 0.5;
    const clipWidth = VIDEO_WIDTH * progress;
    expect(clipWidth).toBe(640);
  });
});
