/**
 * Property-Based Tests — Narration Timing Validation
 *
 * Feature: video-quality-max, Property 22: Narration Duration Validation
 *
 * Validates: Requirements 9.3, 9.4
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  validateNarrationTiming,
  type AudioExportResult,
} from '../tts/audioExport';

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Arbitrary for a valid audio format */
const formatArb = fc.constantFrom<'wav' | 'mp3'>('wav', 'mp3');

/** Arbitrary for a single AudioExportResult clip */
const clipArb = fc
  .tuple(
    fc.double({ min: 0.1, max: 60, noNaN: true }),
    fc.string({ minLength: 1, maxLength: 10 }),
    fc.double({ min: 0, max: 300, noNaN: true }),
    formatArb,
  )
  .map(([duration, segmentId, startOffset, format]) => ({
    blobUrl: `blob:http://localhost/${segmentId}`,
    duration: Math.round(duration * 100) / 100,
    segmentId: `seg-${segmentId}`,
    startOffset: Math.round(startOffset * 100) / 100,
    format,
  }));

/** Arbitrary for a non-empty array of clips */
const clipsArb = fc.array(clipArb, { minLength: 1, maxLength: 10 });

/** Arbitrary for a positive target duration */
const targetDurationArb = fc.double({ min: 10, max: 600, noNaN: true });

// ---------------------------------------------------------------------------
// Property 22: Narration Duration Validation
// ---------------------------------------------------------------------------

describe('Feature: video-quality-max, Property 22: Narration Duration Validation', () => {
  /**
   * **Validates: Requirements 9.3, 9.4**
   *
   * For any array of clip durations and target duration,
   * `validateNarrationTiming` SHALL return `withinTolerance=true` if and only if
   * the total duration is within targetDuration ± 20%, and SHALL provide a
   * non-null suggestion when the total exceeds the target by more than 20%.
   */

  it('withinTolerance=true iff total duration is within [targetDuration * 0.8, targetDuration * 1.2]', () => {
    fc.assert(
      fc.property(clipsArb, targetDurationArb, (clips: AudioExportResult[], target: number) => {
        const result = validateNarrationTiming(clips, target);

        const totalDuration = clips.reduce((acc, clip) => acc + clip.duration, 0);
        const lowerBound = target * 0.8;
        const upperBound = target * 1.2;
        const expectedWithinTolerance = totalDuration >= lowerBound && totalDuration <= upperBound;

        expect(result.withinTolerance).toBe(expectedWithinTolerance);
      }),
      { numRuns: 100 },
    );
  });

  it('suggestion is defined (non-null) when overagePercent > 20', () => {
    // Generate clips whose total duration exceeds target by more than 20%
    const overageArb = fc
      .tuple(
        targetDurationArb,
        fc.double({ min: 0.21, max: 2.0, noNaN: true }), // overage factor > 20%
      )
      .chain(([target, overageFactor]) => {
        const totalNeeded = target * (1 + overageFactor);
        // Create clips that sum to totalNeeded
        const clipCount = fc.integer({ min: 1, max: 5 });
        return clipCount.map((count) => {
          const perClipDuration = totalNeeded / count;
          const clips: AudioExportResult[] = Array.from({ length: count }, (_, i) => ({
            blobUrl: `blob:http://localhost/seg-${i}`,
            duration: Math.round(perClipDuration * 100) / 100,
            segmentId: `seg-${i}`,
            startOffset: Math.round(perClipDuration * i * 100) / 100,
            format: 'wav' as const,
          }));
          return { clips, target };
        });
      });

    fc.assert(
      fc.property(overageArb, ({ clips, target }) => {
        const result = validateNarrationTiming(clips, target);

        // Verify overagePercent > 20
        if (result.overagePercent > 20) {
          expect(result.suggestion).toBeDefined();
          expect(typeof result.suggestion).toBe('string');
          expect(result.suggestion!.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('suggestion is undefined when overagePercent <= 20', () => {
    // Generate clips whose total duration does not exceed target by more than 20%
    // Use a conservative factor (max 0.15) to avoid rounding pushing us over 20%
    const withinArb = fc
      .tuple(
        targetDurationArb,
        fc.double({ min: -0.2, max: 0.15, noNaN: true }), // factor safely within ±20%
      )
      .chain(([target, factor]) => {
        const totalNeeded = target * (1 + factor);
        // Ensure totalNeeded is positive
        const safeTotalNeeded = Math.max(totalNeeded, 0.1);
        const clipCount = fc.integer({ min: 1, max: 5 });
        return clipCount.map((count) => {
          const perClipDuration = safeTotalNeeded / count;
          const clips: AudioExportResult[] = Array.from({ length: count }, (_, i) => ({
            blobUrl: `blob:http://localhost/seg-${i}`,
            duration: Math.round(perClipDuration * 100) / 100,
            segmentId: `seg-${i}`,
            startOffset: Math.round(perClipDuration * i * 100) / 100,
            format: 'mp3' as const,
          }));
          return { clips, target };
        });
      });

    fc.assert(
      fc.property(withinArb, ({ clips, target }) => {
        const result = validateNarrationTiming(clips, target);

        // Only assert when the actual computed overage is <= 20
        // (rounding of clip durations can slightly shift the total)
        if (result.overagePercent <= 20) {
          expect(result.suggestion).toBeUndefined();
        }
      }),
      { numRuns: 100 },
    );
  });

  it('totalDuration in result equals sum of clip durations (rounded)', () => {
    fc.assert(
      fc.property(clipsArb, targetDurationArb, (clips: AudioExportResult[], target: number) => {
        const result = validateNarrationTiming(clips, target);

        const expectedTotal = clips.reduce((acc, clip) => acc + clip.duration, 0);
        // Allow for rounding (the implementation rounds to 2 decimal places)
        expect(result.totalDuration).toBeCloseTo(expectedTotal, 1);
      }),
      { numRuns: 100 },
    );
  });

  it('overagePercent correctly represents (total - target) / target * 100', () => {
    fc.assert(
      fc.property(clipsArb, targetDurationArb, (clips: AudioExportResult[], target: number) => {
        const result = validateNarrationTiming(clips, target);

        const totalDuration = clips.reduce((acc, clip) => acc + clip.duration, 0);
        const expectedOverage = ((totalDuration - target) / target) * 100;

        expect(result.overagePercent).toBeCloseTo(expectedOverage, 0);
      }),
      { numRuns: 100 },
    );
  });
});
