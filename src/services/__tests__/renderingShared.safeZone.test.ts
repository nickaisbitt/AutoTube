import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { computeSafeZone } from '../renderingShared';

// ---------------------------------------------------------------------------
// Property 4: Safe Zone Scales Proportionally With Resolution
// Feature: autotube-quality-phase-3
// **Validates: Requirements 5.1, 5.2**
// ---------------------------------------------------------------------------

describe('Property 4: Safe Zone Scales Proportionally With Resolution', () => {
  /**
   * Arbitrary for random widths (640–7680) and heights (360–4320).
   * These cover everything from sub-720p to beyond 4K.
   */
  const widthArb = fc.integer({ min: 640, max: 7680 });
  const heightArb = fc.integer({ min: 360, max: 4320 });

  it('bottom margin equals Math.round(60 * height / 1080) for all resolutions', () => {
    fc.assert(
      fc.property(widthArb, heightArb, (width, height) => {
        const safeZone = computeSafeZone(width, height);
        // Match the implementation's computation order: scale = height / 1080, then Math.round(60 * scale)
        const scale = height / 1080;
        const expectedBottom = Math.round(60 * scale);
        expect(safeZone.bottom).toBe(expectedBottom);
      }),
      { numRuns: 500 },
    );
  });

  it('top margin equals Math.round(40 * height / 1080) for all resolutions', () => {
    fc.assert(
      fc.property(widthArb, heightArb, (width, height) => {
        const safeZone = computeSafeZone(width, height);
        // Match the implementation's computation order: scale = height / 1080, then Math.round(40 * scale)
        const scale = height / 1080;
        const expectedTop = Math.round(40 * scale);
        expect(safeZone.top).toBe(expectedTop);
      }),
      { numRuns: 500 },
    );
  });

  it('left and right margins equal Math.round(width * 0.05) for all resolutions', () => {
    fc.assert(
      fc.property(widthArb, heightArb, (width, height) => {
        const safeZone = computeSafeZone(width, height);
        const expectedHorizontal = Math.round(width * 0.05);
        expect(safeZone.left).toBe(expectedHorizontal);
        expect(safeZone.right).toBe(expectedHorizontal);
      }),
      { numRuns: 500 },
    );
  });

  it('at 1080p reference resolution, margins match exact reference values', () => {
    const safeZone = computeSafeZone(1920, 1080);
    expect(safeZone.top).toBe(40);
    expect(safeZone.bottom).toBe(60);
    expect(safeZone.left).toBe(Math.round(1920 * 0.05));
    expect(safeZone.right).toBe(Math.round(1920 * 0.05));
  });

  it('all margin values are non-negative integers', () => {
    fc.assert(
      fc.property(widthArb, heightArb, (width, height) => {
        const safeZone = computeSafeZone(width, height);
        expect(safeZone.top).toBeGreaterThanOrEqual(0);
        expect(safeZone.bottom).toBeGreaterThanOrEqual(0);
        expect(safeZone.left).toBeGreaterThanOrEqual(0);
        expect(safeZone.right).toBeGreaterThanOrEqual(0);
        expect(Number.isInteger(safeZone.top)).toBe(true);
        expect(Number.isInteger(safeZone.bottom)).toBe(true);
        expect(Number.isInteger(safeZone.left)).toBe(true);
        expect(Number.isInteger(safeZone.right)).toBe(true);
      }),
      { numRuns: 300 },
    );
  });
});
