// Feature: codebase-robustness-audit, Property 3: sourceSegmentMedia never throws
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';

/**
 * **Validates: Requirements 3.7**
 *
 * Property 3: sourceSegmentMedia never throws
 *
 * For any valid or invalid combination of segment, visual plan, topic context,
 * and app config, `sourceSegmentMedia` SHALL return a result object (possibly
 * with fallback assets) and SHALL NOT throw an unhandled exception.
 */

// ---------------------------------------------------------------------------
// Mock fetchWithTimeout BEFORE importing the module under test
// ---------------------------------------------------------------------------

// We need to control fetchWithTimeout to simulate various failure modes
// (network errors, timeouts, invalid responses, etc.)
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

// Import after mocks are set up
import { sourceSegmentMedia } from '../media';
import type { ScriptSegment, SegmentVisualPlan, TopicContext, AppConfig } from '../../types';

// ---------------------------------------------------------------------------
// Arbitraries — generate diverse inputs for the function under test
// ---------------------------------------------------------------------------

const segmentTypeArb = fc.constantFrom('intro', 'section', 'transition', 'outro') as fc.Arbitrary<ScriptSegment['type']>;

const scriptSegmentArb: fc.Arbitrary<ScriptSegment> = fc.record({
  id: fc.string({ minLength: 1, maxLength: 20 }),
  type: segmentTypeArb,
  title: fc.string({ maxLength: 100 }),
  narration: fc.string({ maxLength: 500 }),
  visualNote: fc.string({ maxLength: 200 }),
  duration: fc.double({ min: 0.1, max: 300, noNaN: true }),
});

const beatArb = fc.constantFrom(
  'hook', 'context', 'data', 'quote', 'event', 'analysis', 'conclusion', 'transition',
) as fc.Arbitrary<SegmentVisualPlan['beat']>;

const visualTypeArb = fc.constantFrom(
  'portrait', 'product', 'logo', 'location', 'event', 'chart', 'document', 'concept', 'crowd', 'historical',
);

const visualConceptArb = fc.record({
  description: fc.string({ maxLength: 100 }),
  queries: fc.array(fc.string({ maxLength: 50 }), { minLength: 0, maxLength: 3 }),
  priority: fc.integer({ min: 0, max: 10 }),
  visualType: visualTypeArb,
  entity: fc.option(fc.string({ maxLength: 30 }), { nil: undefined }),
});

const shotArb = fc.record({
  concept: fc.string({ maxLength: 80 }),
  queries: fc.array(fc.string({ maxLength: 50 }), { minLength: 1, maxLength: 3 }),
  vibe: fc.string({ maxLength: 50 }),
});

const segmentVisualPlanArb: fc.Arbitrary<SegmentVisualPlan> = fc.record({
  segmentId: fc.string({ minLength: 1, maxLength: 20 }),
  beat: beatArb,
  entities: fc.array(fc.string({ maxLength: 30 }), { maxLength: 5 }),
  concepts: fc.array(visualConceptArb, { maxLength: 3 }),
  shots: fc.option(fc.array(shotArb, { minLength: 0, maxLength: 4 }), { nil: undefined }),
  reasoning: fc.string({ maxLength: 200 }),
  visualAction: fc.string({ maxLength: 100 }),
  queries: fc.array(fc.string({ maxLength: 50 }), { minLength: 1, maxLength: 5 }),
  visualConcept: fc.string({ maxLength: 100 }),
});

const entityKindArb = fc.constantFrom(
  'person', 'company', 'country', 'place', 'event', 'conflict', 'product', 'technology', 'organization', 'concept',
) as fc.Arbitrary<TopicContext['kind']>;

const topicContextArb: fc.Arbitrary<TopicContext> = fc.record({
  topic: fc.string({ maxLength: 100 }),
  coreSubject: fc.string({ maxLength: 50 }),
  subjectCandidates: fc.array(fc.string({ maxLength: 50 }), { maxLength: 5 }),
  resolvedTitle: fc.option(fc.string({ maxLength: 50 }), { nil: undefined }),
  kind: entityKindArb,
  description: fc.string({ maxLength: 200 }),
  extract: fc.option(fc.string({ maxLength: 200 }), { nil: undefined }),
  entities: fc.array(fc.string({ maxLength: 30 }), { maxLength: 5 }),
  heroImageUrl: fc.option(fc.string({ maxLength: 100 }), { nil: undefined }),
  parseReasoning: fc.string({ maxLength: 200 }),
  thumbnailUrl: fc.option(fc.string({ maxLength: 100 }), { nil: undefined }),
});

const appConfigArb: fc.Arbitrary<AppConfig> = fc.record({
  openRouterKey: fc.string({ maxLength: 40 }),
  sourceType: fc.constantFrom('stock', 'raw') as fc.Arbitrary<AppConfig['sourceType']>,
});

