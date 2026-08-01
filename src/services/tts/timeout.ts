/**
 * Hard-deadline helpers shared by the browser-side TTS engines.
 *
 * Every TTS call has to be bounded. Headless runs (`npm run generate:video`)
 * wait for the narration step to publish its continue/skip CTA, so a socket
 * that never closes — or a SpeechSynthesis call that never reports back —
 * stalls the whole pipeline instead of falling through to the next engine.
 */

export interface TimeoutSignal {
  /** Pass to fetch(); aborts on our deadline or on caller cancellation. */
  readonly signal: AbortSignal;
  /** True when our own deadline fired, false for caller cancellation. */
  timedOut(): boolean;
  /** Clears the timer and detaches the caller-signal listener. */
  cleanup(): void;
}

/**
 * Derive an AbortSignal that fires after `timeoutMs`, or as soon as `external`
 * aborts. Prefer this over a bare `AbortSignal.timeout()` when a caller signal
 * also has to be honoured, since the two need to be combined and cleaned up.
 */
export function createTimeoutSignal(timeoutMs: number, external?: AbortSignal): TimeoutSignal {
  const controller = new AbortController();
  let timedOut = false;

  if (external?.aborted) {
    controller.abort(external.reason);
    return { signal: controller.signal, timedOut: () => false, cleanup: () => {} };
  }

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new DOMException(`Timed out after ${timeoutMs}ms`, 'TimeoutError'));
  }, timeoutMs);

  const onExternalAbort = () => controller.abort(external?.reason);
  external?.addEventListener('abort', onExternalAbort, { once: true });

  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    cleanup: () => {
      clearTimeout(timer);
      external?.removeEventListener('abort', onExternalAbort);
    },
  };
}

/** A promise that rejects as soon as `signal` aborts — for racing hung work. */
export function abortRejection(signal: AbortSignal): {
  promise: Promise<never>;
  dispose: () => void;
} {
  let onAbort = () => {};

  const promise = new Promise<never>((_, reject) => {
    onAbort = () => reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
  });

  return { promise, dispose: () => signal.removeEventListener('abort', onAbort) };
}

/** DOMException does not inherit from Error in every runtime — read `name` directly. */
function errorName(err: unknown): string | undefined {
  if (typeof err !== 'object' || err === null) return undefined;
  const name = (err as { name?: unknown }).name;
  return typeof name === 'string' ? name : undefined;
}

export function isAbortError(err: unknown): boolean {
  return errorName(err) === 'AbortError';
}

export function isTimeoutError(err: unknown): boolean {
  return errorName(err) === 'TimeoutError';
}

/**
 * Distinguish caller cancellation (must propagate) from an internal deadline
 * (must fall through to the next engine). Some runtimes drop the abort reason
 * and always surface `AbortError`, so the caller signal is the source of truth
 * whenever one was supplied.
 */
export function isCallerAbort(err: unknown, external?: AbortSignal): boolean {
  if (!isAbortError(err)) return false;
  return external ? external.aborted : true;
}
