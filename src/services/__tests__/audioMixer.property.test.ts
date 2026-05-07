/**
 * Property-Based Tests — Background Music Mixer
 *
 * Feature: video-quality-max, Property 4: Background Music Ducking Levels
 *
 * Validates: Requirements 3.2, 3.3, 3.7
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  computeDuckingEnvelope,
  createAudioMixer,
  interpolateGain,
  type NarrationTiming,
  type MixerConfig,
} from '../audioMixer';

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Arbitrary for a valid ducking level in [0.15, 0.20] */
const duckingLevelArb = fc.double({ min: 0.15, max: 0.20, noNaN: true });

/** Arbitrary for a valid peak level in [0.60, 0.80] */
const peakLevelArb = fc.double({ min: 0.60, max: 0.80, noNaN: true });

/** Arbitrary for a valid crossfade duration in [200, 400] ms */
const crossfadeMsArb = fc.integer({ min: 200, max: 400 });

/** Arbitrary for a single narration timing interval */
const narrationTimingArb = fc
  .tuple(
    fc.double({ min: 0.5, max: 30, noNaN: true }),
    fc.double({ min: 1, max: 15, noNaN: true }),
  )
  .map(([start, duration]) => ({
    start: Math.round(start * 100) / 100,
    end: Math.round((start + duration) * 100) / 100,
  }));

/** Arbitrary for a non-empty array of non-overlapping narration timings */
const narrationTimingsArb = fc
  .array(narrationTimingArb, { minLength: 1, maxLength: 5 })
  .map((timings) => {
    // Sort by start and space them out to avoid overlaps
    const sorted = timings.sort((a, b) => a.start - b.start);
    const spaced: NarrationTiming[] = [];
    let offset = 0;
    for (const t of sorted) {
      const duration = t.end - t.start;
      const start = offset + 1; // 1 second gap between intervals
      spaced.push({ start, end: start + duration });
      offset = start + duration;
    }
    return spaced;
  });

/** Arbitrary for a full MixerConfig */
const mixerConfigArb = fc
  .tuple(duckingLevelArb, peakLevelArb, crossfadeMsArb, narrationTimingsArb)
  .map(([duckingLevel, peakLevel, crossfadeMs, narrationClips]) => ({
    musicUrl: '/audio/bg-neutral.aac',
    narrationClips,
    duckingLevel,
    peakLevel,
    fadeInMs: 500,
    fadeOutMs: 2000,
    crossfadeMs,
    enabled: true,
  }));

// ---------------------------------------------------------------------------
// Property 4: Background Music Ducking Levels
// ---------------------------------------------------------------------------

