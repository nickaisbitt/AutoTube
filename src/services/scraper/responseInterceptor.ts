export interface MediaUrlPattern {
  pattern: RegExp;
  type: 'image' | 'video' | 'audio';
  priority: number;
}

export const MEDIA_URL_PATTERNS: MediaUrlPattern[] = [
  { pattern: /https?:\/\/[^\s"'<>]+\.(?:jpe?g)(?:\?[^\s"'<>]*)?/gi, type: 'image', priority: 10 },
  { pattern: /https?:\/\/[^\s"'<>]+\.(?:png)(?:\?[^\s"'<>]*)?/gi, type: 'image', priority: 10 },
  { pattern: /https?:\/\/[^\s"'<>]+\.(?:webp)(?:\?[^\s"'<>]*)?/gi, type: 'image', priority: 10 },
  { pattern: /https?:\/\/[^\s"'<>]+\.(?:gif)(?:\?[^\s"'<>]*)?/gi, type: 'image', priority: 10 },
  { pattern: /https?:\/\/[^\s"'<>]+\.(?:svg)(?:\?[^\s"'<>]*)?/gi, type: 'image', priority: 5 },
  { pattern: /https?:\/\/[^\s"'<>]+\.(?:avif)(?:\?[^\s"'<>]*)?/gi, type: 'image', priority: 10 },
  { pattern: /https?:\/\/[^\s"'<>]*cloudinary\.com\/[^\s"'<>]+/gi, type: 'image', priority: 20 },
  { pattern: /https?:\/\/[^\s"'<>]*\.imgix\.net\/[^\s"'<>]+/gi, type: 'image', priority: 20 },
  { pattern: /https?:\/\/[^\s"'<>]*fastly\.net\/[^\s"'<>]+\.(?:jpe?g|png|webp|gif)/gi, type: 'image', priority: 20 },
  { pattern: /https?:\/\/[^\s"'<>]+\.(?:mp4)(?:\?[^\s"'<>]*)?/gi, type: 'video', priority: 10 },
  { pattern: /https?:\/\/[^\s"'<>]+\.(?:webm)(?:\?[^\s"'<>]*)?/gi, type: 'video', priority: 10 },
  { pattern: /https?:\/\/[^\s"'<>]+\.(?:m3u8)(?:\?[^\s"'<>]*)?/gi, type: 'video', priority: 15 },
  { pattern: /https?:\/\/[^\s"'<>]+\.(?:ts)(?:\?[^\s"'<>]*)?/gi, type: 'video', priority: 5 },
  { pattern: /https?:\/\/[^\s"'<>]*cloudfront\.net\/[^\s"'<>]+\.(?:mp4|webm|m3u8)/gi, type: 'video', priority: 20 },
  { pattern: /https?:\/\/[^\s"'<>]*akamaihd\.net\/[^\s"'<>]+\.(?:mp4|webm|m3u8)/gi, type: 'video', priority: 20 },
  { pattern: /https?:\/\/[^\s"'<>]*fastly\.net\/[^\s"'<>]+\.(?:mp4|webm|m3u8)/gi, type: 'video', priority: 20 },
  { pattern: /https?:\/\/[^\s"'<>]+\.(?:mp3)(?:\?[^\s"'<>]*)?/gi, type: 'audio', priority: 10 },
  { pattern: /https?:\/\/[^\s"'<>]+\.(?:wav)(?:\?[^\s"'<>]*)?/gi, type: 'audio', priority: 10 },
  { pattern: /https?:\/\/[^\s"'<>]+\.(?:ogg)(?:\?[^\s"'<>]*)?/gi, type: 'audio', priority: 10 },
  { pattern: /https?:\/\/[^\s"'<>]+\.(?:aac)(?:\?[^\s"'<>]*)?/gi, type: 'audio', priority: 10 },
  { pattern: /https?:\/\/[^\s"'<>]+\.(?:m4a)(?:\?[^\s"'<>]*)?/gi, type: 'audio', priority: 10 },
  { pattern: /https?:\/\/[^\s"'<>]+\.(?:flac)(?:\?[^\s"'<>]*)?/gi, type: 'audio', priority: 10 },
  { pattern: /https?:\/\/[^\s"'<>]*\.giphy\.com\/media\/[^\s"'<>]+/gi, type: 'video', priority: 20 },
  { pattern: /https?:\/\/[^\s"'<>]*staticflickr\.com\/[^\s"'<>]+/gi, type: 'image', priority: 20 },
];

const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'fbclid',
  'gclid',
  'gclsrc',
  'dclid',
  'gbraid',
  'wbraid',
  'msclkid',
  'mc_cid',
  'mc_eid',
  'ref',
  'ref_src',
  'ref_url',
  'source',
  'feature',
  'si',
  'igshid',
  'igsh',
]);

interface MediaCollection {
  images: string[];
  videos: string[];
  audio: string[];
}

function createEmptyCollection(): MediaCollection {
  return { images: [], videos: [], audio: [] };
}

function addToCollection(collection: MediaCollection, type: 'image' | 'video' | 'audio', url: string): void {
  switch (type) {
    case 'image':
      collection.images.push(url);
      break;
    case 'video':
      collection.videos.push(url);
      break;
    case 'audio':
      collection.audio.push(url);
      break;
  }
}

function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const params = Array.from(parsed.searchParams.entries())
      .filter(([key]) => !TRACKING_PARAMS.has(key))
      .sort(([a], [b]) => a.localeCompare(b));

    parsed.search = '';
    const cleanBase = parsed.toString();

    if (params.length === 0) return cleanBase;

    const cleanParams = new URLSearchParams(params).toString();
    return `${cleanBase}?${cleanParams}`;
  } catch {
    return url;
  }
}

export function extractMediaUrls(html: string): MediaCollection {
  const collection = createEmptyCollection();
  const seen = new Set<string>();

  for (const { pattern, type } of MEDIA_URL_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(html)) !== null) {
      const url = match[0];
      if (!isValidUrl(url)) continue;
      const normalized = normalizeUrl(url);
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      addToCollection(collection, type, url);
    }
  }

  const srcRegex = /(?:src|href|poster|data-src|data-poster)\s*=\s*["']([^"']+)["']/gi;
  let srcMatch: RegExpExecArray | null;
  while ((srcMatch = srcRegex.exec(html)) !== null) {
    const url = srcMatch[1];
    if (!isValidUrl(url)) continue;
    const normalized = normalizeUrl(url);
    if (seen.has(normalized)) continue;

    for (const { pattern, type } of MEDIA_URL_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(url)) {
        seen.add(normalized);
        addToCollection(collection, type, url);
        break;
      }
    }
  }

  return collection;
}

export function extractMediaFromJson(json: unknown): MediaCollection {
  const collection = createEmptyCollection();
  const seen = new Set<string>();
  const stringValues: string[] = [];

  function walk(obj: unknown): void {
    if (typeof obj === 'string') {
      stringValues.push(obj);
      return;
    }
    if (Array.isArray(obj)) {
      for (const item of obj) walk(item);
      return;
    }
    if (obj !== null && typeof obj === 'object') {
      for (const value of Object.values(obj as Record<string, unknown>)) {
        walk(value);
      }
    }
  }

  walk(json);

  for (const value of stringValues) {
    if (!value.startsWith('http')) continue;
    if (!isValidUrl(value)) continue;

    const normalized = normalizeUrl(value);
    if (seen.has(normalized)) continue;

    for (const { pattern, type } of MEDIA_URL_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(value)) {
        seen.add(normalized);
        addToCollection(collection, type, value);
        break;
      }
    }
  }

  return collection;
}

export function deduplicateUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const url of urls) {
    const normalized = normalizeUrl(url);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}