/** Arbitrary for the failure mode of fetchWithTimeout */
const fetchFailureModeArb = fc.constantFrom(
  'network-error',
  'timeout',
  'invalid-json',
  'non-ok-response',
  'null-response',
  'throws-string',
  'throws-undefined',
  'returns-empty-body',
  'returns-html',
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Configure mockFetchWithTimeout to simulate a specific failure mode.
 * Each mode represents a realistic failure scenario.
 */
function configureFetchMock(mode: string): void {
  // Use mockImplementation so every fetch call within sourceSegmentMedia
  // gets the same treatment, regardless of how many calls are made.
  switch (mode) {
    case 'network-error':
      mockFetchWithTimeout.mockImplementation(() => Promise.reject(new TypeError('Failed to fetch')));
      break;
    case 'timeout':
      mockFetchWithTimeout.mockImplementation(() => Promise.reject(
        new DOMException('The operation was aborted.', 'AbortError'),
      ));
      break;
    case 'invalid-json':
      mockFetchWithTimeout.mockImplementation(() => Promise.resolve({
        ok: true,
        status: 200,
        json: async () => { throw new SyntaxError('Unexpected token < in JSON'); },
        text: async () => '<html>Error</html>',
      }));
      break;
    case 'non-ok-response':
      mockFetchWithTimeout.mockImplementation(() => Promise.resolve({
        ok: false,
        status: 500,
        json: async () => ({}),
        text: async () => 'Internal Server Error',
      }));
      break;
    case 'null-response':
      mockFetchWithTimeout.mockImplementation(() => Promise.resolve({
        ok: true,
        status: 200,
        json: async () => null,
        text: async () => 'null',
      }));
      break;
    case 'throws-string':
      mockFetchWithTimeout.mockImplementation(() => Promise.reject('string error'));
      break;
    case 'throws-undefined':
      mockFetchWithTimeout.mockImplementation(() => Promise.reject(undefined));
      break;
    case 'returns-empty-body':
      mockFetchWithTimeout.mockImplementation(() => Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({}),
        text: async () => '',
      }));
      break;
    case 'returns-html':
      mockFetchWithTimeout.mockImplementation(() => Promise.resolve({
        ok: true,
        status: 200,
        json: async () => { throw new SyntaxError('Unexpected token <'); },
        text: async () => '<!DOCTYPE html><html><body>502 Bad Gateway</body></html>',
      }));
      break;
    default:
      mockFetchWithTimeout.mockImplementation(() => Promise.resolve({
        ok: false,
        status: 404,
        json: async () => ({}),
        text: async () => 'Not Found',
      }));
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Property 3: sourceSegmentMedia never throws', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Re-apply logger mock after restoreAllMocks
    mockFetchWithTimeout.mockReset();
  });

  afterEach(() => {
    mockFetchWithTimeout.mockReset();
  });

  it('should always return a result object with { segmentId, plan, assets } and never throw, regardless of fetch failure mode', async () => {
    await fc.assert(
      fc.asyncProperty(
        scriptSegmentArb,
        segmentVisualPlanArb,
        topicContextArb,
        appConfigArb,
        fetchFailureModeArb,
        fc.integer({ min: 0, max: 20 }),
        async (segment, plan, topicContext, config, failureMode, segmentIndex) => {
          // Configure the mock to simulate the chosen failure mode
          configureFetchMock(failureMode);

          const usedUrls = new Set<string>();

          // The key property: sourceSegmentMedia should NEVER throw
          const result = await sourceSegmentMedia(
            segment,
            plan,
            topicContext,
            usedUrls,
            segmentIndex,
            config,
          );

          // Result must always be an object with the expected shape
          expect(result).toBeDefined();
          expect(result).toHaveProperty('segmentId');
          expect(result).toHaveProperty('plan');
          expect(result).toHaveProperty('assets');
          expect(result.segmentId).toBe(segment.id);
          expect(result.plan).toBe(plan);
          expect(Array.isArray(result.assets)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  }, 60_000);

  it('should return a valid result even when an AbortSignal is already aborted', async () => {
    await fc.assert(
      fc.asyncProperty(
        scriptSegmentArb,
        segmentVisualPlanArb,
        topicContextArb,
        appConfigArb,
        fc.integer({ min: 0, max: 20 }),
        async (segment, plan, topicContext, config, segmentIndex) => {
          // Simulate an already-aborted signal
          const controller = new AbortController();
          controller.abort();

          mockFetchWithTimeout.mockImplementation(() => Promise.reject(
            new DOMException('The operation was aborted.', 'AbortError'),
          ));

          const usedUrls = new Set<string>();

          const result = await sourceSegmentMedia(
            segment,
            plan,
            topicContext,
            usedUrls,
            segmentIndex,
            config,
            controller.signal,
          );

          expect(result).toBeDefined();
          expect(result).toHaveProperty('segmentId');
          expect(result).toHaveProperty('plan');
          expect(result).toHaveProperty('assets');
          expect(result.segmentId).toBe(segment.id);
          expect(Array.isArray(result.assets)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  }, 60_000);
});
