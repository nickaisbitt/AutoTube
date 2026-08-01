import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { getFrameSampleRate, getFrameInterval, getEffectiveSampleRate } from '../animation';
import { RESOLUTION_PRESETS } from '../../renderingShared';

// ---------------------------------------------------------------------------
// Frame capture rate correctness
//
// Regression for the "standard quality plays ~33% too fast" bug: the renderer
// captures one frame every `frameInterval = round(fps / frameSampleRate)`
// source frames, so the real playback rate is `fps / frameInterval`. Reporting
// the raw `frameSampleRate` to /api/render-video and MediaRecorder when it does
// not divide `fps` evenly makes the video play back too fast.
// ---------------------------------------------------------------------------

describe('getFrameInterval', () => {
  it('rounds fps / frameSampleRate and is at least 1', () => {
    expect(getFrameInterval(24, 24)).toBe(1); // high
    expect(getFrameInterval(24, 16)).toBe(2); // standard: round(1.5) = 2
    expect(getFrameInterval(24, 12)).toBe(2); // draft
    expect(getFrameInterval(24, 1000)).toBe(1); // never below 1
  });
});

describe('getEffectiveSampleRate', () => {
  it('is the real capture rate implied by the frame interval', () => {
    expect(getEffectiveSampleRate(24, 24)).toBe(24); // high: interval 1
    expect(getEffectiveSampleRate(24, 16)).toBe(12); // standard: interval 2 → 12, NOT 16
    expect(getEffectiveSampleRate(24, 12)).toBe(12); // draft: interval 2
  });

  it('exposes the standard-quality speed bug when the raw rate is used instead', () => {
    const fps = RESOLUTION_PRESETS['1080p'].fps; // 24
    const requested = getFrameSampleRate('standard'); // 16
    const effective = getEffectiveSampleRate(fps, requested); // 12

    // The captured frames actually represent `effective` fps. Playing them back
    // at the requested rate speeds the video up by requested/effective.
    const speedupIfUsingRequested = requested / effective;
    expect(speedupIfUsingRequested).toBeCloseTo(1.3333, 3); // ~33% too fast
    // The fix reports `effective`, so playback speed is exactly 1x.
    expect(effective / effective).toBe(1);
  });
});

describe('capture rate matches reported rate for all quality presets', () => {
  const fps = 24; // all RESOLUTION_PRESETS use 24fps

  for (const quality of ['draft', 'standard', 'high'] as const) {
    it(`plays back at 1x when the effective rate is reported (${quality})`, () => {
      const requested = getFrameSampleRate(quality);
      const interval = getFrameInterval(fps, requested);
      const effective = getEffectiveSampleRate(fps, requested);

      // Simulate capturing a 10s segment: capture whenever f % interval === 0.
      const durationSec = 10;
      const totalFrames = Math.round(durationSec * fps);
      let captured = 0;
      for (let f = 0; f < totalFrames; f++) {
        if (f % interval === 0) captured++;
      }

      // Playback duration when frames are shown at the reported (effective) rate.
      const playbackDuration = captured / effective;
      expect(playbackDuration).toBeCloseTo(durationSec, 1);
    });
  }

  it('property: effective rate keeps playback within 5% of true duration', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(12, 16, 24),
        fc.integer({ min: 1, max: 600 }),
        (requested, durationSec) => {
          const interval = getFrameInterval(fps, requested);
          const effective = getEffectiveSampleRate(fps, requested);
          const totalFrames = Math.round(durationSec * fps);
          let captured = 0;
          for (let f = 0; f < totalFrames; f++) {
            if (f % interval === 0) captured++;
          }
          const playbackDuration = captured / effective;
          expect(Math.abs(playbackDuration - durationSec)).toBeLessThanOrEqual(durationSec * 0.05 + 1 / effective);
        },
      ),
      { numRuns: 200 },
    );
  });
});
