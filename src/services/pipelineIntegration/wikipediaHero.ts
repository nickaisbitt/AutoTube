export interface WikipediaHeroResult {
  url: string;
  thumbnailUrl: string;
  alt: string;
  width: number;
  height: number;
  license: string;
}

interface WikipediaSummaryResponse {
  title?: string;
  description?: string;
  extract?: string;
  originalimage?: {
    source: string;
    width: number;
    height: number;
  };
  thumbnail?: {
    source: string;
    width: number;
    height: number;
  };
  content_urls?: {
    desktop?: {
      page?: string;
    };
  };
}

const WIKIPEDIA_TIMEOUT_MS = 8000;

async function fetchWikipediaSummary(
  topic: string,
  signal?: AbortSignal,
): Promise<WikipediaSummaryResponse | null> {
  const encodedTopic = encodeURIComponent(topic);
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodedTopic}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), WIKIPEDIA_TIMEOUT_MS);

  const combinedSignal = signal
    ? AbortSignal.any([signal, controller.signal])
    : controller.signal;

  try {
    const response = await fetch(url, {
      signal: combinedSignal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'AutoTube/1.0 (video generation pipeline)',
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return null;
    }

    const data: WikipediaSummaryResponse = await response.json();
    return data;
  } catch {
    clearTimeout(timeoutId);
    return null;
  }
}

export async function resolveWikipediaHeroImage(
  topic: string,
  signal?: AbortSignal,
): Promise<WikipediaHeroResult | null> {
  const data = await fetchWikipediaSummary(topic, signal);

  if (!data) return null;

  if (!data.originalimage?.source) {
    if (data.thumbnail?.source) {
      return {
        url: data.thumbnail.source,
        thumbnailUrl: data.thumbnail.source,
        alt: data.description || data.title || topic,
        width: data.thumbnail.width || 0,
        height: data.thumbnail.height || 0,
        license: 'unknown',
      };
    }
    return null;
  }

  return {
    url: data.originalimage.source,
    thumbnailUrl: data.thumbnail?.source || data.originalimage.source,
    alt: data.description || data.title || topic,
    width: data.originalimage.width || 0,
    height: data.originalimage.height || 0,
    license: 'wikimedia',
  };
}

export async function resolveWikipediaHeroFromEntity(
  entities: string[],
  signal?: AbortSignal,
): Promise<WikipediaHeroResult | null> {
  for (const entity of entities) {
    if (signal?.aborted) return null;

    const result = await resolveWikipediaHeroImage(entity, signal);
    if (result) return result;
  }

  return null;
}
