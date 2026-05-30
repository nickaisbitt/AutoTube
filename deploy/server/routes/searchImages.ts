import type { IncomingMessage, ServerResponse } from "http";
import { fetchBingImages, fetchGoogleImages, fetchDuckDuckGoImages, fetchBingVideos, fetchGoogleVideos, fetchBingNews, fetchFlickrImages, fetchVimeoVideos, fetchDailymotionVideos, fetchGiphyGifs, fetchUnsplashImages, fetchNASAImages, fetchGovPressImages, fetchHybridScraperImages, fetchYandexImages } from "../utils/imageSearch.js";

/**
 * Validates and sanitizes the search query.
 */
function sanitizeQuery(query: string | null): { valid: boolean; sanitized?: string; error?: string } {
  if (!query) {
    return { valid: false, error: 'Missing query parameter "q"' };
  }
  if (query.length > 200) {
    return { valid: false, error: 'Query too long (maximum 200 characters)' };
  }
  const sanitized = query.replace(/[^a-zA-Z0-9\s\-_."']/g, "").trim();
  if (!sanitized) {
    return { valid: false, error: 'Query contains no valid search characters' };
  }
  return { valid: true, sanitized };
}

/**
 * GET /api/search-bing-images?q=...
 */
export async function handleSearchBingImages(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!req.url) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Missing request URL" }));
    return;
  }
  const url = new URL(req.url, `http://${req.headers.host}`);
  const qParam = url.searchParams.get("q");
  
  const validation = sanitizeQuery(qParam);
  if (!validation.valid) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: validation.error }));
    return;
  }
  const query = validation.sanitized!;

  try {
    console.log(`[Bing Images] Searching for: "${query}"`);
    const results = await fetchBingImages(query);
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.end(JSON.stringify({ results }));
  } catch (error) {
    console.error("[Bing Images] Error:", error);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Bing image search failed" }));
  }
}

/**
 * GET /api/search-google-images?q=...
 */
export async function handleSearchGoogleImages(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!req.url) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Missing request URL" }));
    return;
  }
  const url = new URL(req.url, `http://${req.headers.host}`);
  const qParam = url.searchParams.get("q");

  const validation = sanitizeQuery(qParam);
  if (!validation.valid) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: validation.error }));
    return;
  }
  const query = validation.sanitized!;

  try {
    console.log(`[Google Images] Searching for: "${query}"`);
    const results = await fetchGoogleImages(query);
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.end(JSON.stringify({ results }));
  } catch (error) {
    console.error("[Google Images] Error:", error);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Google image search failed" }));
  }
}

/**
 * GET /api/search-yandex-images?q=...
 */
export async function handleSearchYandexImages(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!req.url) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Missing request URL" }));
    return;
  }
  const url = new URL(req.url, `http://${req.headers.host}`);
  const qParam = url.searchParams.get("q");

  const validation = sanitizeQuery(qParam);
  if (!validation.valid) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: validation.error }));
    return;
  }
  const query = validation.sanitized!;

  try {
    console.log(`[Startpage Images] Searching for: "${query}"`);
    const results = await fetchYandexImages(query);
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.end(JSON.stringify({ results }));
  } catch (error) {
    console.error("[Startpage Images] Error:", error);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Startpage image search failed" }));
  }
}

/**
 * GET /api/search-duckduckgo-images?q=...
 */
export async function handleSearchDuckDuckGoImages(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!req.url) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Missing request URL" }));
    return;
  }
  const url = new URL(req.url, `http://${req.headers.host}`);
  const qParam = url.searchParams.get("q");

  const validation = sanitizeQuery(qParam);
  if (!validation.valid) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: validation.error }));
    return;
  }
  const query = validation.sanitized!;

  try {
    console.log(`[DuckDuckGo Images] Searching for: "${query}"`);
    const results = await fetchDuckDuckGoImages(query);
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.end(JSON.stringify({ results }));
  } catch (error) {
    console.error("[DuckDuckGo Images] Error:", error);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "DuckDuckGo image search failed" }));
  }
}

/**
 * GET /api/search-flickr?q=...
 */
export async function handleSearchFlickr(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!req.url) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Missing request URL" }));
    return;
  }
  const url = new URL(req.url, `http://${req.headers.host}`);
  const qParam = url.searchParams.get("q");

  const validation = sanitizeQuery(qParam);
  if (!validation.valid) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: validation.error }));
    return;
  }
  const query = validation.sanitized!;

  try {
    console.log(`[Flickr] Searching for: "${query}"`);
    const results = await fetchFlickrImages(query);
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.end(JSON.stringify({ results }));
  } catch (error) {
    console.error("[Flickr] Error:", error);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Flickr image search failed" }));
  }
}

/**
 * GET /api/search-bing-videos?q=...
 */
