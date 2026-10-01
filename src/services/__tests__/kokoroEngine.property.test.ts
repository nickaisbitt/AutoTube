/**
 * Property-Based Tests — Kokoro TTS and Pacing Controller
 *
 * Feature: video-quality-max, Properties 1, 2, 3
 *
 * Validates: Requirements 1.5, 2.1, 2.2, 2.3, 2.5
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';
import { generateWithFallback, getRegisteredEngines } from '../tts/registry';
import { computeSegmentWpm, getWpmRange, insertDataPointPauses } from '../tts/pacingController';
import type { TTSConfig } from '../tts/interface';

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), success: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Arbitrary for non-empty narration text */
const narrationTextArb = fc.string({ minLength: 1, maxLength: 200 }).filter(
  (s) => s.trim().length > 0,
);

/** Arbitrary for segment types with known WPM ranges */
const segmentTypeArb = fc.oneof(
  fc.constant('intro'),
  fc.constant('outro'),
  fc.constant('advice'),
  fc.constant('section'),
  fc.constant('transition'),
);

/** Arbitrary for any segment type string (including unknown types) */
const anySegmentTypeArb = fc.oneof(
  segmentTypeArb,
  fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0),
);

/** Arbitrary for text containing dollar amounts */
const dollarAmountArb = fc.tuple(
  fc.string({ minLength: 0, maxLength: 50 }),
  fc.oneof(
    fc.nat({ max: 999999 }).map((n) => `$${n.toLocaleString()}`),
    fc.tuple(fc.nat({ max: 999 }), fc.constantFrom('million', 'billion', 'trillion')).map(
      ([n, suffix]) => `$${n} ${suffix}`,
    ),
  ),
  fc.string({ minLength: 0, maxLength: 50 }),
).map(([prefix, amount, suffix]) => `${prefix} ${amount} ${suffix}`.trim());

/** Arbitrary for text containing percentages */
const percentageArb = fc.tuple(
  fc.string({ minLength: 0, maxLength: 50 }),
  fc.tuple(fc.nat({ max: 999 }), fc.nat({ max: 99 })).map(
    ([whole, decimal]) => decimal > 0 ? `${whole}.${decimal}%` : `${whole}%`,
  ),
  fc.string({ minLength: 0, maxLength: 50 }),
).map(([prefix, pct, suffix]) => `${prefix} ${pct} ${suffix}`.trim());

/** Arbitrary for text containing large numbers (with commas) */
const largeNumberArb = fc.tuple(
  fc.string({ minLength: 0, maxLength: 50 }),
  fc.oneof(
    fc.integer({ min: 1000, max: 999999999 }).map((n) => n.toLocaleString()),
    fc.tuple(fc.nat({ max: 999 }), fc.constantFrom('million', 'billion', 'trillion')).map(
      ([n, suffix]) => `${n} ${suffix}`,
    ),
  ),
  fc.string({ minLength: 0, maxLength: 50 }),
).map(([prefix, num, suffix]) => `${prefix} ${num} ${suffix}`.trim());

/** Arbitrary for text with at least one statistical pattern */
const textWithDataPointArb = fc.oneof(dollarAmountArb, percentageArb, largeNumberArb);

// ---------------------------------------------------------------------------
// Property 1: TTS Registry Fallback Guarantees Audio Generation
// ---------------------------------------------------------------------------

