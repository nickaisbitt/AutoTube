import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { RESOLUTION_PRESETS } from '../renderingShared';

// ---------------------------------------------------------------------------
// Property 5: All Resolution Presets Specify 24 FPS
// Feature: autotube-quality-phase-3
// **Validates: Requirements 6.1, 6.2, 6.3**
// ---------------------------------------------------------------------------

describe('Property 5: All Resolution Presets Specify 24 FPS', () => {
  const presetKeys = Object.keys(RESOLUTION_PRESETS) as (keyof typeof RESOLUTION_PRESETS)[];

  it('every resolution preset has fps === 24', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...presetKeys),
        (key) => {
          expect(RESOLUTION_PRESETS[key].fps).toBe(24);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('RESOLUTION_PRESETS contains 720p, 1080p, and 4K entries', () => {
    expect(presetKeys).toContain('720p');
    expect(presetKeys).toContain('1080p');
    expect(presetKeys).toContain('4K');
  });

  it('all presets have positive width, height, and videoBitsPerSecond', () => {
    for (const key of presetKeys) {
      const preset = RESOLUTION_PRESETS[key];
      expect(preset.width).toBeGreaterThan(0);
      expect(preset.height).toBeGreaterThan(0);
      expect(preset.videoBitsPerSecond).toBeGreaterThan(0);
    }
  });
});
