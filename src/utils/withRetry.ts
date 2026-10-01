/**
 * Generic retry utility with configurable backoff and abort support.
 *
 * Replaces all ad-hoc retry loops across the codebase with a single,
 * consistent implementation. Supports linear and exponential backoff
 * strategies and integrates with AbortSignal for cancellation.
 */

import { createServiceError } from './errors';

export interface RetryOptions {
  /** Maximum number of retry attempts (does not count the initial attempt) */
  maxRetries: number;
  /** Backoff strategy: linear multiplies baseDelay by attempt, exponential doubles each time */
  backoff: 'linear' | 'exponential';
  /** Base delay in milliseconds (default: 1000) */
  baseDelayMs?: number;
  /** Optional AbortSignal to cancel during retry waits */
  signal?: AbortSignal;
  /** Callback invoked before each retry attempt */
  onRetry?: (attempt: number, error: unknown) => void;
}

/**
 * Compute the delay for a given attempt based on the backoff strategy.
 *
 * - linear: baseDelayMs * attempt (1-indexed)
 * - exponential: baseDelayMs * 2^(attempt - 1)
 */
function computeDelay(
  attempt: number,
  backoff: 'linear' | 'exponential',
  baseDelayMs: number,
): number {
  if (backoff === 'linear') {
    return baseDelayMs * attempt;
  }
  // exponential: 2^(attempt-1) * baseDelayMs → 1x, 2x, 4x, ...
  return baseDelayMs * Math.pow(2, attempt - 1);
}

/**
 * Sleep for the given duration, but reject immediately if the signal is aborted.
 */
function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
  }

  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);

    if (signal) {
      const onAbort = () => {
        clearTimeout(timer);
        reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
      };

      signal.addEventListener('abort', onAbort, { once: true });

      // Clean up the listener when the timer fires normally
      const originalResolve = resolve;
      const wrappedResolve = () => {
        signal.removeEventListener('abort', onAbort);
        originalResolve();
      };
      clearTimeout(timer);
      const newTimer = setTimeout(wrappedResolve, ms);

      // If signal aborts, clear the new timer too
      signal.addEventListener(
        'abort',
        () => clearTimeout(newTimer),
        { once: true },
      );
    }
  });
}

/**
 * Execute an async function with retry logic.
 *
 * 1. Calls `fn()` and returns its result on success.
 * 2. On failure, checks if retries remain.
 * 3. Waits the appropriate backoff delay (abortable via signal).
 * 4. Calls `onRetry` callback before each retry attempt.
 * 5. After all retries exhausted, throws a ServiceError.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const {
    maxRetries,
    backoff,
    baseDelayMs = 1000,
    signal,
    onRetry,
  } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Check abort before each attempt
    if (signal?.aborted) {
      throw signal.reason ?? new DOMException('Aborted', 'AbortError');
    }

    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // If this was the last attempt, break out to throw
      if (attempt >= maxRetries) {
        break;
      }

      // Wait with backoff before retrying
      const delay = computeDelay(attempt + 1, backoff, baseDelayMs);
      await abortableSleep(delay, signal);

      // Notify caller about the retry
      if (onRetry) {
        onRetry(attempt + 1, error);
      }
    }
  }

  // All retries exhausted — throw a ServiceError
  const errorMessage =
    lastError instanceof Error ? lastError.message : String(lastError);

  throw createServiceError('RETRY_EXHAUSTED', `All ${maxRetries + 1} attempts failed: ${errorMessage}`, {
    originalError: lastError,
    retryable: false,
    attempts: maxRetries + 1,
  });
}
