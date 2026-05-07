/**
 * Unit tests for isBlackThumbnail and validateThumbnailSize
 *
 * Validates: Requirements 4.5, 4.6
 */
import { describe, it, expect } from 'vitest';
import { isBlackThumbnail, validateThumbnailSize } from '../thumbnail';

describe('isBlackThumbnail', () => {
  it('returns true for an all-black image (Requirement 4.5)', () => {
    // 4 pixels, all black (RGBA)
    const data = new Uint8ClampedArray([
      0, 0, 0, 255,
      0, 0, 0, 255,
      0, 0, 0, 255,
      0, 0, 0, 255,
    ]);
    expect(isBlackThumbnail(data)).toBe(true);
  });

  it('returns true when >90% of pixels are near-black (Requirement 4.5)', () => {
    // 10 pixels: 9 black + 1 white = 90% black, but threshold is >90% so this is false
    // Let's do 10 pixels: 10 black = 100%
    const pixels = 10;
    const data = new Uint8ClampedArray(pixels * 4);
    // All black
    for (let i = 0; i < pixels * 4; i += 4) {
      data[i] = 0;     // R
      data[i + 1] = 0; // G
      data[i + 2] = 0; // B
      data[i + 3] = 255; // A
    }
    expect(isBlackThumbnail(data)).toBe(true);
  });

  it('returns true when pixels are within tolerance of black (Requirement 4.5)', () => {
    // 4 pixels with R,G,B values of 5,8,10 (all within default tolerance of 10)
    const data = new Uint8ClampedArray([
      5, 8, 10, 255,
      3, 2, 1, 255,
      10, 10, 10, 255,
      0, 5, 7, 255,
    ]);
    expect(isBlackThumbnail(data)).toBe(true);
  });

  it('returns false when <90% of pixels are near-black (Requirement 4.5)', () => {
    // 10 pixels: 8 black + 2 white = 80% black (below 90% threshold)
    const pixels = 10;
    const data = new Uint8ClampedArray(pixels * 4);
    for (let i = 0; i < 8 * 4; i += 4) {
      data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = 255;
    }
    for (let i = 8 * 4; i < 10 * 4; i += 4) {
      data[i] = 255; data[i + 1] = 255; data[i + 2] = 255; data[i + 3] = 255;
    }
    expect(isBlackThumbnail(data)).toBe(false);
  });

  it('returns false for a colorful image (Requirement 4.5)', () => {
    const data = new Uint8ClampedArray([
      255, 0, 0, 255,   // red
      0, 255, 0, 255,   // green
      0, 0, 255, 255,   // blue
      255, 255, 0, 255, // yellow
    ]);
    expect(isBlackThumbnail(data)).toBe(false);
  });

  it('respects custom threshold parameters', () => {
    // 10 pixels: 9 near-black + 1 white = 90% near-black
    // With percentageThreshold 0.85, this should be true (90% > 85%)
    const pixels = 10;
    const data = new Uint8ClampedArray(pixels * 4);
    for (let i = 0; i < 9 * 4; i += 4) {
      data[i] = 5; data[i + 1] = 5; data[i + 2] = 5; data[i + 3] = 255;
    }
    // Last pixel is white
    data[9 * 4] = 255; data[9 * 4 + 1] = 255; data[9 * 4 + 2] = 255; data[9 * 4 + 3] = 255;

    expect(isBlackThumbnail(data, { pixelTolerance: 10, percentageThreshold: 0.85 })).toBe(true);
    // With strict threshold of 0.95, 90% is not enough
    expect(isBlackThumbnail(data, { pixelTolerance: 10, percentageThreshold: 0.95 })).toBe(false);
  });

  it('handles pixel values just above tolerance as non-black', () => {
    // All pixels have R=11 (just above default tolerance of 10)
    const data = new Uint8ClampedArray([
      11, 0, 0, 255,
      11, 0, 0, 255,
      11, 0, 0, 255,
      11, 0, 0, 255,
    ]);
    expect(isBlackThumbnail(data)).toBe(false);
  });

  it('returns true for empty image data', () => {
    const data = new Uint8ClampedArray(0);
    expect(isBlackThumbnail(data)).toBe(true);
  });
});

describe('validateThumbnailSize', () => {
  it('returns true when blob size >= 10KB (Requirement 4.6)', () => {
    const blob = new Blob([new Uint8Array(10240)]);
    expect(validateThumbnailSize(blob)).toBe(true);
  });

  it('returns false when blob size < 10KB (Requirement 4.6)', () => {
    const blob = new Blob([new Uint8Array(5000)]);
    expect(validateThumbnailSize(blob)).toBe(false);
  });

  it('returns true when blob size exceeds 10KB', () => {
    const blob = new Blob([new Uint8Array(20000)]);
    expect(validateThumbnailSize(blob)).toBe(true);
  });

  it('returns false for empty blob', () => {
    const blob = new Blob([]);
    expect(validateThumbnailSize(blob)).toBe(false);
  });

  it('respects custom minBytes parameter', () => {
    const blob = new Blob([new Uint8Array(5000)]);
    expect(validateThumbnailSize(blob, 5000)).toBe(true);
    expect(validateThumbnailSize(blob, 5001)).toBe(false);
  });

  it('returns true when blob size exactly equals default threshold', () => {
    const blob = new Blob([new Uint8Array(10240)]);
    expect(validateThumbnailSize(blob)).toBe(true);
  });
});
