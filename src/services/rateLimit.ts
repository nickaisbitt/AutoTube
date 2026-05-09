/**
 * Rate limit detection utility.
 * Wraps fetch calls to detect 429 responses and report to the UI.
 */

export interface RateLimitCallback {
  (endpoint: 'render' | 'tts', retryAfterMs: number): void;
}

let rateLimitCallback: RateLimitCallback | null = null;

export function setRateLimitCallback(cb: RateLimitCallback | null): void {
  rateLimitCallback = cb;
}

export function isRateLimited(response: Response): boolean {
  if (response.status !== 429) return false;

  const retryAfter = response.headers.get('Retry-After');
  const retryAfterMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 60000;

  const url = response.url;
  const endpoint: 'render' | 'tts' = url.includes('render') ? 'render' : 'tts';

  if (rateLimitCallback) {
    rateLimitCallback(endpoint, retryAfterMs);
  }

  return true;
}

export async function fetchWithRateLimit(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response | null> {
  try {
    const response = await fetch(input, init);
    if (isRateLimited(response)) {
      return null;
    }
    return response;
  } catch (err) {
    console.warn('Rate limit fetch failed:', (err as Error).message);
    return null;
  }
}
