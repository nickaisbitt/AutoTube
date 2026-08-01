// Feature: codebase-robustness-audit, Property 14: Segment validation produces valid defaults
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { validateSegment, stripPartLabels } from '../llm/index';
import type { ScriptSegment, AudioDirection } from '../../types';

/**
 * **Validates: Requirements 17.1**
 *
 * Property 14: Segment validation produces valid defaults
 *
 * For any raw object (including null, undefined, empty objects, objects with
 * wrong types), `validateSegment` SHALL return a valid ScriptSegment with
 * sensible defaults for all missing or invalid fields.
 *
 * Note: validateSegment throws for null/undefined/non-object inputs.
 * For object inputs, it always returns a valid ScriptSegment with defaults.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_TYPES = new Set(['intro', 'section', 'transition', 'outro']);

function isValidScriptSegment(seg: ScriptSegment): boolean {
  return (
    typeof seg.id === 'string' &&
    seg.id.length > 0 &&
    VALID_TYPES.has(seg.type) &&
    typeof seg.title === 'string' &&
    seg.title.length > 0 &&
    typeof seg.narration === 'string' &&
    seg.narration.length > 0 &&
    typeof seg.visualNote === 'string' &&
    seg.visualNote.length > 0 &&
    typeof seg.duration === 'number' &&
    Number.isFinite(seg.duration) &&
    seg.duration > 0
  );
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Arbitrary for any raw object (the interesting case for validateSegment) */
const rawObjectArb = fc.oneof(
  // Empty object
  fc.constant({}),
  // Object with some valid fields
  fc.record({
    type: fc.oneof(
      fc.constantFrom('intro', 'section', 'transition', 'outro'),
      fc.string({ maxLength: 20 }),
      fc.integer(),
      fc.constant(null),
      fc.constant(undefined),
    ),
    title: fc.oneof(
      fc.string({ maxLength: 100 }),
      fc.integer(),
      fc.constant(null),
      fc.constant(undefined),
      fc.constant(''),
      fc.constant('   '),
    ),
    narration: fc.oneof(
      fc.string({ maxLength: 200 }),
      fc.integer(),
      fc.constant(null),
      fc.constant(undefined),
      fc.constant(''),
    ),
    visualNote: fc.oneof(
      fc.string({ maxLength: 100 }),
      fc.integer(),
      fc.constant(null),
      fc.constant(undefined),
      fc.constant(''),
    ),
    duration: fc.oneof(
      fc.double({ min: -100, max: 300, noNaN: true }),
      fc.constant(NaN),
      fc.constant(Infinity),
      fc.constant(-Infinity),
      fc.constant(0),
      fc.constant(-5),
      fc.string({ maxLength: 10 }),
      fc.constant(null),
      fc.constant(undefined),
    ),
  }),
  // Object with extra/unexpected fields
  fc.record({
    foo: fc.string(),
    bar: fc.integer(),
  }),
  // Object with only some fields
  fc.record({
    type: fc.constantFrom('intro', 'section'),
  }),
  fc.record({
    title: fc.string({ minLength: 1, maxLength: 50 }),
    duration: fc.integer({ min: 1, max: 60 }),
  }),
);