describe('Feature: video-quality-max, Property 1: TTS Registry Fallback Guarantees Audio Generation', () => {
  /**
   * **Validates: Requirements 1.5**
   *
   * For any text input where the preferred engine fails, the registry attempts
   * the next engine in priority order. If all engines fail, returns null.
   */

  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('attempts engines in priority order when preferred engine fails', async () => {
    await fc.assert(
      fc.asyncProperty(narrationTextArb, async (text) => {
        // Track which engines were attempted
        const attemptedEngines: string[] = [];

        const engines = getRegisteredEngines();

        for (let i = 0; i < engines.length; i++) {
          const engine = engines[i];
          vi.spyOn(engine, 'generate').mockImplementation(async () => {
            attemptedEngines.push(engine.name);
            if (i < engines.length - 1) {
              return null; // Fail to trigger fallback
            }
            return `audio://${engine.name}-result`;
          });
          vi.spyOn(engine, 'isAvailable').mockReturnValue(true);
        }

        const config: TTSConfig = {
          engine: 'kokoro',
          kokoroServerUrl: 'http://localhost:8080',
          cloudflareAccountId: 'test-account',
          cloudflareApiToken: 'test-token',
        };

        const result = await generateWithFallback(text, config);

        // The registry should have tried engines in order
        expect(attemptedEngines.length).toBeGreaterThan(1);

        // The first engine attempted should be the preferred one (kokoro)
        expect(attemptedEngines[0]).toBe('kokoro');

        // Each subsequent engine should be the next in priority
        for (let i = 1; i < attemptedEngines.length; i++) {
          const prevIdx = engines.findIndex((e) => e.name === attemptedEngines[i - 1]);
          const currIdx = engines.findIndex((e) => e.name === attemptedEngines[i]);
          expect(currIdx).toBeGreaterThan(prevIdx);
        }

        // Should eventually get a result from the last engine
        expect(result).not.toBeNull();

        // Restore
        for (let i = 0; i < engines.length; i++) {
          vi.mocked(engines[i].generate).mockRestore();
          vi.mocked(engines[i].isAvailable).mockRestore();
        }
      }),
      { numRuns: 100 },
    );
  }, 30_000);

  it('returns null only when all engines are exhausted', async () => {
    await fc.assert(
      fc.asyncProperty(narrationTextArb, async (text) => {
        const engines = getRegisteredEngines();

        // Mock all engines to fail
        for (const engine of engines) {
          vi.spyOn(engine, 'generate').mockResolvedValue(null);
          vi.spyOn(engine, 'isAvailable').mockReturnValue(true);
        }

        const config: TTSConfig = {
          engine: 'kokoro',
          kokoroServerUrl: 'http://localhost:8080',
          cloudflareAccountId: 'test-account',
          cloudflareApiToken: 'test-token',
        };

        const result = await generateWithFallback(text, config);

        // When all engines fail, result must be null
        expect(result).toBeNull();

        // Restore
        for (const engine of engines) {
          vi.mocked(engine.generate).mockRestore();
          vi.mocked(engine.isAvailable).mockRestore();
        }
      }),
      { numRuns: 100 },
    );
  }, 30_000);
});

// ---------------------------------------------------------------------------
// Property 2: Segment-Type WPM Targeting
// ---------------------------------------------------------------------------

