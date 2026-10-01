import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateVisualPlan, validateShot } from '../llmVisualDirector';

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), success: vi.fn() },
}));

// ---------------------------------------------------------------------------
// validateVisualPlan
// ---------------------------------------------------------------------------

describe('validateVisualPlan', () => {
  it('6.2 returns fallback plan for null input', () => {
    const result = validateVisualPlan(null, 'Test Topic');
    expect(result.intent).toBe('Establish visual context');
    expect(result.queries).toContain('Test Topic');
    expect(result.visualConcept).toBeDefined();
  });

  it('6.3 returns fallback plan for non-object input (string)', () => {
    const result = validateVisualPlan('string', 'Test Topic');
    expect(result.intent).toBe('Establish visual context');
    expect(result.queries).toContain('Test Topic');
  });

  it('6.4 uses "Establish visual context" as default intent when intent field is missing', () => {
    const result = validateVisualPlan({ visualConcept: 'Some concept' }, 'Test Topic');
    expect(result.intent).toBe('Establish visual context');
  });

  it('6.5 preserves all fields from a fully valid input object', () => {
    const input = {
      intent: 'Show the product launch',
      visualConcept: 'Sleek product reveal',
      primaryShot: {
        concept: 'Product on stage',
        queries: ['product launch event', 'keynote stage'],
        vibe: 'cinematic',
      },
      secondaryShot: {
        concept: 'Audience reaction',
        queries: ['crowd applause', 'audience excitement'],
        vibe: 'documentary',
      },
    };
    const result = validateVisualPlan(input, 'Test Topic');
    expect(result.intent).toBe('Show the product launch');
    expect(result.visualConcept).toBe('Sleek product reveal');
    expect(result.shots).toHaveLength(2);
    expect(result.shots![0].concept).toBe('Product on stage');
    expect(result.shots![1].concept).toBe('Audience reaction');
  });

  it('6.6 excludes null shots from the shots array when primaryShot is null', () => {
    const input = {
      intent: 'Establish context',
      visualConcept: 'Documentary style',
      primaryShot: null,
      secondaryShot: {
        concept: 'Supporting b-roll',
        queries: ['background footage'],
        vibe: 'neutral',
      },
    };
    const result = validateVisualPlan(input, 'Test Topic');
    // null primaryShot should be excluded; only the valid secondaryShot remains
    expect(result.shots).toBeDefined();
    expect(result.shots!.every((s) => s !== null)).toBe(true);
    expect(result.shots!.length).toBe(1);
    expect(result.shots![0].concept).toBe('Supporting b-roll');
  });
});

// ---------------------------------------------------------------------------
// validateShot
// ---------------------------------------------------------------------------

describe('validateShot', () => {
  it('6.7 returns null for null input', () => {
    expect(validateShot(null)).toBeNull();
  });

  it('6.8 returns null when concept field is missing', () => {
    expect(validateShot({ queries: ['some query'] })).toBeNull();
  });

  it('6.9 returns a valid shot object for fully valid input', () => {
    const input = { concept: 'City skyline', queries: ['city skyline night'], vibe: 'cinematic' };
    const result = validateShot(input);
    expect(result).not.toBeNull();
    expect(result!.concept).toBe('City skyline');
    expect(result!.queries).toEqual(['city skyline night']);
    expect(result!.vibe).toBe('cinematic');
  });

  it('6.10 returns shot with empty queries array when queries is empty', () => {
    const input = { concept: 'Abstract background', queries: [], vibe: 'minimal' };
    const result = validateShot(input);
    expect(result).not.toBeNull();
    expect(result!.concept).toBe('Abstract background');
    expect(result!.queries).toEqual([]);
  });
});

// Feature: codebase-robustness-audit, Property 12: Visual Director retry with backoff
// ---------------------------------------------------------------------------
// Property 12: Visual Director retry with backoff
// ---------------------------------------------------------------------------

import fc from 'fast-check';
import { generateAIPlan, type LlmVisualPlan } from '../llmVisualDirector';
import type { TopicContext } from '../../types';

/**
 * **Validates: Requirements 16.3, 9.7**
 *
 * Property 12: Visual Director retry with backoff
 *
 * For any sequence of 429/5xx responses from OpenRouter, the Visual Director
 * SHALL retry up to 2 times with exponential backoff, and return a fallback
 * plan if all attempts fail.
 */

// We mock fetchWithTimeout at the module level so generateAIPlan uses our mock.
vi.mock('../../utils/fetchWithTimeout', () => ({
  fetchWithTimeout: vi.fn(),
}));

// Import the mocked module so we can control its behavior per test.
import { fetchWithTimeout as mockFetchWithTimeout } from '../../utils/fetchWithTimeout';
const mockedFetch = vi.mocked(mockFetchWithTimeout);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal TopicContext for testing */
function makeTopicContext(topic: string): TopicContext {
  return {
    topic,
    coreSubject: topic,
    subjectCandidates: [topic],
    resolvedTitle: topic,
    kind: 'concept',
    description: `Description of ${topic}`,
    entities: [],
    parseReasoning: 'test',
  };
}

