// Feature: codebase-robustness-audit, Property 18: YouTube metadata truncation
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { generateYouTubeMetadata } from '../youtube';
import type { ScriptSegment, VideoProject, MediaAsset } from '../../types';

/**
 * **Validates: Requirements 20.4**
 *
 * Property 18: YouTube metadata truncation
 *
 * For any title and description of arbitrary length, `generateYouTubeMetadata`
 * SHALL return a title of at most 100 characters and a description of at most
 * 5000 characters.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSegment(overrides: Partial<ScriptSegment> = {}): ScriptSegment {
  return {
    id: 'seg-1',
    type: 'section',
    title: 'Default Segment',
    narration: 'Default narration text.',
    visualNote: 'Default visual note.',
    duration: 10,
    ...overrides,
  };
}

function makeProject(
  topic: string,
  script: ScriptSegment[],
  media: MediaAsset[] = [],
): VideoProject {
  return {
    id: 'proj-1',
    title: topic,
    topic,
    style: 'business_insider',
    targetDuration: 60,
    script,
    media,
    narration: [],
    status: 'complete',
    createdAt: new Date(),
  };
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Arbitrary for a title of arbitrary length (including very long titles) */
const titleArb = fc.string({ minLength: 0, maxLength: 500 });

/** Arbitrary for a topic string */
const topicArb = fc.string({ minLength: 1, maxLength: 100 }).filter(
  (s) => s.trim().length > 0,
);

/** Arbitrary for a segment with arbitrary-length narration */
const segmentArb = fc.record({
  id: fc.string({ minLength: 1, maxLength: 10 }),
  type: fc.constantFrom('intro', 'section', 'transition', 'outro') as fc.Arbitrary<ScriptSegment['type']>,
  title: fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
  narration: fc.string({ minLength: 1, maxLength: 1000 }).filter((s) => s.trim().length > 0),
  visualNote: fc.string({ maxLength: 100 }),
  duration: fc.integer({ min: 5, max: 60 }),
});

/** Arbitrary for a non-empty array of segments */
const scriptArb = fc.array(segmentArb, { minLength: 1, maxLength: 20 });

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Property 18: YouTube metadata truncation', () => {
  it('should return a title of at most 100 characters for any input title and topic', () => {
    fc.assert(
      fc.property(titleArb, topicArb, scriptArb, (title, topic, script) => {
        const result = generateYouTubeMetadata(title, topic, script);

        // Title must be at most 100 characters
        expect(result.title.length).toBeLessThanOrEqual(100);

        // Title must be a string
        expect(typeof result.title).toBe('string');
      }),
      { numRuns: 100 },
    );
  });

  it('should return a description of at most 5000 characters for any input', () => {
    fc.assert(
      fc.property(titleArb, topicArb, scriptArb, (title, topic, script) => {
        const result = generateYouTubeMetadata(title, topic, script);

        // Description must be at most 5000 characters
        expect(result.description.length).toBeLessThanOrEqual(5000);

        // Description must be a string
        expect(typeof result.description).toBe('string');
      }),
      { numRuns: 100 },
    );
  });

  it('should return title ≤ 100 and description ≤ 5000 even with a full project and many segments', () => {
    fc.assert(
      fc.property(titleArb, topicArb, scriptArb, (title, topic, script) => {
        const project = makeProject(topic, script);
        const result = generateYouTubeMetadata(title, topic, script, project);

        expect(result.title.length).toBeLessThanOrEqual(100);
        expect(result.description.length).toBeLessThanOrEqual(5000);
      }),
      { numRuns: 100 },
    );
  });

  it('should return title ≤ 100 and description ≤ 5000 with very long narrations', () => {
    fc.assert(
      fc.property(
        topicArb,
        fc.array(
          fc.record({
            id: fc.string({ minLength: 1, maxLength: 10 }),
            type: fc.constant('section' as const),
            title: fc.string({ minLength: 1, maxLength: 200 }).filter((s) => s.trim().length > 0),
            narration: fc.string({ minLength: 100, maxLength: 2000 }).filter((s) => s.trim().length > 0),
            visualNote: fc.constant('visual'),
            duration: fc.constant(30),
          }),
          { minLength: 5, maxLength: 15 },
        ),
        (topic, script) => {
          const longTitle = 'A'.repeat(300);
          const result = generateYouTubeMetadata(longTitle, topic, script);

          expect(result.title.length).toBeLessThanOrEqual(100);
          expect(result.description.length).toBeLessThanOrEqual(5000);
        },
      ),
      { numRuns: 100 },
    );
  });
});
