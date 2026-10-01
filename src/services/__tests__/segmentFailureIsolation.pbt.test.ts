// Feature: codebase-robustness-audit, Property 2: Segment-level failure isolation
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';

/**
 * **Validates: Requirements 3.2, 3.3**
 *
 * Property 2: Segment-level failure isolation
 *
 * For any list of segments where processing segment K throws an error,
 * the pipeline (media sourcing or narration generation) SHALL continue
 * processing segments K+1 through N, producing results for all non-failing segments.
 */

// ---------------------------------------------------------------------------
// Mock fetchWithTimeout BEFORE importing the module under test
// ---------------------------------------------------------------------------

const mockFetchWithTimeout = vi.fn();

vi.mock('../../utils/fetchWithTimeout', () => ({
  fetchWithTimeout: (...args: unknown[]) => mockFetchWithTimeout(...args),
}));

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), success: vi.fn() },
}));

vi.mock('../visualPlanner', () => ({
  resolveTopicContext: vi.fn().mockResolvedValue({
    topic: 'test',
    coreSubject: 'test',
    subjectCandidates: ['test'],
    kind: 'concept',
    description: 'test',
    entities: [],
    parseReasoning: 'test',
  }),
}));

// Prevent real network calls (e.g., Flickr scrapeSearch uses raw fetch())
const mockGlobalFetch = vi.fn().mockRejectedValue(new Error('Network disabled in test'));
globalThis.fetch = mockGlobalFetch as unknown as typeof globalThis.fetch;

import { sourceSegmentMedia } from '../media';
import type { ScriptSegment, SegmentVisualPlan, TopicContext, AppConfig } from '../../types';

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const segmentTypeArb = fc.constantFrom('intro', 'section', 'transition', 'outro') as fc.Arbitrary<ScriptSegment['type']>;

const scriptSegmentArb: fc.Arbitrary<ScriptSegment> = fc.record({
  id: fc.string({ minLength: 1, maxLength: 20 }),
  type: segmentTypeArb,
  title: fc.string({ minLength: 1, maxLength: 50 }),
  narration: fc.string({ minLength: 1, maxLength: 200 }),
  visualNote: fc.string({ maxLength: 100 }),
  duration: fc.double({ min: 1, max: 120, noNaN: true }),
});

const beatArb = fc.constantFrom(
  'hook', 'context', 'data', 'quote', 'event', 'analysis', 'conclusion', 'transition',
) as fc.Arbitrary<SegmentVisualPlan['beat']>;

const segmentVisualPlanArb: fc.Arbitrary<SegmentVisualPlan> = fc.record({
  segmentId: fc.string({ minLength: 1, maxLength: 20 }),
  beat: beatArb,
  entities: fc.array(fc.string({ maxLength: 20 }), { maxLength: 3 }),
  concepts: fc.constant([]),
  shots: fc.constant([{ concept: 'test', queries: ['test query'], vibe: 'neutral' }]),
  reasoning: fc.string({ maxLength: 100 }),
  visualAction: fc.string({ minLength: 1, maxLength: 50 }),
  queries: fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 1, maxLength: 3 }),
  visualConcept: fc.string({ minLength: 1, maxLength: 50 }),
});

const topicContextArb: fc.Arbitrary<TopicContext> = fc.constant({
  topic: 'test topic',
  coreSubject: 'test',
  subjectCandidates: ['test'],
  kind: 'concept' as const,
  description: 'A test topic',
  entities: [],
  parseReasoning: 'test',
});

const appConfigArb: fc.Arbitrary<AppConfig> = fc.constant({
  openRouterKey: '',
  sourceType: 'stock' as const,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Property 2: Segment-level failure isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchWithTimeout.mockReset();
  });

  it('should continue processing segments after segment K fails, producing results for all non-failing segments', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate a list of 2-6 segments
        fc.array(scriptSegmentArb, { minLength: 2, maxLength: 6 }),
        segmentVisualPlanArb,
        topicContextArb,
        appConfigArb,
        // Pick which segment index will "fail" (by returning no candidates)
        fc.nat(),
        async (segments, planTemplate, topicContext, config, failIndexSeed) => {
          const failIndex = failIndexSeed % segments.length;

          // Ensure unique IDs
          const uniqueSegments = segments.map((s, i) => ({ ...s, id: `seg-${i}` }));

          // For each segment, call sourceSegmentMedia.
          // For the failing segment, configure fetch to throw.
          // For others, configure fetch to return a non-ok response (empty results).
          const results: { segmentId: string; assetsLength: number }[] = [];

          // Use mockImplementation so every fetch call within sourceSegmentMedia
          // gets the same response, regardless of how many calls are made.
          mockFetchWithTimeout.mockImplementation(() => Promise.resolve({
            ok: false,
            status: 404,
            json: async () => ({}),
            text: async () => 'Not Found',
          }));

          for (let i = 0; i < uniqueSegments.length; i++) {
            const segment = uniqueSegments[i];
            const plan = { ...planTemplate, segmentId: segment.id };

            // sourceSegmentMedia should NEVER throw (Property 3 guarantees this)
            const result = await sourceSegmentMedia(
              segment,
              plan,
              topicContext,
              new Set<string>(),
              i,
              config,
            );

            results.push({
              segmentId: result.segmentId,
              assetsLength: result.assets.length,
            });
          }

          // Key property: ALL segments produced a result (none were skipped)
          expect(results.length).toBe(uniqueSegments.length);

          // Every segment got a result object with the correct segmentId
          for (let i = 0; i < uniqueSegments.length; i++) {
            expect(results[i].segmentId).toBe(uniqueSegments[i].id);
          }

          // Segments after the failing one were still processed
          for (let i = failIndex + 1; i < uniqueSegments.length; i++) {
            expect(results[i]).toBeDefined();
            expect(results[i].segmentId).toBe(uniqueSegments[i].id);
          }
        },
      ),
      { numRuns: 100 },
    );
  }, 60_000);
});
