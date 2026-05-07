// Feature: codebase-robustness-audit, Property 4: Batch job failure isolation
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';
import { BatchProcessor } from '../batchProcessor';
import type { TopicConfig, VideoProject } from '../../types';

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), success: vi.fn() },
}));

/**
 * **Validates: Requirements 4.4, 14.1**
 *
 * Property 4: Batch job failure isolation
 *
 * For any batch of jobs where job K fails with an error, the batch processor
 * SHALL mark job K as 'error' and continue processing jobs K+1 through N,
 * completing all non-failing jobs.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProject(topic: string): VideoProject {
  return {
    id: `proj-${topic}`,
    title: topic,
    topic,
    style: 'explainer',
    targetDuration: 60,
    script: [],
    media: [],
    narration: [],
    status: 'complete',
    createdAt: new Date(),
  };
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Arbitrary for a non-empty topic string */
const topicArb = fc.string({ minLength: 1, maxLength: 30 }).filter(
  (s) => s.trim().length > 0,
);

/** Arbitrary for a list of topics (2-8) with a boolean mask indicating which should fail */
const batchArb = fc.array(
  fc.record({
    topic: topicArb,
    shouldFail: fc.boolean(),
  }),
  { minLength: 2, maxLength: 8 },
);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Property 4: Batch job failure isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should mark failing jobs as error and continue processing remaining jobs to completion', async () => {
    await fc.assert(
      fc.asyncProperty(batchArb, async (batchItems) => {
        const processor = new BatchProcessor();

        const topics = batchItems.map((b) => b.topic);
        const failSet = new Set(
          batchItems
            .map((b, i) => (b.shouldFail ? i : -1))
            .filter((i) => i >= 0),
        );

        processor.createJobs({
          topics,
          baseConfig: {
            style: 'explainer',
            targetDuration: 3,
            tone: 'informative',
            audience: 'general',
          },
        });

        const generateVideo = vi.fn().mockImplementation(
          async (config: TopicConfig, _signal: AbortSignal) => {
            // Find the index of this topic in the original list
            const idx = topics.indexOf(config.topic);
            if (failSet.has(idx)) {
              throw new Error(`Simulated failure for "${config.topic}"`);
            }
            return makeProject(config.topic);
          },
        );

        const jobs = await processor.process(generateVideo, 1, 0);

        // Key property: ALL jobs were processed (none skipped)
        expect(jobs.length).toBe(batchItems.length);

        for (let i = 0; i < batchItems.length; i++) {
          if (failSet.has(i)) {
            // Failing jobs should be marked as 'error'
            expect(jobs[i].status).toBe('error');
            expect(jobs[i].error).toBeDefined();
            expect(typeof jobs[i].error).toBe('string');
          } else {
            // Non-failing jobs should be marked as 'complete'
            expect(jobs[i].status).toBe('complete');
            expect(jobs[i].project).toBeDefined();
          }
        }

        // Verify completed and failed job counts match expectations
        const expectedComplete = batchItems.filter((b) => !b.shouldFail).length;
        const expectedFailed = batchItems.filter((b) => b.shouldFail).length;
        expect(processor.getCompletedJobs().length).toBe(expectedComplete);
        expect(processor.getFailedJobs().length).toBe(expectedFailed);
      }),
      { numRuns: 100 },
    );
  }, 60_000);
});
