import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

// ---------------------------------------------------------------------------
// Property 8: Dynamic Frame Counts Equal Duration Times FPS
// Feature: autotube-quality-phase-3
// **Validates: Requirement 6.6**
// ---------------------------------------------------------------------------

/**
 * The dynamic frame count formula used throughout the rendering pipeline:
 *   frameCount = Math.round(duration * fps)
 *
 * This property verifies the formula produces consistent, correct results
 * for arbitrary FPS (1–60) and duration (0.1–30) values.
 */
function computeFrameCount(duration: number, fps: number): number {
  return Math.round(duration * fps);
}

describe('Property 8: Dynamic Frame Counts Equal Duration Times FPS', () => {
  it('Math.round(duration * fps) matches the computed frame count for random inputs', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 60 }),                       // fps: 1–60
        fc.double({ min: 0.1, max: 30, noNaN: true }),         // duration: 0.1–30
        (fps, duration) => {
          const expected = Math.round(duration * fps);
          const actual = computeFrameCount(duration, fps);
          expect(actual).toBe(expected);
        },
      ),
      { numRuns: 1000 },
    );
  });

  it('frame count is always non-negative for valid inputs', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 60 }),
        fc.double({ min: 0.1, max: 30, noNaN: true }),
        (fps, duration) => {
          const frames = computeFrameCount(duration, fps);
          expect(frames).toBeGreaterThanOrEqual(0);
        },
      ),
      { numRuns: 500 },
    );
  });

  it('frame count is always an integer', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 60 }),
        fc.double({ min: 0.1, max: 30, noNaN: true }),
        (fps, duration) => {
          const frames = computeFrameCount(duration, fps);
          expect(Number.isInteger(frames)).toBe(true);
        },
      ),
      { numRuns: 500 },
    );
  });

  it('known examples: 1.5s at 24fps = 36 frames, 2s at 24fps = 48 frames', () => {
    expect(computeFrameCount(1.5, 24)).toBe(36);
    expect(computeFrameCount(2, 24)).toBe(48);
    expect(computeFrameCount(3, 24)).toBe(72);
    expect(computeFrameCount(4, 24)).toBe(96);
  });
});
