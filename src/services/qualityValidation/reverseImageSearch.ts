export interface ReverseSearchResult {
  source: string;
  matchCount: number;
  originalSource: string | null;
  isStockPhoto: boolean;
  isUnique: boolean;
}

const STOCK_DOMAINS = [
  'shutterstock.com',
  'gettyimages.com',
  'istockphoto.com',
  '123rf.com',
  'dreamstime.com',
  'depositphotos.com',
  'alamy.com',
  'adobestock.com',
  'stock.adobe.com',
  'fotolia.com',
  'pond5.com',
  'envato.com',
  'freepik.com',
  'vecteezy.com',
  'stockvault.net',
  'pexels.com',
  'pixabay.com',
  'unsplash.com',
];

function isStockDomain(url: string): boolean {
  const lower = url.toLowerCase();
  return STOCK_DOMAINS.some(d => lower.includes(d));
}

export async function searchTinEye(
  imageUrl: string,
  signal?: AbortSignal,
): Promise<ReverseSearchResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  const onExternalAbort = () => controller.abort();
  if (signal) {
    signal.addEventListener('abort', onExternalAbort);
  }

  try {
    const searchUrl = `https://tineye.com/search/v1/result_json/?url=${encodeURIComponent(imageUrl)}&sort=crawl_date&order=asc`;

    const response = await fetch(searchUrl, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      return {
        source: 'TinEye',
        matchCount: 0,
        originalSource: null,
        isStockPhoto: false,
        isUnique: true,
      };
    }

    const data = await response.json() as {
      matches?: Array<{ domain?: string; url?: string; image_url?: string }>;
      total_results?: number;
    };

    const matchCount = data.total_results ?? data.matches?.length ?? 0;
    const matches = data.matches ?? [];

    let originalSource: string | null = null;
    let hasStockDomain = false;

    for (const match of matches) {
      const domain = match.domain || '';
      const matchUrl = match.url || match.image_url || '';
      if (isStockDomain(domain) || isStockDomain(matchUrl)) {
        hasStockDomain = true;
      }
      if (!originalSource && matchUrl) {
        originalSource = matchUrl;
      }
    }

    return {
      source: 'TinEye',
      matchCount,
      originalSource,
      isStockPhoto: hasStockDomain,
      isUnique: matchCount === 0,
    };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      if (signal?.aborted) throw err;
    }
    return {
      source: 'TinEye',
      matchCount: 0,
      originalSource: null,
      isStockPhoto: false,
      isUnique: true,
    };
  } finally {
    clearTimeout(timeoutId);
    if (signal) {
      signal.removeEventListener('abort', onExternalAbort);
    }
  }
}

export async function searchGoogleLens(
  imageUrl: string,
  signal?: AbortSignal,
): Promise<ReverseSearchResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  const onExternalAbort = () => controller.abort();
  if (signal) {
    signal.addEventListener('abort', onExternalAbort);
  }

  try {
    const searchUrl = `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(imageUrl)}`;

    const response = await fetch(searchUrl, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'Accept': 'text/html',
      },
    });

    if (!response.ok) {
      return {
        source: 'Google Lens',
        matchCount: 0,
        originalSource: null,
        isStockPhoto: false,
        isUnique: true,
      };
    }

    const html = await response.text();

    const urlMatches = html.match(/https?:\/\/[^\s"'<>]+/g) ?? [];
    const visualMatches = urlMatches.filter(u => {
      try {
        const hostname = new URL(u).hostname;
        return !hostname.includes('google.com') && !hostname.includes('gstatic.com');
      } catch {
        return false;
      }
    });

    const uniqueDomains = new Set<string>();
    let hasStockDomain = false;
    let originalSource: string | null = null;

    for (const matchUrl of visualMatches) {
      try {
        const hostname = new URL(matchUrl).hostname;
        uniqueDomains.add(hostname);
        if (isStockDomain(hostname)) {
          hasStockDomain = true;
        }
        if (!originalSource) {
          originalSource = matchUrl;
        }
      } catch {
        // skip invalid URLs
      }
    }

    const matchCount = uniqueDomains.size;

    return {
      source: 'Google Lens',
      matchCount,
      originalSource,
      isStockPhoto: hasStockDomain,
      isUnique: matchCount === 0,
    };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      if (signal?.aborted) throw err;
    }
    return {
      source: 'Google Lens',
      matchCount: 0,
      originalSource: null,
      isStockPhoto: false,
      isUnique: true,
    };
  } finally {
    clearTimeout(timeoutId);
    if (signal) {
      signal.removeEventListener('abort', onExternalAbort);
    }
  }
}

export async function verifyImageOriginality(
  imageUrl: string,
  signal?: AbortSignal,
): Promise<ReverseSearchResult> {
  const [tinEyeResult, googleLensResult] = await Promise.allSettled([
    searchTinEye(imageUrl, signal),
    searchGoogleLens(imageUrl, signal),
  ]);

  const results: ReverseSearchResult[] = [];

  if (tinEyeResult.status === 'fulfilled') {
    results.push(tinEyeResult.value);
  }
  if (googleLensResult.status === 'fulfilled') {
    results.push(googleLensResult.value);
  }

  if (results.length === 0) {
    return {
      source: 'None',
      matchCount: 0,
      originalSource: null,
      isStockPhoto: false,
      isUnique: true,
    };
  }

  const isStockPhoto = results.some(r => r.isStockPhoto);
  const totalMatches = results.reduce((sum, r) => sum + r.matchCount, 0);
  const originalSource = results.find(r => r.originalSource)?.originalSource ?? null;
  const bestSource = results.find(r => r.matchCount > 0)?.source ?? results[0].source;

  return {
    source: bestSource,
    matchCount: totalMatches,
    originalSource,
    isStockPhoto,
    isUnique: totalMatches === 0,
  };
}
