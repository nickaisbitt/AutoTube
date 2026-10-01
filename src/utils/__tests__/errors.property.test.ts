/**
 * Property-Based Test — Service Error Type Consistency
 *
 * Feature: codebase-refactor, Property 3: Service error type consistency
 *
 * For any service function that fails (either by exhausting retries or
 * encountering a non-retryable error), the resulting error SHALL be a
 * `ServiceError` object containing a non-empty `code`, a non-empty `message`,
 * and a boolean `retryable` field.
 *
 * Validates: Requirements 6.2, 10.4
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { createServiceError, isServiceError, ServiceError } from '../errors';
import { withRetry } from '../withRetry';

describe('Feature: codebase-refactor, Property 3: Service error type consistency', () => {
  /**
   * **Validates: Requirements 6.2, 10.4**
   *
   * Property: createServiceError always produces an object that passes isServiceError.
   */
  it('createServiceError always produces a valid ServiceError', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        fc.boolean(),
        fc.option(fc.anything(), { nil: undefined }),
        fc.option(fc.nat(), { nil: undefined }),
        (code, message, retryable, originalError, attempts) => {
          const err = createServiceError(code, message, {
            retryable,
            originalError,
            attempts,
          });

          expect(isServiceError(err)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 6.2, 10.4**
   *
   * Property: The `code` field is always a non-empty string.
   */
  it('code field is always a non-empty string', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        fc.boolean(),
        (code, message, retryable) => {
          const err = createServiceError(code, message, { retryable });

          expect(typeof err.code).toBe('string');
          expect(err.code.length).toBeGreaterThan(0);
          expect(err.code).toBe(code);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 6.2, 10.4**
   *
   * Property: The `message` field is always a non-empty string.
   */
  it('message field is always a non-empty string', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        fc.boolean(),
        (code, message, retryable) => {
          const err = createServiceError(code, message, { retryable });

          expect(typeof err.message).toBe('string');
          expect(err.message.length).toBeGreaterThan(0);
          expect(err.message).toBe(message);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 6.2, 10.4**
   *
   * Property: The `retryable` field is always a boolean.
   */
  it('retryable field is always a boolean', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        fc.boolean(),
        (code, message, retryable) => {
          const err = createServiceError(code, message, { retryable });

          expect(typeof err.retryable).toBe('boolean');
          expect(err.retryable).toBe(retryable);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 6.2, 10.4**
   *
   * Property: withRetry always throws a ServiceError when all retries are exhausted.
   */
  it('withRetry throws a ServiceError when all retries are exhausted', () => {
    fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 4 }),
        fc.string({ minLength: 1 }),
        async (maxRetries, errorMessage) => {
          const alwaysFails = () => Promise.reject(new Error(errorMessage));

          let caughtError: unknown;
          try {
            await withRetry(alwaysFails, {
              maxRetries,
              backoff: 'linear',
              baseDelayMs: 1,
            });
          } catch (err) {
            caughtError = err;
          }

          expect(caughtError).toBeDefined();
          expect(isServiceError(caughtError)).toBe(true);

          const serviceErr = caughtError as ServiceError;
          expect(typeof serviceErr.code).toBe('string');
          expect(serviceErr.code.length).toBeGreaterThan(0);
          expect(typeof serviceErr.message).toBe('string');
          expect(serviceErr.message.length).toBeGreaterThan(0);
          expect(typeof serviceErr.retryable).toBe('boolean');
          expect(serviceErr.retryable).toBe(false);
          expect(serviceErr.attempts).toBe(maxRetries + 1);
        },
      ),
      { numRuns: 100 },
    );
  });
});
