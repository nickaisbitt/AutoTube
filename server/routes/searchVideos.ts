import type { IncomingMessage, ServerResponse } from "http";
import { fetchDDGVideos } from "../utils/ddg.js";

/**
 * GET /api/search-videos?q=...
 * DuckDuckGo video search proxy.
 */
export async function handleSearchVideos(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const url = new URL(req.url!, `http://${req.headers.host}`);
  const query = url.searchParams.get("q");

  if (!query) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: 'Missing query parameter "q"' }));
    return;
  }

  try {
    console.log(`[Video Search] Scraping DDG videos for: "${query}"`);
    const results = await fetchDDGVideos(query);
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.end(JSON.stringify(results));
  } catch (error) {
    console.error("[Video Search] Error:", error);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        error: "Video search failed",
        details: error instanceof Error ? error.message : String(error),
      }),
    );
  }
}
