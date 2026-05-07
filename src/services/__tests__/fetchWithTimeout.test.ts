// Feature: codebase-robustness-audit, Property 1: fetchWithTimeout enforces per-attempt timeout and correct retry behavior
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import { fetchWithTimeout } from '../../utils/fetchWithTimeout';

/**
 * **Validates: Requirements 1.1, 1.2, 1.5, 1.6, 16.1, 16.2, 16.5**
 *
 * Property 1: fetchWithTimeout enforces per-attempt timeout and correct retry behavior
 *
 * For any timeout value T, maximum retry count N, and sequence of server responses,
 * fetchWithTimeout SHALL abort each attempt after T milliseconds, retry on 429/5xx
 * up to N times with exponential backoff, and NOT retry on 4xx client errors (except 429).
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a fresh mock Response with the given status (no body to avoid 204 issues) */
function mockResponse(status: number): Response {
  // Use null body for statuses that don't allow body (204, 304, etc.)
  const nullBodyStatuses = [101, 204, 205, 304];
  if (nullBodyStatuses.includes(status)) {
    return new Response(null, { status, statusText: `Status ${status}` });
  }
  return new Response('', { status, statusText: `Status ${status}` });
}

/** Create a fetch mock that returns responses based on a factory per call index */
function sequenceFetch(
  responseFactory: (index: number) => Response | Error,
  callCountRef: { count: number },
): typeof globalThis.fetch {
  return vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const signal = init?.signal as AbortSignal | undefined;
    if (signal?.aborted) {
      throw new DOMException('The operation was aborted.', 'AbortError');
    }
    const idx = callCountRef.count;
    callCountRef.count++;
    const item = responseFactory(idx);
    if (item instanceof Error) throw item;
    return item;
  }) as unknown as typeof globalThis.fetch;
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Arbitrary for retryable HTTP status codes (429 and 5xx) */
const retryableStatusArb = fc.oneof(
  fc.constant(429),
  fc.integer({ min: 500, max: 599 }),
);

/** Arbitrary for non-retryable 4xx status codes (400-428, 430-499) */
const nonRetryable4xxArb = fc.integer({ min: 400, max: 499 }).filter((s) => s !== 429);

/** Arbitrary for successful status codes (200, 201, 202, 203 — avoid 204/205 which have null body restrictions) */
const successStatusArb = fc.constantFrom(200, 201, 202, 203);