/** Validate that a plan object is structurally valid (fallback or real) */
function isValidPlan(plan: LlmVisualPlan): boolean {
  return (
    typeof plan.intent === 'string' &&
    plan.intent.length > 0 &&
    typeof plan.visualConcept === 'string' &&
    plan.visualConcept.length > 0 &&
    Array.isArray(plan.queries) &&
    plan.queries.length > 0
  );
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Arbitrary for retryable HTTP status codes (429 and 5xx) */
const retryableStatusArb = fc.oneof(
  fc.constant(429),
  fc.integer({ min: 500, max: 599 }),
);

/** Arbitrary for a non-empty topic string that survives sanitisation (no backticks, double quotes, or backslashes). */
const topicArb = fc.string({ minLength: 1, maxLength: 50 }).filter(
  (s) => s.replace(/[`"\\]/g, '').trim().length > 0,
);

/** Arbitrary for a non-empty segment text */
const segmentTextArb = fc.string({ minLength: 1, maxLength: 100 }).filter(
  (s) => s.trim().length > 0,
);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Property 12: Visual Director retry with backoff', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Sub-property 1: All retryable failures → fallback plan (never throws)
  // -------------------------------------------------------------------------
  it('should return a fallback plan (never throw) when all retries fail with retryable status', async () => {
    await fc.assert(
      fc.asyncProperty(
        retryableStatusArb,
        topicArb,
        segmentTextArb,
        async (status, topic, segmentText) => {
          // fetchWithTimeout throws after exhausting retries (simulating all attempts failing)
          mockedFetch.mockRejectedValue(new Error(`HTTP ${status}`));

          const ctx = makeTopicContext(topic);
          const plan = await generateAIPlan(segmentText, ctx, 'test-api-key');

          // Must return a valid fallback plan, never throw
          expect(plan).toBeDefined();
          expect(isValidPlan(plan)).toBe(true);
          expect(plan.intent).toBe('Fallback visual');
          expect(plan.visualConcept).toBe('Neutral documentary');
          expect(plan.queries.length).toBeGreaterThan(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  // -------------------------------------------------------------------------
  // Sub-property 2: fetchWithTimeout is called with maxRetries: 2
  // -------------------------------------------------------------------------
  it('should call fetchWithTimeout with maxRetries: 2 and timeoutMs: 20000', async () => {
    await fc.assert(
      fc.asyncProperty(
        topicArb,
        segmentTextArb,
        async (topic, segmentText) => {
          // Clear mock state between iterations so call counts are per-iteration
          mockedFetch.mockClear();

          // Return a non-ok response so we exercise the fallback path
          mockedFetch.mockResolvedValue({
            ok: false,
            status: 500,
            statusText: 'Internal Server Error',
          } as Response);

          const ctx = makeTopicContext(topic);
          await generateAIPlan(segmentText, ctx, 'test-api-key');

          // Verify fetchWithTimeout was called exactly once (generateAIPlan calls it once)
          expect(mockedFetch).toHaveBeenCalledTimes(1);
          const callArgs = mockedFetch.mock.calls[0];
          // Third argument is the config object
          const config = callArgs[2] as { timeoutMs?: number; maxRetries?: number };
          expect(config.maxRetries).toBe(2);
          expect(config.timeoutMs).toBe(20_000);
        },
      ),
      { numRuns: 100 },
    );
  });

  // -------------------------------------------------------------------------
  // Sub-property 3: Network errors also produce fallback plan
  // -------------------------------------------------------------------------
  it('should return a fallback plan when fetchWithTimeout throws a network error', async () => {
    await fc.assert(
      fc.asyncProperty(
        topicArb,
        segmentTextArb,
        async (topic, segmentText) => {
          mockedFetch.mockRejectedValue(new TypeError('Failed to fetch'));

          const ctx = makeTopicContext(topic);
          const plan = await generateAIPlan(segmentText, ctx, 'test-api-key');

          expect(plan).toBeDefined();
          expect(isValidPlan(plan)).toBe(true);
          expect(plan.intent).toBe('Fallback visual');
          expect(plan.visualConcept).toBe('Neutral documentary');
        },
      ),
      { numRuns: 100 },
    );
  });

  // -------------------------------------------------------------------------
  // Sub-property 4: Non-ok response (after retries exhausted) returns fallback
  // -------------------------------------------------------------------------
  it('should return a fallback plan when response.ok is false', async () => {
    await fc.assert(
      fc.asyncProperty(
        retryableStatusArb,
        topicArb,
        segmentTextArb,
        async (status, topic, segmentText) => {
          // fetchWithTimeout returns a non-ok response (e.g. after retries, the last response is returned)
          mockedFetch.mockResolvedValue({
            ok: false,
            status,
            statusText: `Status ${status}`,
          } as Response);

          const ctx = makeTopicContext(topic);
          const plan = await generateAIPlan(segmentText, ctx, 'test-api-key');

          // The function sanitises the topic (strips backticks, quotes, backslashes)
          // before using it as the fallback query.
          const sanitised = topic.replace(/[`"\\]/g, '').slice(0, 200).trim();

          expect(plan).toBeDefined();
          expect(plan.intent).toBe('Fallback visual');
          expect(plan.visualConcept).toBe('Neutral documentary');
          expect(plan.queries).toContain(sanitised);
        },
      ),
      { numRuns: 100 },
    );
  });
});
