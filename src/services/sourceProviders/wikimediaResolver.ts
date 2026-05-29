import type { MediaCandidate } from '../media';
import { fetchWithTimeout } from '../../utils/fetchWithTimeout';
import { logger } from '../logger';

const WIKIMEDIA_BASE_SCORE = 165;

interface WikimediaImageInfo {
  url?: string;
  size?: number;
  mime?: string;
  width?: number;
  height?: number;
  descriptionshorturl?: string;
}

interface WikimediaPage {
  imageinfo?: WikimediaImageInfo[];
  title?: string;
}

interface WikimediaApiResponse {
  query?: {
    pages?: Record<string, WikimediaPage>;
  };
}

export async function resolveWikimediaUrl(fileTitle: string, signal?: AbortSignal): Promise<string | null> {
  try {
    const normalizedTitle = fileTitle.startsWith('File:') || fileTitle.startsWith('Image:')
      ? fileTitle
      : `File:${fileTitle}`;

    const url =
      `https://commons.wikimedia.org/w/api.php?action=query` +
      `&titles=${encodeURIComponent(normalizedTitle)}` +
      `&prop=imageinfo&iiprop=url|size|mime&format=json&origin=*`;

    const response = await fetchWithTimeout(url, {}, {
      timeoutMs: 10_000,
      maxRetries: 1,
      signal,
    });

    if (!response.ok) return null;

    const data: WikimediaApiResponse = await response.json();
    if (!data.query?.pages) return null;

    const pages = Object.values(data.query.pages);
    if (pages.length === 0) return null;

    const info = pages[0]?.imageinfo?.[0];
    if (!info?.url) return null;

    return info.url;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') throw err;
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    logger.warn('WikimediaResolver', `Failed to resolve "${fileTitle}"`, err);
    return null;
  }
}

export function resolveWikimediaFromPage(html: string, _baseUrl: string): string[] {
  const results: string[] = [];
  const seen = new Set<string>();

  const fileLinkRegex = /\/wiki\/(?:File|Image):([^"'\s<>]+)/gi;
  let match: RegExpExecArray | null;

  while ((match = fileLinkRegex.exec(html)) !== null) {
    const fileTitle = decodeURIComponent(match[1].replace(/_/g, ' '));
    const fullTitle = `File:${fileTitle}`;
    if (!seen.has(fullTitle)) {
      seen.add(fullTitle);
      results.push(fullTitle);
    }
  }

  const uploadRegex = /https?:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/[^"'\s<>]+\.(?:jpg|jpeg|png|gif|webp)/gi;
  while ((match = uploadRegex.exec(html)) !== null) {
    const uploadUrl = match[0];
    if (!seen.has(uploadUrl)) {
      seen.add(uploadUrl);
      results.push(uploadUrl);
    }
  }

  const relativeUploadRegex = /\/\/upload\.wikimedia\.org\/wikipedia\/commons\/[^"'\s<>]+\.(?:jpg|jpeg|png|gif|webp)/gi;
  while ((match = relativeUploadRegex.exec(html)) !== null) {
    const uploadUrl = `https:${match[0]}`;
    if (!seen.has(uploadUrl)) {
      seen.add(uploadUrl);
      results.push(uploadUrl);
    }
  }

  return results;
}

export async function resolveWikimediaCandidates(
  fileTitles: string[],
  query: string,
  signal?: AbortSignal,
): Promise<MediaCandidate[]> {
  const candidates: MediaCandidate[] = [];

  for (const title of fileTitles) {
    if (signal?.aborted) break;

    try {
      const normalizedTitle = title.startsWith('File:') || title.startsWith('Image:')
        ? title
        : `File:${title}`;

      const apiUrl =
        `https://commons.wikimedia.org/w/api.php?action=query` +
        `&titles=${encodeURIComponent(normalizedTitle)}` +
        `&prop=imageinfo&iiprop=url|size|mime&format=json&origin=*`;

      const response = await fetchWithTimeout(apiUrl, {}, {
        timeoutMs: 8_000,
        maxRetries: 1,
        signal,
      });

      if (!response.ok) continue;

      const data: WikimediaApiResponse = await response.json();
      if (!data.query?.pages) continue;

      const pages = Object.values(data.query.pages);
      if (pages.length === 0) continue;

      const page = pages[0];
      const info = page.imageinfo?.[0];
      if (!info?.url) continue;

      if (info.mime && !info.mime.startsWith('image/')) continue;

      candidates.push({
        url: info.url,
        alt: page.title || query,
        source: 'Wikimedia Commons (Resolved)',
        sourceUrl: info.descriptionshorturl || info.url,
        width: info.width,
        height: info.height,
        baseScore: WIKIMEDIA_BASE_SCORE,
        query,
        finalScore: 0,
        type: 'image' as const,
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') throw err;
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      logger.warn('WikimediaResolver', `Failed to resolve candidate "${title}"`, err);
    }
  }

  return candidates;
}