export async function handleSearchBingVideos(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!req.url) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Missing request URL" }));
    return;
  }
  const url = new URL(req.url, `http://${req.headers.host}`);
  const qParam = url.searchParams.get("q");

  const validation = sanitizeQuery(qParam);
  if (!validation.valid) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: validation.error }));
    return;
  }
  const query = validation.sanitized!;

  try {
    console.log(`[Bing Videos] Searching for: "${query}"`);
    const results = await fetchBingVideos(query);
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.end(JSON.stringify({ results }));
  } catch (error) {
    console.error("[Bing Videos] Error:", error);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Bing video search failed" }));
  }
}

/**
 * GET /api/search-google-videos?q=...
 */
export async function handleSearchGoogleVideos(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!req.url) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Missing request URL" }));
    return;
  }
  const url = new URL(req.url, `http://${req.headers.host}`);
  const qParam = url.searchParams.get("q");

  const validation = sanitizeQuery(qParam);
  if (!validation.valid) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: validation.error }));
    return;
  }
  const query = validation.sanitized!;

  try {
    console.log(`[Google Videos] Searching for: "${query}"`);
    const results = await fetchGoogleVideos(query);
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.end(JSON.stringify({ results }));
  } catch (error) {
    console.error("[Google Videos] Error:", error);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Google video search failed" }));
  }
}

/**
 * GET /api/search-archive?q=...
 */
export async function handleSearchArchive(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!req.url) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Missing request URL" }));
    return;
  }
  const url = new URL(req.url, `http://${req.headers.host}`);
  const qParam = url.searchParams.get("q");

  const validation = sanitizeQuery(qParam);
  if (!validation.valid) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: validation.error }));
    return;
  }
  const query = validation.sanitized!;

  try {
    console.log(`[Archive.org] Searching for: "${query}"`);

    // Step 1: Search Archive.org advanced API for video items
    const searchUrl =
      `https://archive.org/advancedsearch.php?q=${encodeURIComponent(query)}+mediatype:(movies)` +
      `&fl[]=identifier&fl[]=title&fl[]=description&rows=10&output=json`;

    const searchRes = await fetch(searchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json",
      },
    });

    if (!searchRes.ok) {
      console.warn(`[Archive.org] Search HTTP ${searchRes.status}`);
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.end(JSON.stringify({ results: [] }));
      return;
    }

    const searchData = await searchRes.json();
    const docs = searchData?.response?.docs;
    if (!docs || docs.length === 0) {
      console.log(`[Archive.org] No results for "${query}"`);
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.end(JSON.stringify({ results: [] }));
      return;
    }

    // Step 2: For each identifier, fetch metadata to find best MP4 file
    const results: Array<{ url: string; thumbnailUrl?: string; title: string; duration?: string }> = [];

    const itemPromises = docs.map(async (doc: { identifier: string; title?: string; description?: string }) => {
      try {
        const metadataUrl = `https://archive.org/metadata/${doc.identifier}`;
        const metaRes = await fetch(metadataUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
            "Accept": "application/json",
          },
        });

        if (!metaRes.ok) return null;

        const meta = await metaRes.json();
        if (!meta.files || meta.files.length === 0) return null;

        // Find the best MP4 file (largest size)
        const mp4Files = meta.files.filter((f: { name: string; format?: string; size?: string }) =>
          f.name.toLowerCase().endsWith('.mp4')
        );
        if (mp4Files.length === 0) return null;

        const best = mp4Files.reduce((prev: { size?: string }, curr: { size?: string }) => {
          const prevSize = parseInt(prev.size || '0', 10);
          const currSize = parseInt(curr.size || '0', 10);
          return currSize > prevSize ? curr : prev;
        });

        const encodedFilename = encodeURIComponent(best.name);
        const downloadUrl = `https://archive.org/download/${doc.identifier}/${encodedFilename}`;
        const title = doc.title || doc.identifier;

        // Derive thumbnail URL from the item identifier
        const thumbnailUrl = `https://archive.org/services/img/${doc.identifier}`;

        return {
          url: downloadUrl,
          thumbnailUrl,
          title,
        };
      } catch {
        return null;
      }
    });

    const itemResults = await Promise.allSettled(itemPromises);
    for (const result of itemResults) {
      if (result.status === 'fulfilled' && result.value) {
        results.push(result.value);
      }
    }

    console.log(`[Archive.org] Found ${results.length} videos for "${query}"`);
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.end(JSON.stringify({ results }));
  } catch (error) {
    console.error("[Archive.org] Error:", error);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Archive.org search failed" }));
  }
}

/**
 * GET /api/search-unsplash?q=...
 */
export async function handleSearchUnsplash(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!req.url) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Missing request URL" }));
    return;
  }
  const url = new URL(req.url, `http://${req.headers.host}`);
  const qParam = url.searchParams.get("q");

  const validation = sanitizeQuery(qParam);
  if (!validation.valid) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: validation.error }));
    return;
  }
  const query = validation.sanitized!;

  try {
    console.log(`[Unsplash] Searching for: "${query}"`);
    const results = await fetchUnsplashImages(query);
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.end(JSON.stringify({ results }));
  } catch (error) {
    console.error("[Unsplash] Error:", error);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Unsplash image search failed" }));
  }
}

