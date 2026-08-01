import type { IncomingMessage, ServerResponse } from "http";

// ── Pexels response shapes ──────────────────────────────────────────────────

interface PexelsPhoto {
  id: number;
  width: number;
  height: number;
  url: string;
  photographer: string;
  alt: string;
  src: { original: string; large2x: string; large: string; medium: string };
}

interface PexelsVideo {
  id: number;
  width: number;
  height: number;
  duration: number;
  url: string;
  image: string;
  video_files: Array<{ quality: string; width: number; height: number; link: string }>;
}

// ── Pixabay response shapes ─────────────────────────────────────────────────

interface PixabayPhotoHit {
  id: number;
  largeImageURL: string;
  webformatURL: string;
  imageWidth: number;
  imageHeight: number;
  tags: string;
  pageURL: string;
  user: string;
}

interface PixabayVideoHit {
  id: number;
  pageURL: string;
  tags: string;
  duration: number;
  user: string;
  videos: {
    large: { url: string; width: number; height: number; thumbnail: string };
    medium: { url: string; width: number; height: number; thumbnail: string };
    small: { url: string; width: number; height: number; thumbnail: string };
    tiny: { url: string; width: number; height: number; thumbnail: string };
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function sanitizeQuery(q: string | null): string | null {
  if (!q || q.length > 200) return null;
  const cleaned = q.replace(/[^a-zA-Z0-9\s\-_."']/g, "").trim();
  return cleaned || null;
}

// ── Pexels handlers ─────────────────────────────────────────────────────────

/**
 * GET /api/search-pexels?q=...&type=photos|videos&limit=15
 *
 * Searches Pexels using server-side PEXELS_API_KEY.
 * Returns { results: MediaCandidate[] } in the same shape the client providers expect.
 * Returns 503 when PEXELS_API_KEY is not set (client falls back to BYOK VITE_PEXELS_KEY).
 */
export async function handleSearchPexels(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) {
    res.statusCode = 503;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Pexels not configured on server — set PEXELS_API_KEY", results: [] }));
    return;
  }

  const url = new URL(req.url!, `http://${req.headers.host}`);
  const query = sanitizeQuery(url.searchParams.get("q"));
  if (!query) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Missing or invalid query parameter \"q\"" }));
    return;
  }

  const type = url.searchParams.get("type") === "videos" ? "videos" : "photos";
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "15", 10), 30);

  try {
    let results: object[];

    if (type === "videos") {
      const pexelsUrl = `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=${limit}&size=medium`;
      const upstream = await fetch(pexelsUrl, { headers: { Authorization: apiKey } });
      if (!upstream.ok) throw new Error(`Pexels Videos HTTP ${upstream.status}`);
      const data = (await upstream.json()) as { videos?: PexelsVideo[] };

      results = (data.videos || [])
        .filter((v) => v.height <= v.width && v.duration <= 30)
        .flatMap((video) => {
          const hdFile = video.video_files
            .filter((f) => f.width >= 1920 && f.height >= 1080)
            .sort((a, b) => b.width - a.width)[0];
          if (!hdFile) return [];
          return [{
            url: hdFile.link,
            thumbnailUrl: video.image,
            alt: `Pexels video: ${query}`,
            source: "Pexels Videos",
            sourceUrl: video.url,
            width: hdFile.width,
            height: hdFile.height,
            baseScore: 90,
            query,
            finalScore: 0,
            type: "video",
            duration: video.duration,
          }];
        });
    } else {
      const pexelsUrl = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${limit}`;
      const upstream = await fetch(pexelsUrl, { headers: { Authorization: apiKey } });
      if (!upstream.ok) throw new Error(`Pexels HTTP ${upstream.status}`);
      const data = (await upstream.json()) as { photos?: PexelsPhoto[] };

      results = (data.photos || []).map((photo) => ({
        url: photo.src.original || photo.src.large2x,
        thumbnailUrl: photo.src.medium,
        alt: photo.alt || query,
        source: `Pexels · ${photo.photographer}`,
        sourceUrl: photo.url,
        width: photo.width,
        height: photo.height,
        baseScore: 95,
        query,
        finalScore: 0,
        type: "image",
      }));
    }

    console.log(`[StockMedia/Pexels] ${type} query "${query}": ${results.length} results`);
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ results }));
  } catch (err) {
    console.error("[StockMedia/Pexels] Error:", err);
    res.statusCode = 502;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Pexels search failed", results: [] }));
  }
}

// ── Pixabay handlers ────────────────────────────────────────────────────────

/**
 * GET /api/search-pixabay?q=...&type=photos|videos&limit=15
 *
 * Searches Pixabay using server-side PIXABAY_API_KEY.
 * Returns { results: MediaCandidate[] } in the same shape the client providers expect.
 * Returns 503 when PIXABAY_API_KEY is not set (client falls back to BYOK VITE_PIXABAY_KEY).
 */
export async function handleSearchPixabay(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const apiKey = process.env.PIXABAY_API_KEY;
  if (!apiKey) {
    res.statusCode = 503;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Pixabay not configured on server — set PIXABAY_API_KEY", results: [] }));
    return;
  }

  const url = new URL(req.url!, `http://${req.headers.host}`);
  const query = sanitizeQuery(url.searchParams.get("q"));
  if (!query) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Missing or invalid query parameter \"q\"" }));
    return;
  }

  const type = url.searchParams.get("type") === "videos" ? "videos" : "photos";
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "15", 10), 30);

  try {
    let results: object[];

    if (type === "videos") {
      const pixabayUrl = `https://pixabay.com/api/videos/?key=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(query)}&per_page=${limit}`;
      const upstream = await fetch(pixabayUrl);
      if (!upstream.ok) throw new Error(`Pixabay Videos HTTP ${upstream.status}`);
      const data = (await upstream.json()) as { hits?: PixabayVideoHit[] };

      results = (data.hits || [])
        .filter((hit) => hit.duration <= 30)
        .flatMap((hit) => {
          const vid = hit.videos.large || hit.videos.medium;
          if (!vid?.url || vid.height > vid.width || vid.width < 1280) return [];
          return [{
            url: vid.url,
            thumbnailUrl: hit.videos.small?.thumbnail || hit.videos.tiny?.thumbnail,
            alt: hit.tags || query,
            source: `Pixabay Videos · ${hit.user}`,
            sourceUrl: hit.pageURL,
            width: vid.width,
            height: vid.height,
            baseScore: 170,
            query,
            finalScore: 0,
            type: "video",
            duration: hit.duration,
          }];
        });
    } else {
      const pixabayUrl = `https://pixabay.com/api/?key=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(query)}&per_page=${limit}&image_type=photo`;
      const upstream = await fetch(pixabayUrl);
      if (!upstream.ok) throw new Error(`Pixabay HTTP ${upstream.status}`);
      const data = (await upstream.json()) as { hits?: PixabayPhotoHit[] };

      results = (data.hits || []).map((hit) => ({
        url: hit.largeImageURL,
        thumbnailUrl: hit.webformatURL,
        alt: hit.tags || query,
        source: `Pixabay · ${hit.user}`,
        sourceUrl: hit.pageURL,
        width: hit.imageWidth,
        height: hit.imageHeight,
        baseScore: 95,
        query,
        finalScore: 0,
        type: "image",
      }));
    }

    console.log(`[StockMedia/Pixabay] ${type} query "${query}": ${results.length} results`);
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ results }));
  } catch (err) {
    console.error("[StockMedia/Pixabay] Error:", err);
    res.statusCode = 502;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Pixabay search failed", results: [] }));
  }
}
