const CF_CHALLENGE_INDICATORS = [
  'cf-challenge',
  'challenge-platform',
  'cf-browser-verification',
  'cdn-cgi/challenge-platform',
  'cf-turnstile',
  '_cf_chl',
];

const CF_SERVER_INDICATORS = ['cloudflare'];

export function detectCloudflareChallenge(response: Response): boolean {
  const status = response.status;
  if (status !== 403 && status !== 503) return false;

  const serverHeader = response.headers.get('server') || '';
  const hasCfServer = CF_SERVER_INDICATORS.some((indicator) =>
    serverHeader.toLowerCase().includes(indicator),
  );

  if (!hasCfServer) return false;

  return true;
}

export async function detectCloudflareChallengeWithBody(
  response: Response,
): Promise<boolean> {
  const status = response.status;
  if (status !== 403 && status !== 503) return false;

  const serverHeader = response.headers.get('server') || '';
  const hasCfServer = CF_SERVER_INDICATORS.some((indicator) =>
    serverHeader.toLowerCase().includes(indicator),
  );

  if (!hasCfServer) return false;

  const cloned = response.clone();
  const body = await cloned.text();

  return CF_CHALLENGE_INDICATORS.some((indicator) => body.includes(indicator));
}

export function extractCfClearance(cookies: string[]): string | null {
  for (const cookie of cookies) {
    const parts = cookie.split(';');
    for (const part of parts) {
      const trimmed = part.trim();
      if (trimmed.startsWith('cf_clearance=')) {
        const value = trimmed.slice('cf_clearance='.length);
        return value || null;
      }
    }
  }
  return null;
}

export function isCloudflareProtected(headers: Headers): boolean {
  const server = headers.get('server') || '';
  if (CF_SERVER_INDICATORS.some((ind) => server.toLowerCase().includes(ind))) {
    return true;
  }

  const cfRay = headers.get('cf-ray');
  if (cfRay) return true;

  const cfCacheStatus = headers.get('cf-cache-status');
  if (cfCacheStatus) return true;

  return false;
}

export async function waitForCfChallenge(
  url: string,
  maxAttempts: number = 5,
): Promise<{ cookies: string; cfClearance: string | null }> {
  const allCookies: string[] = [];
  let cfClearance: string | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
    await new Promise((resolve) => setTimeout(resolve, delay));

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(15000),
      });

      const setCookieHeaders = response.headers.getSetCookie?.() || [];
      allCookies.push(...setCookieHeaders);

      cfClearance = extractCfClearance(allCookies);
      if (cfClearance) {
        break;
      }

      if (response.ok && !detectCloudflareChallenge(response)) {
        break;
      }
    } catch {
      continue;
    }
  }

  return {
    cookies: allCookies.join('; '),
    cfClearance,
  };
}
