import { lookup } from 'node:dns/promises';

export const DOH_PROVIDERS = [
  { name: 'Cloudflare', url: 'https://cloudflare-dns.com/dns-query' },
  { name: 'Google', url: 'https://dns.google/resolve' },
  { name: 'Quad9', url: 'https://dns.quad9.net:5053/dns-query' },
  { name: 'CleanBrowsing', url: 'https://doh.cleanbrowsing.org/doh/family-filter/resolve' },
] as const;

interface DohAnswer {
  type: number;
  data: string;
}

interface DohResponse {
  Answer?: DohAnswer[];
}

interface CacheEntry {
  ips: string[];
  expiresAt: number;
}

const DNS_RECORD_TYPES: Record<string, number> = {
  A: 1,
  AAAA: 28,
};

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, CacheEntry>();

function getCacheKey(domain: string, type: string): string {
  return `${type}:${domain}`;
}

function getCached(domain: string, type: string): string[] | null {
  const key = getCacheKey(domain, type);
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.ips;
}

function setCache(domain: string, type: string, ips: string[]): void {
  const key = getCacheKey(domain, type);
  cache.set(key, {
    ips,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

function shuffleArray<T>(arr: T[]): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export async function resolveDoh(
  domain: string,
  type: 'A' | 'AAAA' = 'A',
): Promise<string[]> {
  const cached = getCached(domain, type);
  if (cached) return cached;

  const providers = shuffleArray([...DOH_PROVIDERS]);
  const recordTypeNum = DNS_RECORD_TYPES[type];

  for (const provider of providers) {
    try {
      const url = `${provider.url}?name=${encodeURIComponent(domain)}&type=${type}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/dns-json',
        },
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) continue;

      const data: DohResponse = await response.json();
      if (!data.Answer || data.Answer.length === 0) continue;

      const ips = data.Answer
        .filter((answer) => answer.type === recordTypeNum)
        .map((answer) => answer.data);

      if (ips.length > 0) {
        setCache(domain, type, ips);
        return ips;
      }
    } catch {
      continue;
    }
  }

  return [];
}

export async function resolveWithFallback(domain: string): Promise<string> {
  try {
    const ips = await resolveDoh(domain, 'A');
    if (ips.length > 0) return ips[0];
  } catch {
    // fall through to system DNS
  }

  try {
    const result = await lookup(domain, { family: 4 });
    return result.address;
  } catch {
    const result = await lookup(domain, { family: 6 });
    return result.address;
  }
}
