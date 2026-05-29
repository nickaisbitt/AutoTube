type ReferrerCategory = 'search' | 'social' | 'news' | 'direct';

interface ReferrerSource {
  url: string;
  category: ReferrerCategory;
}

export const REFERRER_SOURCES: ReferrerSource[] = [
  { url: 'https://www.google.com/search?q={query}', category: 'search' },
  { url: 'https://www.bing.com/search?q={query}', category: 'search' },
  { url: 'https://duckduckgo.com/?q={query}', category: 'search' },
  { url: 'https://search.yahoo.com/search?p={query}', category: 'search' },
  { url: 'https://yandex.ru/search/?text={query}', category: 'search' },
  { url: 'https://www.reddit.com/', category: 'social' },
  { url: 'https://twitter.com/', category: 'social' },
  { url: 'https://www.facebook.com/', category: 'social' },
  { url: 'https://news.ycombinator.com/', category: 'social' },
  { url: 'https://news.google.com/', category: 'news' },
  { url: 'https://flipboard.com/', category: 'news' },
  { url: '', category: 'direct' },
];

const SEARCH_ENGINE_URLS: Record<string, string> = {
  google: 'https://www.google.com/search?q={query}',
  bing: 'https://www.bing.com/search?q={query}',
  duckduckgo: 'https://duckduckgo.com/?q={query}',
};

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function getRandomReferrer(source?: ReferrerCategory): string {
  const filtered = source
    ? REFERRER_SOURCES.filter((s) => s.category === source)
    : REFERRER_SOURCES;

  const chosen = pickRandom(filtered);
  const url = chosen.url;

  if (url.includes('{query}')) {
    const sampleQueries = [
      'trending videos',
      'best content 2024',
      'how to make',
      'interesting finds',
      'popular today',
      'viral content',
      'recommended',
    ];
    return url.replace('{query}', encodeURIComponent(pickRandom(sampleQueries)));
  }

  return url;
}

export function getSearchReferrer(
  query: string,
  engine: 'google' | 'bing' | 'duckduckgo' = 'google',
): string {
  const template = SEARCH_ENGINE_URLS[engine];
  return template.replace('{query}', encodeURIComponent(query));
}

export function getReferrerHeaders(referrer?: string): Record<string, string> {
  const resolvedReferrer = referrer ?? getRandomReferrer();

  const headers: Record<string, string> = {
    'Referer': resolvedReferrer,
    'Sec-Fetch-Site': resolvedReferrer ? 'cross-site' : 'none',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  };

  return headers;
}
