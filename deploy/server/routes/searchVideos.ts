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
  const qParam = url.searchParams.get("q");

  if (!qParam) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: 'Missing query parameter "q"' }));
    return;
  }

  if (qParam.length > 200) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Query too long (maximum 200 characters)" }));
    return;
  }

  const query = qParam.replace(/[^a-zA-Z0-9\s\-_."']/g, "").trim();
  if (!query) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Query contains no valid search characters" }));
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