describe('Feature: video-quality-max, Property 2: Segment-Type WPM Targeting', () => {
  /**
   * **Validates: Requirements 2.1, 2.2, 2.3**
   *
   * For any segment, the computed WPM falls within the segment-type-appropriate range:
   * - intro → [170, 180]
   * - outro/advice → [140, 155]
   * - all others → [120, 200]
   */

  it('intro segments produce WPM in [170, 180]', () => {
    fc.assert(
      fc.property(fc.constant('intro'), (segmentType) => {
        const wpm = computeSegmentWpm(segmentType);
        expect(wpm).toBeGreaterThanOrEqual(170);
        expect(wpm).toBeLessThanOrEqual(180);
      }),
      { numRuns: 100 },
    );
  });

  it('outro segments produce WPM in [140, 155]', () => {
    fc.assert(
      fc.property(fc.constant('outro'), (segmentType) => {
        const wpm = computeSegmentWpm(segmentType);
        expect(wpm).toBeGreaterThanOrEqual(140);
        expect(wpm).toBeLessThanOrEqual(155);
      }),
      { numRuns: 100 },
    );
  });

  it('advice segments produce WPM in [140, 155]', () => {
    fc.assert(
      fc.property(fc.constant('advice'), (segmentType) => {
        const wpm = computeSegmentWpm(segmentType);
        expect(wpm).toBeGreaterThanOrEqual(140);
        expect(wpm).toBeLessThanOrEqual(155);
      }),
      { numRuns: 100 },
    );
  });

  it('all other segment types produce WPM in [120, 200]', () => {
    fc.assert(
      fc.property(anySegmentTypeArb, (segmentType) => {
        const wpm = computeSegmentWpm(segmentType);
        const range = getWpmRange(segmentType);
        expect(wpm).toBeGreaterThanOrEqual(range.min);
        expect(wpm).toBeLessThanOrEqual(range.max);
      }),
      { numRuns: 100 },
    );
  });

  it('computed WPM always falls within the declared range for any segment type', () => {
    fc.assert(
      fc.property(anySegmentTypeArb, (segmentType) => {
        const wpm = computeSegmentWpm(segmentType);
        const range = getWpmRange(segmentType);

        // WPM must be within the declared range
        expect(wpm).toBeGreaterThanOrEqual(range.min);
        expect(wpm).toBeLessThanOrEqual(range.max);

        // Range must be valid
        expect(range.min).toBeLessThanOrEqual(range.max);
        expect(range.min).toBeGreaterThanOrEqual(120);
        expect(range.max).toBeLessThanOrEqual(200);
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 3: Data Point Pause Insertion
// ---------------------------------------------------------------------------

describe('Feature: video-quality-max, Property 3: Data Point Pause Insertion', () => {
  /**
   * **Validates: Requirements 2.5**
   *
   * For any text with statistical patterns (dollar amounts, percentages, large numbers),
   * pause markers of 300–500ms are inserted before each data point.
   */

  it('inserts pause markers before dollar amounts', () => {
    fc.assert(
      fc.property(dollarAmountArb, (text) => {
        const result = insertDataPointPauses(text);

        // The result should contain at least one pause marker
        const pauseMarkers = result.match(/\[pause:\d+ms\]/g) || [];
        expect(pauseMarkers.length).toBeGreaterThanOrEqual(1);

        // Each pause marker should be in the 300–500ms range
        for (const marker of pauseMarkers) {
          const ms = parseInt(marker.match(/\d+/)![0], 10);
          expect(ms).toBeGreaterThanOrEqual(300);
          expect(ms).toBeLessThanOrEqual(500);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('inserts pause markers before percentages', () => {
    fc.assert(
      fc.property(percentageArb, (text) => {
        const result = insertDataPointPauses(text);

        // The result should contain at least one pause marker
        const pauseMarkers = result.match(/\[pause:\d+ms\]/g) || [];
        expect(pauseMarkers.length).toBeGreaterThanOrEqual(1);

        // Each pause marker should be in the 300–500ms range
        for (const marker of pauseMarkers) {
          const ms = parseInt(marker.match(/\d+/)![0], 10);
          expect(ms).toBeGreaterThanOrEqual(300);
          expect(ms).toBeLessThanOrEqual(500);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('inserts pause markers before large numbers', () => {
    fc.assert(
      fc.property(largeNumberArb, (text) => {
        const result = insertDataPointPauses(text);

        // The result should contain at least one pause marker
        const pauseMarkers = result.match(/\[pause:\d+ms\]/g) || [];
        expect(pauseMarkers.length).toBeGreaterThanOrEqual(1);

        // Each pause marker should be in the 300–500ms range
        for (const marker of pauseMarkers) {
          const ms = parseInt(marker.match(/\d+/)![0], 10);
          expect(ms).toBeGreaterThanOrEqual(300);
          expect(ms).toBeLessThanOrEqual(500);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('pause markers appear immediately before data points in the output', () => {
    fc.assert(
      fc.property(textWithDataPointArb, (text) => {
        const result = insertDataPointPauses(text);

        // Every pause marker should be followed by a data point pattern
        const pauseRegex = /\[pause:\d+ms\]/g;
        let match: RegExpExecArray | null;
        while ((match = pauseRegex.exec(result)) !== null) {
          const afterPause = result.slice(match.index + match[0].length);
          // The text after the pause should start with a data point pattern
          const startsWithDataPoint =
            /^\$/.test(afterPause) || // dollar amount
            /^\d+(?:\.\d+)?%/.test(afterPause) || // percentage
            /^\d{1,3}(?:,\d{3})+/.test(afterPause) || // comma-separated number
            /^\d+(?:\.\d+)?\s*(?:million|billion|trillion)/i.test(afterPause); // number with suffix
          expect(startsWithDataPoint).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('does not insert pauses in text without statistical patterns', () => {
    // Generate text that definitely has no data points
    const plainTextArb = fc.string({ minLength: 1, maxLength: 100 }).filter((s) => {
      const trimmed = s.trim();
      if (trimmed.length === 0) return false;
      // No dollar signs, no percentages, no comma-separated numbers, no million/billion/trillion
      return (
        !s.includes('$') &&
        !/\d+(?:\.\d+)?%/.test(s) &&
        !/\d{1,3}(?:,\d{3})+/.test(s) &&
        !/\d+\s*(?:million|billion|trillion)/i.test(s)
      );
    });

    fc.assert(
      fc.property(plainTextArb, (text) => {
        const result = insertDataPointPauses(text);
        // No pause markers should be inserted
        expect(result).not.toContain('[pause:');
      }),
      { numRuns: 100 },
    );
  });
});