/**
 * GET /api/search-bing-news?q=...
 */
export async function handleSearchBingNews(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!req.url) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Missing request URL" }));
    return;
  }
  const url = new URL(req.url, `http://${req.headers.host}`);
  const qParam = url.searchParams.get("q");

  const validation = sanitizeQuery(qParam);
  if (!validation.valid) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: validation.error }));
    return;
  }
  const query = validation.sanitized!;

  try {
    console.log(`[Bing News] Searching for: "${query}"`);
    const results = await fetchBingNews(query);
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.end(JSON.stringify({ results }));
  } catch (error) {
    console.error("[Bing News] Error:", error);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Bing news search failed" }));
  }
}

/**
 * GET /api/search-vimeo?q=...
 */
export async function handleSearchVimeo(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!req.url) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Missing request URL" }));
    return;
  }
  const url = new URL(req.url, `http://${req.headers.host}`);
  const qParam = url.searchParams.get("q");

  const validation = sanitizeQuery(qParam);
  if (!validation.valid) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: validation.error }));
    return;
  }
  const query = validation.sanitized!;

  try {
    console.log(`[Vimeo] Searching for: "${query}"`);
    const results = await fetchVimeoVideos(query);
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.end(JSON.stringify({ results }));
  } catch (error) {
    console.error("[Vimeo] Error:", error);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Vimeo search failed" }));
  }
}

/**
 * GET /api/search-dailymotion?q=...
 */
export async function handleSearchDailymotion(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!req.url) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Missing request URL" }));
    return;
  }
  const url = new URL(req.url, `http://${req.headers.host}`);
  const qParam = url.searchParams.get("q");

  const validation = sanitizeQuery(qParam);
  if (!validation.valid) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: validation.error }));
    return;
  }
  const query = validation.sanitized!;

  try {
    console.log(`[Dailymotion] Searching for: "${query}"`);
    const results = await fetchDailymotionVideos(query);
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.end(JSON.stringify({ results }));
  } catch (error) {
    console.error("[Dailymotion] Error:", error);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Dailymotion search failed" }));
  }
}

/**
 * GET /api/search-giphy?q=...
 */
export async function handleSearchGiphy(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!req.url) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Missing request URL" }));
    return;
  }
  const url = new URL(req.url, `http://${req.headers.host}`);
  const qParam = url.searchParams.get("q");

  const validation = sanitizeQuery(qParam);
  if (!validation.valid) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: validation.error }));
    return;
  }
  const query = validation.sanitized!;

  try {
    console.log(`[Giphy] Searching for: "${query}"`);
    const results = await fetchGiphyGifs(query);
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.end(JSON.stringify({ results }));
  } catch (error) {
    console.error("[Giphy] Error:", error);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Giphy search failed" }));
  }
}

/**
 * GET /api/search-nasa?q=...
 */
export async function handleSearchNASA(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!req.url) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Missing request URL" }));
    return;
  }
  const url = new URL(req.url, `http://${req.headers.host}`);
  const qParam = url.searchParams.get("q");

  const validation = sanitizeQuery(qParam);
  if (!validation.valid) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: validation.error }));
    return;
  }
  const query = validation.sanitized!;

  try {
    console.log(`[NASA] Searching for: "${query}"`);
    const results = await fetchNASAImages(query);
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.end(JSON.stringify({ results }));
  } catch (error) {
    console.error("[NASA] Error:", error);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "NASA image search failed" }));
  }
}

/**
 * GET /api/search-govpress?q=...
 */
export async function handleSearchGovPress(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!req.url) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Missing request URL" }));
    return;
  }
  const url = new URL(req.url, `http://${req.headers.host}`);
  const qParam = url.searchParams.get("q");

  const validation = sanitizeQuery(qParam);
  if (!validation.valid) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: validation.error }));
    return;
  }
  const query = validation.sanitized!;

  try {
    console.log(`[GovPress] Searching for: "${query}"`);
    const results = await fetchGovPressImages(query);
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.end(JSON.stringify({ results }));
  } catch (error) {
    console.error("[GovPress] Error:", error);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "GovPress image search failed" }));
  }
}

/**
 * GET /api/search-hybrid?q=...
 */
export async function handleSearchHybrid(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!req.url) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Missing request URL" }));
    return;
  }
  const url = new URL(req.url, `http://${req.headers.host}`);
  const qParam = url.searchParams.get("q");

  const validation = sanitizeQuery(qParam);
  if (!validation.valid) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: validation.error }));
    return;
  }
  const query = validation.sanitized!;

  try {
    console.log(`[HybridScraper] Searching for: "${query}"`);
    const results = await fetchHybridScraperImages(query);
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.end(JSON.stringify({ results }));
  } catch (error) {
    console.error("[HybridScraper] Error:", error);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Hybrid scraper search failed" }));
  }
}
