/**
 * Property-Based Tests — Thumbnail Generation
 *
 * Feature: blind-review-quality-fixes, Property 8: Thumbnail background asset selection
 * Feature: blind-review-quality-fixes, Property 9: Thumbnail text word count enforcement
 * Feature: blind-review-quality-fixes, Property 10: Black thumbnail detection
 *
 * Validates: Requirements 4.2, 4.3, 4.5
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  selectThumbnailBackground,
  validateThumbnailText,
  isBlackThumbnail,
} from '../thumbnail';
import type { MediaAsset } from '../../types';

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Arbitrary for a numeric score */
const scoreArb: fc.Arbitrary<number> = fc.integer({ min: -1000, max: 1000 });

/** Arbitrary for a non-fallback MediaAsset with a given score */
function mediaAssetArb(opts?: { isFallback?: boolean }): fc.Arbitrary<MediaAsset> {
  return fc.record({
    id: fc.stringMatching(/^asset-[a-z0-9]{4,8}$/),
    segmentId: fc.stringMatching(/^seg-[0-9]{1,4}$/),
    type: fc.constant('image' as const),
    url: fc.stringMatching(/^https:\/\/[a-z]{3,8}\.com\/[a-z0-9]{4,10}\.(jpg|png)$/),
    alt: fc.stringMatching(/^[a-z]{3,8}( [a-z]{3,8}){1,4}$/),
    source: fc.constant('test-source'),
    isFallback: fc.constant(opts?.isFallback ?? false),
    score: scoreArb,
  });
}

/** Arbitrary for a fallback MediaAsset */
const fallbackAssetArb: fc.Arbitrary<MediaAsset> = mediaAssetArb({ isFallback: true });

/** Arbitrary for a non-fallback MediaAsset */
const nonFallbackAssetArb: fc.Arbitrary<MediaAsset> = mediaAssetArb({ isFallback: false });

/** Arbitrary for a non-empty string of words (1-10 words) */
const wordStringArb: fc.Arbitrary<string> = fc.array(
  fc.stringMatching(/^[a-zA-Z]{2,10}$/),
  { minLength: 1, maxLength: 10 },
).map(words => words.join(' '));

// ---------------------------------------------------------------------------
// Property 8: Thumbnail background asset selection
// ---------------------------------------------------------------------------