/** Arbitrary for the index parameter */
const indexArb = fc.nat({ max: 100 });

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Property 14: Segment validation produces valid defaults', () => {
  it('should return a valid ScriptSegment with sensible defaults for any raw object input', () => {
    fc.assert(
      fc.property(rawObjectArb, indexArb, (rawInput, index) => {
        const result = validateSegment(rawInput, index);

        // Must be a valid ScriptSegment
        expect(isValidScriptSegment(result)).toBe(true);

        // Type must be one of the valid types
        expect(VALID_TYPES.has(result.type)).toBe(true);

        // Title must be non-empty
        expect(result.title.length).toBeGreaterThan(0);

        // Narration must be non-empty
        expect(result.narration.length).toBeGreaterThan(0);

        // VisualNote must be non-empty
        expect(result.visualNote.length).toBeGreaterThan(0);

        // Duration must be a positive finite number
        expect(result.duration).toBeGreaterThan(0);
        expect(Number.isFinite(result.duration)).toBe(true);

        // ID must be a non-empty string
        expect(result.id.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });

  it('should preserve valid field values when provided', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('intro', 'section', 'transition', 'outro'),
        fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
        fc.string({ minLength: 1, maxLength: 200 }).filter((s) => s.trim().length > 0),
        fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
        fc.double({ min: 0.1, max: 300, noNaN: true }),
        indexArb,
        (type, title, narration, visualNote, duration, index) => {
          const raw = { type, title, narration, visualNote, duration };
          const result = validateSegment(raw, index);

          // Valid values should be preserved
          expect(result.type).toBe(type);
          expect(result.title).toBe(title.trim());
          expect(result.narration).toBe(stripPartLabels(narration.trim()));
          expect(result.visualNote).toBe(visualNote.trim());
          expect(result.duration).toBe(duration);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should default type to "section" for invalid type values', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }).filter((s) => !VALID_TYPES.has(s)),
        indexArb,
        (invalidType, index) => {
          const raw = { type: invalidType, title: 'Test', narration: 'Test narration', visualNote: 'Test visual', duration: 10 };
          const result = validateSegment(raw, index);
          expect(result.type).toBe('section');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should default duration to 10 for non-positive or non-finite values', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant(0),
          fc.constant(-1),
          fc.constant(-100),
          fc.constant(NaN),
          fc.constant(Infinity),
          fc.constant(-Infinity),
        ),
        indexArb,
        (badDuration, index) => {
          const raw = { type: 'section', title: 'Test', narration: 'Test', visualNote: 'Test', duration: badDuration };
          const result = validateSegment(raw, index);
          expect(result.duration).toBe(10);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// audioDirection and dataVisualization preservation (fix: prompt requires them)
// ---------------------------------------------------------------------------

describe('validateSegment — audioDirection and dataVisualization preservation', () => {
  const base = { type: 'section', title: 'Test', narration: 'Test narration here.', visualNote: 'B-roll', duration: 15 };

  it('preserves a fully-valid audioDirection', () => {
    const raw = {
      ...base,
      audioDirection: {
        soundBed: 'tense',
        impactCues: ['impact_hit', 'whoosh'],
        sonicSpace: true,
        intensity: 8,
      },
    };
    const result = validateSegment(raw, 0);
    expect(result.audioDirection).toBeDefined();
    expect(result.audioDirection?.soundBed).toBe('tense');
    expect(result.audioDirection?.impactCues).toEqual(['impact_hit', 'whoosh']);
    expect(result.audioDirection?.sonicSpace).toBe(true);
    expect(result.audioDirection?.intensity).toBe(8);
  });

  it('preserves audioDirection with empty impactCues array', () => {
    const raw = {
      ...base,
      audioDirection: { soundBed: 'calm', impactCues: [], sonicSpace: false, intensity: 3 },
    };
    const result = validateSegment(raw, 0);
    expect(result.audioDirection?.soundBed).toBe('calm');
    expect(result.audioDirection?.impactCues).toEqual([]);
    expect(result.audioDirection?.sonicSpace).toBe(false);
    expect(result.audioDirection?.intensity).toBe(3);
  });

  it('clamps intensity to [0, 10]', () => {
    const rawHigh = { ...base, audioDirection: { soundBed: 'building', impactCues: [], sonicSpace: false, intensity: 15 } };
    const rawLow = { ...base, audioDirection: { soundBed: 'building', impactCues: [], sonicSpace: false, intensity: -5 } };
    expect(validateSegment(rawHigh, 0).audioDirection?.intensity).toBe(10);
    expect(validateSegment(rawLow, 0).audioDirection?.intensity).toBe(0);
  });

  it('drops audioDirection when soundBed is invalid', () => {
    const raw = {
      ...base,
      audioDirection: { soundBed: 'spooky', impactCues: [], sonicSpace: false, intensity: 5 },
    };
    const result = validateSegment(raw, 0);
    expect(result.audioDirection).toBeUndefined();
  });

  it('drops audioDirection when it is not an object', () => {
    expect(validateSegment({ ...base, audioDirection: 'tense' }, 0).audioDirection).toBeUndefined();
    expect(validateSegment({ ...base, audioDirection: null }, 0).audioDirection).toBeUndefined();
    expect(validateSegment({ ...base, audioDirection: 42 }, 0).audioDirection).toBeUndefined();
  });

  it('preserves dataVisualization when present', () => {
    const raw = { ...base, dataVisualization: 'Bar chart: Nvidia 80%, AMD 15%, Intel 5%' };
    const result = validateSegment(raw, 0);
    expect(result.dataVisualization).toBe('Bar chart: Nvidia 80%, AMD 15%, Intel 5%');
  });

  it('drops dataVisualization when absent or blank', () => {
    expect(validateSegment(base, 0).dataVisualization).toBeUndefined();
    expect(validateSegment({ ...base, dataVisualization: '   ' }, 0).dataVisualization).toBeUndefined();
    expect(validateSegment({ ...base, dataVisualization: 123 }, 0).dataVisualization).toBeUndefined();
  });

  it('property: audioDirection is preserved for all valid soundBeds', () => {
    const validBeds: AudioDirection['soundBed'][] = ['calm', 'tense', 'neutral', 'building', 'release'];
    for (const soundBed of validBeds) {
      const raw = { ...base, audioDirection: { soundBed, impactCues: ['whoosh'], sonicSpace: true, intensity: 5 } };
      const result = validateSegment(raw, 0);
      expect(result.audioDirection?.soundBed).toBe(soundBed);
    }
  });
});
