// Feature: codebase-robustness-audit, Property 15: Visual plan validation produces valid fallback
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { validateVisualPlan, type LlmVisualPlan } from '../llmVisualDirector';

/**
 * **Validates: Requirements 17.2**
 *
 * Property 15: Visual plan validation produces valid fallback
 *
 * For any raw object (including null, undefined, empty objects),
 * `validateVisualPlan` SHALL return a valid LlmVisualPlan with fallback
 * values for all missing or invalid fields.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isValidVisualPlan(plan: LlmVisualPlan): boolean {
  return (
    typeof plan.intent === 'string' &&
    plan.intent.length > 0 &&
    typeof plan.visualConcept === 'string' &&
    plan.visualConcept.length > 0 &&
    Array.isArray(plan.queries) &&
    plan.queries.length > 0 &&
    plan.queries.every((q) => typeof q === 'string' && q.length > 0)
  );
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Arbitrary for any raw input (including non-objects) */
const rawInputArb = fc.oneof(
  fc.constant(null),
  fc.constant(undefined),
  fc.constant(0),
  fc.constant(''),
  fc.constant(false),
  fc.constant([]),
  fc.constant({}),
  // Object with some valid fields
  fc.record({
    intent: fc.oneof(
      fc.string({ maxLength: 100 }),
      fc.integer(),
      fc.constant(null),
      fc.constant(undefined),
      fc.constant(''),
      fc.constant('   '),
    ),
    visualConcept: fc.oneof(
      fc.string({ maxLength: 100 }),
      fc.integer(),
      fc.constant(null),
      fc.constant(undefined),
      fc.constant(''),
      fc.constant('   '),
    ),
    primaryShot: fc.oneof(
      fc.constant(null),
      fc.constant(undefined),
      fc.constant({}),
      fc.constant('not an object'),
      fc.record({
        concept: fc.oneof(fc.string({ maxLength: 50 }), fc.constant(''), fc.constant(null)),
        queries: fc.oneof(
          fc.array(fc.string({ maxLength: 30 }), { maxLength: 3 }),
          fc.constant(null),
          fc.constant('not an array'),
        ),
        vibe: fc.oneof(fc.string({ maxLength: 30 }), fc.constant(null)),
      }),
    ),
    secondaryShot: fc.oneof(
      fc.constant(null),
      fc.constant(undefined),
      fc.constant({}),
      fc.record({
        concept: fc.oneof(fc.string({ minLength: 1, maxLength: 50 }), fc.constant('')),
        queries: fc.oneof(
          fc.array(fc.string({ maxLength: 30 }), { maxLength: 3 }),
          fc.constant(null),
        ),
        vibe: fc.oneof(fc.string({ maxLength: 30 }), fc.constant(null)),
      }),
    ),
  }),
  // Object with extra/unexpected fields
  fc.record({
    foo: fc.string(),
    bar: fc.integer(),
    baz: fc.boolean(),
  }),
  // Deeply nested garbage
  fc.record({
    intent: fc.constant({ nested: 'object' }),
    primaryShot: fc.constant([1, 2, 3]),
  }),
);

/** Arbitrary for the fallback topic string */
const fallbackTopicArb = fc.string({ minLength: 1, maxLength: 50 }).filter(
  (s) => s.trim().length > 0,
);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Property 15: Visual plan validation produces valid fallback', () => {
  it('should return a valid LlmVisualPlan with fallback values for any raw input', () => {
    fc.assert(
      fc.property(rawInputArb, fallbackTopicArb, (rawInput, fallbackTopic) => {
        const result = validateVisualPlan(rawInput, fallbackTopic);

        // Must be a valid visual plan
        expect(isValidVisualPlan(result)).toBe(true);

        // Intent must be a non-empty string
        expect(typeof result.intent).toBe('string');
        expect(result.intent.length).toBeGreaterThan(0);

        // VisualConcept must be a non-empty string
        expect(typeof result.visualConcept).toBe('string');
        expect(result.visualConcept.length).toBeGreaterThan(0);

        // Queries must be a non-empty array of non-empty strings
        expect(Array.isArray(result.queries)).toBe(true);
        expect(result.queries.length).toBeGreaterThan(0);
        for (const q of result.queries) {
          expect(typeof q).toBe('string');
          expect(q.length).toBeGreaterThan(0);
        }

        // Shots, if present, must be an array of valid shot objects
        if (result.shots) {
          expect(Array.isArray(result.shots)).toBe(true);
          for (const shot of result.shots) {
            expect(typeof shot.concept).toBe('string');
            expect(shot.concept.length).toBeGreaterThan(0);
            expect(Array.isArray(shot.queries)).toBe(true);
            expect(typeof shot.vibe).toBe('string');
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  it('should use fallbackTopic in queries when no valid queries are extractable from input', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant(null),
          fc.constant(undefined),
          fc.constant({}),
          fc.constant({ intent: 'test' }),
        ),
        fallbackTopicArb,
        (rawInput, fallbackTopic) => {
          const result = validateVisualPlan(rawInput, fallbackTopic);

          // When no valid shots/queries exist, fallbackTopic should appear in queries
          expect(result.queries).toContain(fallbackTopic);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should preserve valid intent and visualConcept when provided', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 80 }).filter((s) => s.trim().length > 0),
        fc.string({ minLength: 1, maxLength: 80 }).filter((s) => s.trim().length > 0),
        fallbackTopicArb,
        (intent, visualConcept, fallbackTopic) => {
          const raw = { intent, visualConcept };
          const result = validateVisualPlan(raw, fallbackTopic);

          expect(result.intent).toBe(intent.trim());
          expect(result.visualConcept).toBe(visualConcept.trim());
        },
      ),
      { numRuns: 100 },
    );
  });
});