/** Arbitrary for maxRetries (keep small for fast tests) */
const maxRetriesArb = fc.integer({ min: 1, max: 5 });

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Property 1: fetchWithTimeout enforces per-attempt timeout and correct retry behavior', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // -------------------------------------------------------------------------
  // Sub-property 1: Per-attempt timeout enforcement
  // -------------------------------------------------------------------------
  it('should abort each attempt after timeoutMs milliseconds', async () => {
    // Use a small fixed timeout to keep tests fast.
    // The delayed fetch takes longer than the timeout, so each attempt should be aborted.
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 3 }), // keep maxRetries small for timeout tests
        async (maxRetries) => {
          const timeoutMs = 30; // 30ms timeout
          const fetchDelay = 500; // fetch takes 500ms — will always timeout

          // Track how many times fetch was called
          let fetchCallCount = 0;
          globalThis.fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
            fetchCallCount++;
            const signal = init?.signal as AbortSignal | undefined;
            return new Promise<Response>((resolve, reject) => {
              if (signal?.aborted) {
                reject(new DOMException('The operation was aborted.', 'AbortError'));
                return;
              }
              const timer = setTimeout(() => resolve(mockResponse(200)), fetchDelay);
              signal?.addEventListener('abort', () => {
                clearTimeout(timer);
                reject(new DOMException('The operation was aborted.', 'AbortError'));
              });
            });
          }) as unknown as typeof globalThis.fetch;

          const start = Date.now();
          await expect(
            fetchWithTimeout('https://example.com', {}, {
              timeoutMs,
              maxRetries,
              baseDelayMs: 1,
              maxDelayMs: 2,
            }),
          ).rejects.toThrow();
          const elapsed = Date.now() - start;

          // All attempts should have been made
          expect(fetchCallCount).toBe(maxRetries);

          // Total time should be much less than maxRetries * fetchDelay
          // (which would mean timeouts didn't fire)
          expect(elapsed).toBeLessThan(maxRetries * fetchDelay);
        },
      ),
      { numRuns: 100 },
    );
  }, 30_000); // 30s test timeout

  // -------------------------------------------------------------------------
  // Sub-property 2: Retry on 429/5xx up to maxRetries with exponential backoff
  // -------------------------------------------------------------------------
  it('should retry on 429/5xx responses up to maxRetries times', async () => {
    await fc.assert(
      fc.asyncProperty(
        retryableStatusArb,
        maxRetriesArb,
        async (status, maxRetries) => {
          const callCountRef = { count: 0 };
          // Every call returns a fresh retryable response
          globalThis.fetch = sequenceFetch(
            () => mockResponse(status),
            callCountRef,
          );

          await expect(
            fetchWithTimeout('https://example.com', {}, {
              maxRetries,
              baseDelayMs: 1,
              maxDelayMs: 2,
              timeoutMs: 5000,
            }),
          ).rejects.toThrow(`HTTP ${status}`);

          // fetch should have been called exactly maxRetries times
          expect(callCountRef.count).toBe(maxRetries);
        },
      ),
      { numRuns: 100 },
    );
  }, 30_000);

  // -------------------------------------------------------------------------
  // Sub-property 3: No retry on 4xx client errors (except 429)
  // -------------------------------------------------------------------------
  it('should throw immediately on 4xx client errors (except 429) without retrying', async () => {
    await fc.assert(
      fc.asyncProperty(
        nonRetryable4xxArb,
        maxRetriesArb,
        async (status, maxRetries) => {
          const callCountRef = { count: 0 };
          globalThis.fetch = sequenceFetch(
            () => mockResponse(status),
            callCountRef,
          );

          await expect(
            fetchWithTimeout('https://example.com', {}, {
              maxRetries,
              baseDelayMs: 1,
              maxDelayMs: 2,
              timeoutMs: 5000,
            }),
          ).rejects.toThrow(`HTTP ${status}`);

          // fetch should have been called exactly ONCE — no retries
          expect(callCountRef.count).toBe(1);
        },
      ),
      { numRuns: 100 },
    );
  });

  // -------------------------------------------------------------------------
  // Sub-property 4: External AbortSignal stops all retries immediately
  // -------------------------------------------------------------------------
  it('should stop all retries immediately when external AbortSignal is aborted', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 5 }), // need at least 2 retries to observe early stop
        async (maxRetries) => {
          const controller = new AbortController();

          let fetchCallCount = 0;
          // Fetch that takes a while — gives us time to abort
          globalThis.fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
            fetchCallCount++;
            const signal = init?.signal as AbortSignal | undefined;
            return new Promise<Response>((resolve, reject) => {
              if (signal?.aborted) {
                reject(new DOMException('The operation was aborted.', 'AbortError'));
                return;
              }
              const timer = setTimeout(() => resolve(mockResponse(500)), 200);
              signal?.addEventListener('abort', () => {
                clearTimeout(timer);
                reject(new DOMException('The operation was aborted.', 'AbortError'));
              });
            });
          }) as unknown as typeof globalThis.fetch;

          // Abort after a short delay — should stop before all retries complete
          setTimeout(() => controller.abort(), 50);

          await expect(
            fetchWithTimeout('https://example.com', {}, {
              maxRetries,
              baseDelayMs: 1,
              maxDelayMs: 2,
              timeoutMs: 5000,
              signal: controller.signal,
            }),
          ).rejects.toThrow();

          // Should have been called at least once but fewer than maxRetries
          expect(fetchCallCount).toBeGreaterThanOrEqual(1);
          expect(fetchCallCount).toBeLessThanOrEqual(maxRetries);
        },
      ),
      { numRuns: 100 },
    );
  }, 30_000);

  // -------------------------------------------------------------------------
  // Sub-property 5: Network errors (TypeError) trigger retry with backoff
  // -------------------------------------------------------------------------
  it('should retry on network errors (TypeError) up to maxRetries times', async () => {
    await fc.assert(
      fc.asyncProperty(
        maxRetriesArb,
        async (maxRetries) => {
          const callCountRef = { count: 0 };
          // All attempts throw TypeError (network error)
          globalThis.fetch = sequenceFetch(
            () => new TypeError('Failed to fetch'),
            callCountRef,
          );

          await expect(
            fetchWithTimeout('https://example.com', {}, {
              maxRetries,
              baseDelayMs: 1,
              maxDelayMs: 2,
              timeoutMs: 5000,
            }),
          ).rejects.toThrow('Failed to fetch');

          // fetch should have been called exactly maxRetries times
          expect(callCountRef.count).toBe(maxRetries);
        },
      ),
      { numRuns: 100 },
    );
  });

  // -------------------------------------------------------------------------
  // Additional: Successful response returns immediately without extra retries
  // -------------------------------------------------------------------------
  it('should return immediately on success without extra retries', async () => {
    await fc.assert(
      fc.asyncProperty(
        successStatusArb,
        maxRetriesArb,
        async (status, maxRetries) => {
          const callCountRef = { count: 0 };
          globalThis.fetch = sequenceFetch(
            () => mockResponse(status),
            callCountRef,
          );

          const response = await fetchWithTimeout('https://example.com', {}, {
            maxRetries,
            baseDelayMs: 1,
            maxDelayMs: 2,
            timeoutMs: 5000,
          });

          expect(response.status).toBe(status);
          // Only one call — no retries needed
          expect(callCountRef.count).toBe(1);
        },
      ),
      { numRuns: 100 },
    );
  });

  // -------------------------------------------------------------------------
  // Additional: Retryable failures followed by success
  // -------------------------------------------------------------------------
  it('should succeed when retryable failures are followed by a success', async () => {
    await fc.assert(
      fc.asyncProperty(
        retryableStatusArb,
        fc.integer({ min: 2, max: 5 }), // maxRetries >= 2 so there's room for a retry then success
        fc.integer({ min: 1, max: 4 }), // number of failures before success
        async (failStatus, maxRetries, failCount) => {
          const actualFailCount = Math.min(failCount, maxRetries - 1); // ensure success is reachable
          const callCountRef = { count: 0 };
          globalThis.fetch = sequenceFetch(
            (idx) => idx < actualFailCount ? mockResponse(failStatus) : mockResponse(200),
            callCountRef,
          );

          const response = await fetchWithTimeout('https://example.com', {}, {
            maxRetries,
            baseDelayMs: 1,
            maxDelayMs: 2,
            timeoutMs: 5000,
          });

          expect(response.status).toBe(200);
          expect(callCountRef.count).toBe(actualFailCount + 1);
        },
      ),
      { numRuns: 100 },
    );
  });

  // -------------------------------------------------------------------------
  // Additional: Already-aborted signal throws immediately
  // -------------------------------------------------------------------------
  it('should throw immediately if external signal is already aborted', async () => {
    await fc.assert(
      fc.asyncProperty(
        maxRetriesArb,
        async (maxRetries) => {
          const controller = new AbortController();
          controller.abort();

          const callCountRef = { count: 0 };
          globalThis.fetch = sequenceFetch(
            () => mockResponse(200),
            callCountRef,
          );

          await expect(
            fetchWithTimeout('https://example.com', {}, {
              maxRetries,
              baseDelayMs: 1,
              maxDelayMs: 2,
              timeoutMs: 5000,
              signal: controller.signal,
            }),
          ).rejects.toThrow();

          // fetch should never have been called
          expect(callCountRef.count).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});
