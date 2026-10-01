export interface ContentLengthResult {
  url: string;
  contentLength: number;
  contentType: string;
  isValid: boolean;
  reason?: string;
}

const DEFAULT_MIN_BYTES = 10240;
const DEFAULT_MAX_BYTES = 500 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 5000;
const MAX_REDIRECTS = 3;

export async function checkContentLength(
  url: string,
  options?: { minBytes?: number; maxBytes?: number; signal?: AbortSignal },
): Promise<ContentLengthResult> {
  const minBytes = options?.minBytes ?? DEFAULT_MIN_BYTES;
  const maxBytes = options?.maxBytes ?? DEFAULT_MAX_BYTES;

  let currentUrl = url;
  let redirectCount = 0;

  while (redirectCount <= MAX_REDIRECTS) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    const onExternalAbort = () => controller.abort();
    if (options?.signal) {
      options.signal.addEventListener('abort', onExternalAbort);
    }

    try {
      const response = await fetch(currentUrl, {
        method: 'HEAD',
        signal: controller.signal,
        redirect: 'manual',
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) {
          return {
            url,
            contentLength: -1,
            contentType: '',
            isValid: false,
            reason: `Redirect with no Location header (status ${response.status})`,
          };
        }
        currentUrl = new URL(location, currentUrl).href;
        redirectCount++;
        continue;
      }

      if (!response.ok) {
        return {
          url,
          contentLength: -1,
          contentType: '',
          isValid: false,
          reason: `HTTP ${response.status}`,
        };
      }

      const contentLengthHeader = response.headers.get('content-length');
      const contentLength = contentLengthHeader ? parseInt(contentLengthHeader, 10) : -1;
      const contentType = response.headers.get('content-type') || '';

      if (contentLength === -1 || isNaN(contentLength)) {
        return {
          url: currentUrl,
          contentLength: -1,
          contentType,
          isValid: false,
          reason: 'Content-Length header missing or invalid',
        };
      }

      if (contentLength < minBytes) {
        return {
          url: currentUrl,
          contentLength,
          contentType,
          isValid: false,
          reason: `Content too small: ${contentLength} bytes (min: ${minBytes})`,
        };
      }

      if (contentLength > maxBytes) {
        return {
          url: currentUrl,
          contentLength,
          contentType,
          isValid: false,
          reason: `Content too large: ${contentLength} bytes (max: ${maxBytes})`,
        };
      }

      return {
        url: currentUrl,
        contentLength,
        contentType,
        isValid: true,
      };
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        if (options?.signal?.aborted) {
          throw err;
        }
        return {
          url,
          contentLength: -1,
          contentType: '',
          isValid: false,
          reason: 'Request timed out',
        };
      }
      return {
        url,
        contentLength: -1,
        contentType: '',
        isValid: false,
        reason: err instanceof Error ? err.message : 'Unknown error',
      };
    } finally {
      clearTimeout(timeoutId);
      if (options?.signal) {
        options.signal.removeEventListener('abort', onExternalAbort);
      }
    }
  }

  return {
    url,
    contentLength: -1,
    contentType: '',
    isValid: false,
    reason: `Too many redirects (max: ${MAX_REDIRECTS})`,
  };
}
