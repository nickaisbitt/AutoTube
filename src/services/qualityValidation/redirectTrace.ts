export interface RedirectTraceResult {
  originalUrl: string;
  finalUrl: string;
  hops: string[];
  isBlocked: boolean;
  blockedDomain: string | null;
  isSafe: boolean;
}

const DEFAULT_MAX_HOPS = 5;

export function isDomainBlocked(url: string, blocklist: string[]): boolean {
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return false;
  }

  for (const pattern of blocklist) {
    if (pattern.startsWith('*.')) {
      const suffix = pattern.slice(2);
      if (hostname === suffix || hostname.endsWith('.' + suffix)) {
        return true;
      }
    } else if (pattern.startsWith('.')) {
      if (hostname.endsWith(pattern)) {
        return true;
      }
    } else {
      if (hostname === pattern || hostname.endsWith('.' + pattern)) {
        return true;
      }
    }
  }

  return false;
}

export async function traceRedirects(
  url: string,
  blocklist: string[],
  options?: { maxHops?: number; signal?: AbortSignal },
): Promise<RedirectTraceResult> {
  const maxHops = options?.maxHops ?? DEFAULT_MAX_HOPS;
  const hops: string[] = [url];
  let currentUrl = url;

  if (isDomainBlocked(url, blocklist)) {
    return {
      originalUrl: url,
      finalUrl: url,
      hops,
      isBlocked: true,
      blockedDomain: extractHostname(url),
      isSafe: false,
    };
  }

  for (let i = 0; i < maxHops; i++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

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
          break;
        }

        const nextUrl = new URL(location, currentUrl).href;
        hops.push(nextUrl);
        currentUrl = nextUrl;

        if (isDomainBlocked(currentUrl, blocklist)) {
          return {
            originalUrl: url,
            finalUrl: currentUrl,
            hops,
            isBlocked: true,
            blockedDomain: extractHostname(currentUrl),
            isSafe: false,
          };
        }

        continue;
      }

      break;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        if (options?.signal?.aborted) throw err;
      }
      break;
    } finally {
      clearTimeout(timeoutId);
      if (options?.signal) {
        options.signal.removeEventListener('abort', onExternalAbort);
      }
    }
  }

  const finalBlocked = isDomainBlocked(currentUrl, blocklist);

  return {
    originalUrl: url,
    finalUrl: currentUrl,
    hops,
    isBlocked: finalBlocked,
    blockedDomain: finalBlocked ? extractHostname(currentUrl) : null,
    isSafe: !finalBlocked,
  };
}

function extractHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}
