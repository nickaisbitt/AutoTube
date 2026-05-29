/**
 * Property-Based Test — API Error Response Structure
 *
 * Feature: codebase-refactor, Property 1: API error responses are structured JSON
 *
 * For any API route handler and for any error condition (invalid input,
 * upstream failure, internal error), the response SHALL be a JSON object
 * containing at minimum `{ error: string }` with an HTTP status code in
 * the 4xx or 5xx range.
 *
 * Validates: Requirements 1.5
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type { IncomingMessage, ServerResponse } from 'http';
import { errorHandler } from '../middleware/errorHandler';

/**
 * Creates a mock ServerResponse that captures status code, headers, and body.
 */
function createMockResponse() {
  let statusCode = 200;
  const headers: Record<string, string> = {};
  let body = '';

  const res = {
    get statusCode() {
      return statusCode;
    },
    set statusCode(code: number) {
      statusCode = code;
    },
    setHeader(name: string, value: string) {
      headers[name.toLowerCase()] = value;
    },
    end(data?: string) {
      if (data) body = data;
    },
    getHeaders: () => headers,
    getBody: () => body,
  } as unknown as ServerResponse & { getHeaders: () => Record<string, string>; getBody: () => string };

  return res;
}

/**
 * Creates a minimal mock IncomingMessage.
 */
function createMockRequest(): IncomingMessage {
  return {} as IncomingMessage;
}

describe('Feature: codebase-refactor, Property 1: API error responses are structured JSON', () => {
  /**
   * **Validates: Requirements 1.5**
   *
   * Property: For any Error with a generic message, errorHandler defaults to status 500.
   */
  it('defaults to status code 500 for generic errors', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        (errorMessage) => {
          // Avoid messages that would trigger special status codes
          const safeMessage = errorMessage
            .replace(/validation|bad request/i, 'problem')
            .replace(/not found/i, 'missing')
            .replace(/unauthorized/i, 'forbidden');
          const err = new Error(safeMessage);
          const req = createMockRequest();
          const res = createMockResponse();
          const next = () => {};

          errorHandler(err, req, res, next);

          expect(res.statusCode).toBe(500);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 1.5**
   *
   * Property: Error messages containing "validation" or "bad request" get status 400.
   */
  it('sets status 400 for validation errors', () => {
    const err = new Error('Validation failed: bad request');
    const req = createMockRequest();
    const res = createMockResponse();
    const next = () => {};

    errorHandler(err, req, res, next);

    expect(res.statusCode).toBe(400);
  });

  /**
   * **Validates: Requirements 1.5**
   *
   * Property: Error messages containing "not found" get status 404.
   */
  it('sets status 404 for not found errors', () => {
    const err = new Error('Resource not found');
    const req = createMockRequest();
    const res = createMockResponse();
    const next = () => {};

    errorHandler(err, req, res, next);

    expect(res.statusCode).toBe(404);
  });

  /**
   * **Validates: Requirements 1.5**
   *
   * Property: Error messages containing "unauthorized" get status 401.
   */
  it('sets status 401 for unauthorized errors', () => {
    const err = new Error('User unauthorized');
    const req = createMockRequest();
    const res = createMockResponse();
    const next = () => {};

    errorHandler(err, req, res, next);

    expect(res.statusCode).toBe(401);
  });

  /**
   * **Validates: Requirements 1.5**
   *
   * Property: For any Error, errorHandler sets Content-Type to application/json.
   */
  it('always sets Content-Type to application/json', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        (errorMessage) => {
          const err = new Error(errorMessage);
          const req = createMockRequest();
          const res = createMockResponse();
          const next = () => {};

          errorHandler(err, req, res, next);

          const headers = (res as unknown as { getHeaders: () => Record<string, string> }).getHeaders();
          expect(headers['content-type']).toBe('application/json');
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 1.5**
   *
   * Property: For any Error with any message, the response body is valid JSON
   * containing an `error` field that is a non-empty string.
   */
  it('always returns a JSON body with a non-empty error field', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        (errorMessage) => {
          const err = new Error(errorMessage);
          const req = createMockRequest();
          const res = createMockResponse();
          const next = () => {};

          errorHandler(err, req, res, next);

          const body = (res as unknown as { getBody: () => string }).getBody();

          // Body must be valid JSON
          let parsed: unknown;
          expect(() => {
            parsed = JSON.parse(body);
          }).not.toThrow();

          // Must have an `error` field that is a non-empty string
          expect(parsed).toHaveProperty('error');
          expect(typeof (parsed as Record<string, unknown>).error).toBe('string');
          expect(((parsed as Record<string, unknown>).error as string).length).toBeGreaterThan(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 1.5**
   *
   * Property: For any arbitrary error object (including those with empty messages),
   * the response is still valid structured JSON with a non-empty error string.
   */
  it('handles errors with empty or missing messages gracefully', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant(''),
          fc.string(),
        ),
        (errorMessage) => {
          const err = new Error(errorMessage);
          const req = createMockRequest();
          const res = createMockResponse();
          const next = () => {};

          errorHandler(err, req, res, next);

          const body = (res as unknown as { getBody: () => string }).getBody();

          // Body must always be valid JSON
          let parsed: unknown;
          expect(() => {
            parsed = JSON.parse(body);
          }).not.toThrow();

          // Must have an `error` field that is a non-empty string
          expect(parsed).toHaveProperty('error');
          expect(typeof (parsed as Record<string, unknown>).error).toBe('string');
          expect(((parsed as Record<string, unknown>).error as string).length).toBeGreaterThan(0);

          // Status code must be in 4xx or 5xx range
          expect(res.statusCode).toBeGreaterThanOrEqual(400);
          expect(res.statusCode).toBeLessThan(600);
        },
      ),
      { numRuns: 100 },
    );
  });
});
