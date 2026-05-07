/**
 * Centralized fetch wrapper with per-attempt timeout, exponential backoff
 * retry, and external AbortSignal support.
 *
 * Replaces the three separate `fetchWithRetry` implementations in llm.ts,
 * tts.ts, and llmVisualDirector.ts with a single configurable function.
 */

export interface FetchWithTimeoutOptions {
  /** Per-attempt timeout in milliseconds. Default: 30000 */
  timeoutMs?: number;
  /** Maximum retry attempts. Default: 3 */
  maxRetries?: number;
  /** Base delay for exponential backoff in ms. Default: 1000 */
  baseDelayMs?: number;
  /** Maximum backoff delay in ms. Default: 10000 */
  maxDelayMs?: number;
  /** External AbortSignal for cancellation. */
  signal?: AbortSignal;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 1_000;
const DEFAULT_MAX_DELAY_MS = 10_000;

/**
 * Returns true when the status code should trigger a retry (429 or 5xx).
 */
function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/**
 * Returns true for 4xx client errors that should NOT be retried (all 4xx
 * except 429).
 */
function isNonRetryableClientError(status: number): boolean {
  return status >= 400 && status < 500 && status !== 429;
}

/**
 * Compute the backoff delay for a given attempt (1-indexed).
 * Formula: min(baseDelayMs * 2^(attempt-1), maxDelayMs)
 */
function computeBackoff(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
): number {
  return Math.min(baseDelayMs * Math.pow(2, attempt - 1), maxDelayMs);
}

/**
 * Fetch with per-attempt timeout, exponential backoff retry, and
 * external AbortSignal support.
 *
 * - Retries on 429 and 5xx responses.
 * - Does NOT retry on 4xx client errors (except 429) — throws immediately.
 * - Each attempt gets its own AbortController with the configured timeout.
 * - If the external signal is aborted, all retries stop immediately.
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  config?: FetchWithTimeoutOptions,
): Promise<Response> {
  const timeoutMs = config?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = config?.maxRetries ?? DEFAULT_MAX_RETRIES;
  const baseDelayMs = config?.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const maxDelayMs = config?.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const externalSignal = config?.signal;

  // If the external signal is already aborted, bail immediately.
  if (externalSignal?.aborted) {
    throw externalSignal.reason ?? new DOMException('The operation was aborted.', 'AbortError');
  }

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    // Check external signal before each attempt.
    if (externalSignal?.aborted) {
      throw externalSignal.reason ?? new DOMException('The operation was aborted.', 'AbortError');
    }

    const attemptController = new AbortController();

    // Set up per-attempt timeout.
    const timeoutId = setTimeout(() => attemptController.abort(), timeoutMs);

    // Link external signal to per-attempt controller.
    const onExternalAbort = () => attemptController.abort();
    if (externalSignal) {
      externalSignal.addEventListener('abort', onExternalAbort);
    }

    try {
      const response = await fetch(url, {
        ...options,
        signal: attemptController.signal,
      });

      // Non-retryable 4xx client error — throw immediately.
      if (isNonRetryableClientError(response.status)) {
        const errText = await response.text().catch(() => '');
        throw new Error(`HTTP ${response.status}: ${errText}`);
      }

      // Retryable status (429 or 5xx) — wait and retry.
      if (isRetryableStatus(response.status)) {
        lastError = new Error(`HTTP ${response.status}`);
        if (attempt < maxRetries) {
          const delay = computeBackoff(attempt, baseDelayMs, maxDelayMs);
          await new Promise((r) => setTimeout(r, delay));
        }
        continue;
      }

      // Success — return the response.
      return response;
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));

      // If the external signal caused the abort, propagate immediately
      // without retrying.
      if (externalSignal?.aborted) {
        throw externalSignal.reason ?? new DOMException('The operation was aborted.', 'AbortError');
      }

      // Non-retryable client errors thrown above — propagate immediately.
      if (error.message.startsWith('HTTP 4')) {
        throw error;
      }

      lastError = error;

      // Network errors (TypeError) and timeout aborts — retry with backoff.
      if (attempt < maxRetries) {
        const delay = computeBackoff(attempt, baseDelayMs, maxDelayMs);
        await new Promise((r) => setTimeout(r, delay));
      }
    } finally {
      // Clean up timeout and external signal listener after each attempt.
      clearTimeout(timeoutId);
      if (externalSignal) {
        externalSignal.removeEventListener('abort', onExternalAbort);
      }
    }
  }

  throw lastError ?? new Error('All retry attempts failed');
}