describe('Feature: blind-review-quality-fixes, Property 8: Thumbnail background asset selection', () => {
  /**
   * **Validates: Requirements 4.2**
   *
   * For any non-empty array of MediaAssets containing at least one non-fallback
   * asset, selectThumbnailBackground SHALL return the asset with the highest
   * score among non-fallback assets.
   */

  it('returns the highest-scored non-fallback asset', () => {
    fc.assert(
      fc.property(
        fc.array(nonFallbackAssetArb, { minLength: 1, maxLength: 10 }),
        fc.array(fallbackAssetArb, { minLength: 0, maxLength: 5 }),
        (nonFallbackAssets, fallbackAssets) => {
          const allAssets = [...nonFallbackAssets, ...fallbackAssets];

          const result = selectThumbnailBackground(allAssets);

          // Should return a non-fallback asset
          expect(result).toBeDefined();
          expect(result!.isFallback).not.toBe(true);

          // Should be the highest-scored non-fallback asset
          const maxScore = Math.max(...nonFallbackAssets.map(a => a.score ?? 0));
          expect(result!.score ?? 0).toBe(maxScore);
        },
      ),
      { numRuns: 30 },
    );
  });

  it('returns undefined when all assets are fallback', () => {
    fc.assert(
      fc.property(
        fc.array(fallbackAssetArb, { minLength: 1, maxLength: 10 }),
        (fallbackAssets) => {
          const result = selectThumbnailBackground(fallbackAssets);
          expect(result).toBeUndefined();
        },
      ),
      { numRuns: 30 },
    );
  });

  it('ignores fallback assets even if they have higher scores', () => {
    fc.assert(
      fc.property(
        fc.array(nonFallbackAssetArb, { minLength: 1, maxLength: 5 }),
        (nonFallbackAssets) => {
          // Create a fallback asset with a very high score
          const highScoreFallback: MediaAsset = {
            id: 'fallback-high',
            segmentId: 'seg-0',
            type: 'image',
            url: 'https://example.com/fallback.jpg',
            alt: 'fallback image',
            source: 'test',
            isFallback: true,
            score: 99999,
          };

          const allAssets = [...nonFallbackAssets, highScoreFallback];
          const result = selectThumbnailBackground(allAssets);

          // Should NOT return the fallback even though it has the highest score
          expect(result).toBeDefined();
          expect(result!.isFallback).not.toBe(true);
          expect(result!.url).not.toBe(highScoreFallback.url);
        },
      ),
      { numRuns: 30 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 9: Thumbnail text word count enforcement
// ---------------------------------------------------------------------------

describe('Feature: blind-review-quality-fixes, Property 9: Thumbnail text word count enforcement', () => {
  /**
   * **Validates: Requirements 4.3**
   *
   * For any input string, validateThumbnailText SHALL return a string
   * containing between 2 and 5 words (inclusive).
   */

  it('always returns between 2 and 5 words for any non-empty input', () => {
    fc.assert(
      fc.property(
        wordStringArb,
        (input) => {
          const result = validateThumbnailText(input);
          const wordCount = result.trim().split(/\s+/).length;

          expect(wordCount).toBeGreaterThanOrEqual(2);
          expect(wordCount).toBeLessThanOrEqual(5);
        },
      ),
      { numRuns: 30 },
    );
  });

  it('returns 2-4 words for empty string input', () => {
    const result = validateThumbnailText('');
    const wordCount = result.trim().split(/\s+/).length;

    expect(wordCount).toBeGreaterThanOrEqual(2);
    expect(wordCount).toBeLessThanOrEqual(4);
  });

  it('preserves text unchanged when already 2-4 words', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.stringMatching(/^[a-zA-Z]{2,8}$/),
          { minLength: 2, maxLength: 4 },
        ),
        (words) => {
          const input = words.join(' ');
          const result = validateThumbnailText(input);
          const resultWordCount = result.trim().split(/\s+/).length;

          expect(resultWordCount).toBeGreaterThanOrEqual(2);
          expect(resultWordCount).toBeLessThanOrEqual(4);
          expect(result).toBe(input);
        },
      ),
      { numRuns: 30 },
    );
  });

  it('truncates text longer than 4 words to exactly 4 words', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.stringMatching(/^[a-zA-Z]{2,8}$/),
          { minLength: 5, maxLength: 10 },
        ),
        (words) => {
          const input = words.join(' ');
          const result = validateThumbnailText(input);
          const resultWordCount = result.trim().split(/\s+/).length;

          expect(resultWordCount).toBe(4);
          expect(result).toBe(words.slice(0, 4).join(' '));
        },
      ),
      { numRuns: 30 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 10: Black thumbnail detection
// ---------------------------------------------------------------------------

describe('Feature: blind-review-quality-fixes, Property 10: Black thumbnail detection', () => {
  /**
   * **Validates: Requirements 4.5**
   *
   * For any ImageData where more than 90% of pixels have R, G, and B values
   * each within 10 of 0, isBlackThumbnail SHALL return true.
   * For any ImageData where fewer than 90% of pixels meet this criterion,
   * it SHALL return false.
   */

  it('returns true when >90% of pixels are near-black', () => {
    // Use a fixed pixel count for performance (100 pixels)
    const pixelCount = 100;

    fc.assert(
      fc.property(
        // Generate percentage between 91% and 100%
        fc.integer({ min: 91, max: 100 }),
        (blackPercent) => {
          const percentage = blackPercent / 100;
          const blackPixelCount = Math.ceil(pixelCount * percentage);
          const nonBlackPixelCount = pixelCount - blackPixelCount;

          // Build pixel data manually
          const data = new Uint8ClampedArray(pixelCount * 4);
          let offset = 0;

          // Near-black pixels (R, G, B each <= 10)
          for (let i = 0; i < blackPixelCount; i++) {
            data[offset] = Math.floor(Math.random() * 11);     // R: 0-10
            data[offset + 1] = Math.floor(Math.random() * 11); // G: 0-10
            data[offset + 2] = Math.floor(Math.random() * 11); // B: 0-10
            data[offset + 3] = 255;                             // A
            offset += 4;
          }

          // Non-black pixels (at least one channel > 10)
          for (let i = 0; i < nonBlackPixelCount; i++) {
            data[offset] = 128;     // R: clearly not black
            data[offset + 1] = 128; // G
            data[offset + 2] = 128; // B
            data[offset + 3] = 255; // A
            offset += 4;
          }

          const result = isBlackThumbnail(data);
          expect(result).toBe(true);
        },
      ),
      { numRuns: 30 },
    );
  });

  it('returns false when <=90% of pixels are near-black', () => {
    const pixelCount = 100;

    fc.assert(
      fc.property(
        // Generate percentage between 0% and 89%
        fc.integer({ min: 0, max: 89 }),
        (blackPercent) => {
          const blackPixelCount = Math.floor(pixelCount * (blackPercent / 100));
          const nonBlackPixelCount = pixelCount - blackPixelCount;

          // Build pixel data
          const data = new Uint8ClampedArray(pixelCount * 4);
          let offset = 0;

          // Near-black pixels
          for (let i = 0; i < blackPixelCount; i++) {
            data[offset] = Math.floor(Math.random() * 11);
            data[offset + 1] = Math.floor(Math.random() * 11);
            data[offset + 2] = Math.floor(Math.random() * 11);
            data[offset + 3] = 255;
            offset += 4;
          }

          // Non-black pixels (clearly not black)
          for (let i = 0; i < nonBlackPixelCount; i++) {
            data[offset] = 200;
            data[offset + 1] = 150;
            data[offset + 2] = 100;
            data[offset + 3] = 255;
            offset += 4;
          }

          const result = isBlackThumbnail(data);
          expect(result).toBe(false);
        },
      ),
      { numRuns: 30 },
    );
  });

  it('returns true for completely black image (all zeros)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 10, max: 200 }),
        (pixelCount) => {
          // All pixels are exactly black (0, 0, 0)
          const data = new Uint8ClampedArray(pixelCount * 4);
          for (let i = 0; i < pixelCount * 4; i += 4) {
            data[i] = 0;
            data[i + 1] = 0;
            data[i + 2] = 0;
            data[i + 3] = 255;
          }

          expect(isBlackThumbnail(data)).toBe(true);
        },
      ),
      { numRuns: 30 },
    );
  });

  it('returns false for completely white image', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 10, max: 200 }),
        (pixelCount) => {
          // All pixels are white (255, 255, 255)
          const data = new Uint8ClampedArray(pixelCount * 4);
          for (let i = 0; i < pixelCount * 4; i += 4) {
            data[i] = 255;
            data[i + 1] = 255;
            data[i + 2] = 255;
            data[i + 3] = 255;
          }

          expect(isBlackThumbnail(data)).toBe(false);
        },
      ),
      { numRuns: 30 },
    );
  });
});
