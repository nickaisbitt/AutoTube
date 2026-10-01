import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withRetry } from '../withRetry';
import { isServiceError } from '../errors';

describe('withRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ---------------------------------------------------------------------------
  // Successful execution (no retries needed)
  // ---------------------------------------------------------------------------

  it('should return the result on first successful call', async () => {
    const fn = vi.fn().mockResolvedValue('success');

    const result = await withRetry(fn, { maxRetries: 3, backoff: 'linear' });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  // ---------------------------------------------------------------------------
  // Retry on failure with correct retry count
  // ---------------------------------------------------------------------------

  it('should retry the correct number of times before exhausting', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'));

    const promise = withRetry(fn, { maxRetries: 3, backoff: 'linear', baseDelayMs: 100 });

    // Catch the expected rejection to prevent unhandled rejection
    const caught = promise.catch((e) => e);

    // Advance through all retry delays
    await vi.advanceTimersByTimeAsync(100); // delay before retry 1
    await vi.advanceTimersByTimeAsync(200); // delay before retry 2
    await vi.advanceTimersByTimeAsync(300); // delay before retry 3

    const err = await caught;
    expect(isServiceError(err)).toBe(true);
    // Initial attempt + 3 retries = 4 total calls
    expect(fn).toHaveBeenCalledTimes(4);
  });

  it('should succeed if a retry attempt succeeds', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValue('recovered');

    const promise = withRetry(fn, { maxRetries: 3, backoff: 'linear', baseDelayMs: 100 });

    // Advance through delays for the first two retries
    await vi.advanceTimersByTimeAsync(100); // delay before retry 1
    await vi.advanceTimersByTimeAsync(200); // delay before retry 2

    const result = await promise;
    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  // ---------------------------------------------------------------------------
  // Linear backoff timing verification
  // ---------------------------------------------------------------------------

  it('should use linear backoff: delay = baseDelayMs * attempt', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'));
    const baseDelayMs = 100;

    const promise = withRetry(fn, { maxRetries: 3, backoff: 'linear', baseDelayMs });
    const caught = promise.catch((e) => e);

    // After initial failure, delay should be 100ms (baseDelayMs * 1)
    await vi.advanceTimersByTimeAsync(99);
    expect(fn).toHaveBeenCalledTimes(1); // still waiting
    await vi.advanceTimersByTimeAsync(1);
    // Now retry 1 fires, fails, then waits 200ms (baseDelayMs * 2)
    expect(fn).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(199);
    expect(fn).toHaveBeenCalledTimes(2); // still waiting
    await vi.advanceTimersByTimeAsync(1);
    expect(fn).toHaveBeenCalledTimes(3);

    // Wait 300ms (baseDelayMs * 3) for the third retry
    await vi.advanceTimersByTimeAsync(299);
    expect(fn).toHaveBeenCalledTimes(3); // still waiting
    await vi.advanceTimersByTimeAsync(1);
    expect(fn).toHaveBeenCalledTimes(4);

    const err = await caught;
    expect(isServiceError(err)).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Exponential backoff timing verification
  // ---------------------------------------------------------------------------

  it('should use exponential backoff: delay = baseDelayMs * 2^(attempt-1)', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'));
    const baseDelayMs = 100;

    const promise = withRetry(fn, { maxRetries: 3, backoff: 'exponential', baseDelayMs });
    const caught = promise.catch((e) => e);

    // After initial failure, delay should be 100ms (100 * 2^0)
    await vi.advanceTimersByTimeAsync(99);
    expect(fn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fn).toHaveBeenCalledTimes(2);

    // After retry 1 failure, delay should be 200ms (100 * 2^1)
    await vi.advanceTimersByTimeAsync(199);
    expect(fn).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(fn).toHaveBeenCalledTimes(3);

    // After retry 2 failure, delay should be 400ms (100 * 2^2)
    await vi.advanceTimersByTimeAsync(399);
    expect(fn).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(1);
    expect(fn).toHaveBeenCalledTimes(4);

    const err = await caught;
    expect(isServiceError(err)).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // AbortSignal cancellation during wait
  // ---------------------------------------------------------------------------

  it('should abort immediately if signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    const fn = vi.fn().mockResolvedValue('should not reach');

    await expect(
      withRetry(fn, { maxRetries: 3, backoff: 'linear', signal: controller.signal }),
    ).rejects.toThrow();

    expect(fn).toHaveBeenCalledTimes(0);
  });

  it('should abort during retry wait when signal is aborted', async () => {
    const controller = new AbortController();
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('recovered');

    const promise = withRetry(fn, {
      maxRetries: 3,
      backoff: 'linear',
      baseDelayMs: 5000,
      signal: controller.signal,
    });
    const caught = promise.catch((e) => e);

    // Advance partially into the wait, then abort
    await vi.advanceTimersByTimeAsync(1000);
    controller.abort();
    await vi.advanceTimersByTimeAsync(0); // flush microtasks

    const err = await caught;
    expect(err).toBeDefined();
    // Only the initial attempt should have been made
    expect(fn).toHaveBeenCalledTimes(1);
  });

  // ---------------------------------------------------------------------------
  // onRetry callback invocation
  // ---------------------------------------------------------------------------

  it('should call onRetry before each retry attempt with correct args', async () => {
    const onRetry = vi.fn();
    const errors = [new Error('err1'), new Error('err2')];
    const fn = vi.fn()
      .mockRejectedValueOnce(errors[0])
      .mockRejectedValueOnce(errors[1])
      .mockResolvedValue('done');

    const promise = withRetry(fn, {
      maxRetries: 3,
      backoff: 'linear',
      baseDelayMs: 100,
      onRetry,
    });

    await vi.advanceTimersByTimeAsync(100); // first retry delay
    await vi.advanceTimersByTimeAsync(200); // second retry delay

    const result = await promise;
    expect(result).toBe('done');

    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenNthCalledWith(1, 1, errors[0]);
    expect(onRetry).toHaveBeenNthCalledWith(2, 2, errors[1]);
  });

  // ---------------------------------------------------------------------------
  // ServiceError thrown when all retries exhausted
  // ---------------------------------------------------------------------------

  it('should throw a ServiceError when all retries are exhausted', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('persistent failure'));

    const promise = withRetry(fn, { maxRetries: 2, backoff: 'linear', baseDelayMs: 10 });
    const caught = promise.catch((e) => e);

    await vi.advanceTimersByTimeAsync(10);  // retry 1 delay
    await vi.advanceTimersByTimeAsync(20);  // retry 2 delay

    const err = await caught;
    expect(isServiceError(err)).toBe(true);
    if (isServiceError(err)) {
      expect(err.code).toBe('RETRY_EXHAUSTED');
      expect(err.message).toContain('persistent failure');
      expect(err.retryable).toBe(false);
      expect(err.attempts).toBe(3); // initial + 2 retries
      expect(err.originalError).toBeInstanceOf(Error);
    }
  });

  // ---------------------------------------------------------------------------
  // Default baseDelayMs
  // ---------------------------------------------------------------------------

  it('should default baseDelayMs to 1000 when not specified', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('ok');

    const promise = withRetry(fn, { maxRetries: 1, backoff: 'linear' });

    // Default baseDelayMs is 1000, linear attempt 1 → 1000ms
    await vi.advanceTimersByTimeAsync(999);
    expect(fn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);

    const result = await promise;
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
