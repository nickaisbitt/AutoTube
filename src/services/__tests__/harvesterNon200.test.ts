// Feature: codebase-robustness-audit, Property 13: Harvester returns empty array on non-200
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';

/**
 * **Validates: Requirements 16.4**
 *
 * Property 13: Harvester returns empty array on non-200
 *
 * For any non-200 HTTP response from any image provider (DDG, Wikimedia,
 * Unsplash, Serper, Firecrawl), the corresponding search function
 * SHALL return an empty array without throwing.
 */

// ---------------------------------------------------------------------------
// Mocks — must be declared before imports that use them
// ---------------------------------------------------------------------------

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), success: vi.fn() },
}));

// Mock fetchWithTimeout so we can control the HTTP response
vi.mock('../../utils/fetchWithTimeout', () => ({
  fetchWithTimeout: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { searchDDGLocal, searchWikimedia } from '../media';
import { fetchWithTimeout } from '../../utils/fetchWithTimeout';

const mockedFetchWithTimeout = vi.mocked(fetchWithTimeout);

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Arbitrary non-200 HTTP status codes in the 400-599 range */
const non200StatusArb = fc.integer({ min: 400, max: 599 });

/** Arbitrary non-empty query strings (1-50 chars) */
const queryArb = fc.string({ minLength: 1, maxLength: 50 });

/** Arbitrary network/timeout error messages */
const errorMessageArb = fc.constantFrom(
  'Failed to fetch',
  'Network request failed',
  'The operation was aborted.',
  'ETIMEDOUT',
  'ECONNREFUSED',
  'ERR_CONNECTION_RESET',
  'socket hang up',
);

/** Arbitrary error types that fetchWithTimeout might throw */
const networkErrorArb = errorMessageArb.map((msg) => new TypeError(msg));

const abortErrorArb = fc.constant(
  new DOMException('The operation was aborted.', 'AbortError'),
);

const genericErrorArb = errorMessageArb.map((msg) => new Error(msg));

const throwableErrorArb = fc.oneof(networkErrorArb, abortErrorArb, genericErrorArb);

// ---------------------------------------------------------------------------
// Helper: create a mock Response with the given status
// ---------------------------------------------------------------------------

function mockResponse(status: number): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: `Status ${status}`,
    json: async () => ({}),
    text: async () => '',
    headers: new Headers(),
  } as unknown as Response;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Property 13: Harvester returns empty array on non-200', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // Sub-property 1: searchDDGLocal returns [] on non-200 status
  // -----------------------------------------------------------------------
  it('searchDDGLocal returns empty array for any non-200 HTTP status', async () => {
    await fc.assert(
      fc.asyncProperty(non200StatusArb, queryArb, async (status, query) => {
        mockedFetchWithTimeout.mockResolvedValue(mockResponse(status));

        const result = await searchDDGLocal(query);

        expect(result).toEqual([]);
        expect(Array.isArray(result)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  // -----------------------------------------------------------------------
  // Sub-property 2: searchWikimedia returns [] on non-200 status
  // -----------------------------------------------------------------------
  it('searchWikimedia returns empty array for any non-200 HTTP status', async () => {
    await fc.assert(
      fc.asyncProperty(non200StatusArb, queryArb, async (status, query) => {
        mockedFetchWithTimeout.mockResolvedValue(mockResponse(status));

        const result = await searchWikimedia(query);

        expect(result).toEqual([]);
        expect(Array.isArray(result)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  // -----------------------------------------------------------------------
  // Sub-property 3: searchDDGLocal returns [] when fetchWithTimeout throws
  // -----------------------------------------------------------------------
  it('searchDDGLocal returns empty array when fetchWithTimeout throws any error', async () => {
    await fc.assert(
      fc.asyncProperty(throwableErrorArb, queryArb, async (error, query) => {
        mockedFetchWithTimeout.mockRejectedValue(error);

        const result = await searchDDGLocal(query);

        expect(result).toEqual([]);
        expect(Array.isArray(result)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  // -----------------------------------------------------------------------
  // Sub-property 4: searchWikimedia returns [] when fetchWithTimeout throws
  // -----------------------------------------------------------------------
  it('searchWikimedia returns empty array when fetchWithTimeout throws any error', async () => {
    await fc.assert(
      fc.asyncProperty(throwableErrorArb, queryArb, async (error, query) => {
        mockedFetchWithTimeout.mockRejectedValue(error);

        const result = await searchWikimedia(query);

        expect(result).toEqual([]);
        expect(Array.isArray(result)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});