describe('Feature: video-quality-max, Property 4: Background Music Ducking Levels', () => {
  /**
   * **Validates: Requirements 3.2, 3.3, 3.7**
   *
   * For any time point in the audio timeline with defined narration intervals,
   * the background music volume SHALL be in [0.15, 0.20] when narration is active
   * at that time point, and in [0.60, 0.80] when no narration is active,
   * with volume transitions between states lasting 200–400ms.
   */

  it('gain is in [0.15, 0.20] during narration (excluding crossfade transitions)', () => {
    fc.assert(
      fc.property(mixerConfigArb, (config: MixerConfig) => {
        const mixer = createAudioMixer(config);
        const crossfadeSec = config.crossfadeMs / 1000;

        // For each narration interval, sample points well inside the interval
        // (past the crossfade transition zone)
        for (const clip of config.narrationClips) {
          const safeStart = clip.start + crossfadeSec + 0.01;
          const safeEnd = clip.end - 0.01;

          if (safeStart >= safeEnd) continue; // interval too short to test interior

          // Sample multiple points inside the narration
          const numSamples = 5;
          for (let i = 0; i < numSamples; i++) {
            const t = safeStart + (safeEnd - safeStart) * (i / (numSamples - 1));
            const gain = mixer.getGainAtTime(t);

            expect(gain).toBeGreaterThanOrEqual(0.15 - 0.001);
            expect(gain).toBeLessThanOrEqual(0.20 + 0.001);
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  it('gain is in [0.60, 0.80] during gaps (excluding crossfade transitions and fade-in/out)', () => {
    fc.assert(
      fc.property(mixerConfigArb, (config: MixerConfig) => {
        const mixer = createAudioMixer(config);
        const crossfadeSec = config.crossfadeMs / 1000;
        const fadeInSec = config.fadeInMs / 1000;
        const fadeOutSec = config.fadeOutMs / 1000;

        // Identify gaps between narration intervals
        const clips = [...config.narrationClips].sort((a, b) => a.start - b.start);

        for (let i = 0; i < clips.length - 1; i++) {
          const gapStart = clips[i].end;
          const gapEnd = clips[i + 1].start;
          const gapDuration = gapEnd - gapStart;

          // Only test gaps that are wide enough for the crossfade to complete on both sides
          if (gapDuration <= crossfadeSec * 2 + 0.1) continue;

          const safeStart = gapStart + crossfadeSec + 0.01;
          const safeEnd = gapEnd - crossfadeSec - 0.01;

          // Also exclude fade-in and fade-out zones
          const effectiveStart = Math.max(safeStart, fadeInSec + 0.01);
          const effectiveEnd = Math.min(safeEnd, mixer.envelope.duration - fadeOutSec - 0.01);

          if (effectiveStart >= effectiveEnd) continue;

          // Sample multiple points inside the gap
          const numSamples = 5;
          for (let j = 0; j < numSamples; j++) {
            const t = effectiveStart + (effectiveEnd - effectiveStart) * (j / (numSamples - 1));
            const gain = mixer.getGainAtTime(t);

            expect(gain).toBeGreaterThanOrEqual(0.60 - 0.001);
            expect(gain).toBeLessThanOrEqual(0.80 + 0.001);
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  it('crossfade transitions between ducking and peak levels last 200–400ms', () => {
    // Use configs with multiple narration clips to ensure gaps between them
    const multiClipConfigArb = fc
      .tuple(duckingLevelArb, peakLevelArb, crossfadeMsArb, fc
        .array(narrationTimingArb, { minLength: 2, maxLength: 5 })
        .map((timings) => {
          const sorted = timings.sort((a, b) => a.start - b.start);
          const spaced: NarrationTiming[] = [];
          let offset = 2; // Start after fade-in
          for (const t of sorted) {
            const duration = t.end - t.start;
            const start = offset + 2; // 2 second gap between intervals (enough for crossfade)
            spaced.push({ start, end: start + duration });
            offset = start + duration;
          }
          return spaced;
        }))
      .map(([duckingLevel, peakLevel, crossfadeMs, narrationClips]) => ({
        musicUrl: '/audio/bg-neutral.aac',
        narrationClips,
        duckingLevel,
        peakLevel,
        fadeInMs: 500,
        fadeOutMs: 2000,
        crossfadeMs,
        enabled: true,
      }));

    fc.assert(
      fc.property(multiClipConfigArb, (config: MixerConfig) => {
        const envelope = computeDuckingEnvelope(config.narrationClips, {
          duckingLevel: config.duckingLevel,
          peakLevel: config.peakLevel,
          crossfadeMs: config.crossfadeMs,
          fadeInMs: config.fadeInMs,
          fadeOutMs: config.fadeOutMs,
        });

        const points = envelope.points;
        const fadeInSec = config.fadeInMs / 1000;
        const fadeOutSec = config.fadeOutMs / 1000;
        const fadeOutStart = envelope.duration - fadeOutSec;

        // Find transitions between ducking and peak levels that are NOT
        // at the fade-in/fade-out boundaries
        for (let i = 0; i < points.length - 1; i++) {
          const current = points[i];
          const next = points[i + 1];

          // Skip transitions at fade-in/fade-out boundaries
          if (current.time < fadeInSec + 0.01) continue;
          if (next.time > fadeOutStart - 0.01) continue;
          if (current.gain === 0 || next.gain === 0) continue;

          const isDuckingToPeak =
            Math.abs(current.gain - config.duckingLevel) < 0.01 &&
            Math.abs(next.gain - config.peakLevel) < 0.01;

          const isPeakToDucking =
            Math.abs(current.gain - config.peakLevel) < 0.01 &&
            Math.abs(next.gain - config.duckingLevel) < 0.01;

          if (isDuckingToPeak || isPeakToDucking) {
            const transitionDuration = next.time - current.time;
            // Transition duration should be approximately the crossfade time (200–400ms)
            expect(transitionDuration).toBeGreaterThanOrEqual(0.2 - 0.01);
            expect(transitionDuration).toBeLessThanOrEqual(0.4 + 0.01);
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  it('computeDuckingEnvelope clamps ducking level to [0.15, 0.20]', () => {
    fc.assert(
      fc.property(
        narrationTimingsArb,
        fc.double({ min: 0, max: 1, noNaN: true }),
        (timings, rawDucking) => {
          const envelope = computeDuckingEnvelope(timings, {
            duckingLevel: rawDucking,
          });

          // All gain values at narration points should be clamped to [0.15, 0.20]
          // (excluding fade-in/out at boundaries which go to 0)
          for (const point of envelope.points) {
            if (point.gain > 0 && point.gain < 0.60) {
              expect(point.gain).toBeGreaterThanOrEqual(0.15 - 0.001);
              expect(point.gain).toBeLessThanOrEqual(0.20 + 0.001);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('computeDuckingEnvelope clamps peak level to [0.60, 0.80]', () => {
    fc.assert(
      fc.property(
        narrationTimingsArb,
        fc.double({ min: 0, max: 1, noNaN: true }),
        (timings, rawPeak) => {
          const envelope = computeDuckingEnvelope(timings, {
            peakLevel: rawPeak,
          });

          // All gain values at gap points should be clamped to [0.60, 0.80]
          // (excluding fade-in/out at boundaries which go to 0, and ducking levels)
          for (const point of envelope.points) {
            if (point.gain > 0.20 + 0.001) {
              expect(point.gain).toBeGreaterThanOrEqual(0.60 - 0.001);
              expect(point.gain).toBeLessThanOrEqual(0.80 + 0.001);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('crossfadeMs is clamped to [200, 400]ms regardless of input', () => {
    fc.assert(
      fc.property(
        narrationTimingsArb,
        fc.integer({ min: 0, max: 1000 }),
        (timings, rawCrossfade) => {
          const config: MixerConfig = {
            musicUrl: '/audio/bg-neutral.aac',
            narrationClips: timings,
            duckingLevel: 0.18,
            peakLevel: 0.70,
            fadeInMs: 500,
            fadeOutMs: 2000,
            crossfadeMs: rawCrossfade,
            enabled: true,
          };

          const mixer = createAudioMixer(config);

          // The validated crossfadeMs should be clamped
          expect(mixer.config.crossfadeMs).toBeGreaterThanOrEqual(200);
          expect(mixer.config.crossfadeMs).toBeLessThanOrEqual(400);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('interpolateGain returns 0 for empty points array', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 100, noNaN: true }), (time) => {
        const gain = interpolateGain([], time);
        expect(gain).toBe(0);
      }),
      { numRuns: 100 },
    );
  });

  it('interpolateGain linearly interpolates between adjacent points', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.15, max: 0.20, noNaN: true }),
        fc.double({ min: 0.60, max: 0.80, noNaN: true }),
        fc.double({ min: 0.01, max: 0.99, noNaN: true }),
        (gainA, gainB, progress) => {
          const points = [
            { time: 0, gain: gainA },
            { time: 1, gain: gainB },
          ];

          const result = interpolateGain(points, progress);
          const expected = gainA + (gainB - gainA) * progress;

          expect(result).toBeCloseTo(expected, 5);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('disabled mixer returns 0 gain at all time points', () => {
    fc.assert(
      fc.property(
        narrationTimingsArb,
        fc.double({ min: 0, max: 60, noNaN: true }),
        (timings, time) => {
          const config: MixerConfig = {
            musicUrl: '/audio/bg-neutral.aac',
            narrationClips: timings,
            duckingLevel: 0.18,
            peakLevel: 0.70,
            fadeInMs: 500,
            fadeOutMs: 2000,
            crossfadeMs: 300,
            enabled: false,
          };

          const mixer = createAudioMixer(config);
          expect(mixer.getGainAtTime(time)).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});
