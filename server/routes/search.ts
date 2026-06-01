import type { IncomingMessage, ServerResponse } from "http";
import { fetchDDGImages } from "../utils/ddg.js";

/**
 * GET /api/search?q=...
 * DuckDuckGo image search proxy.
 */
export async function handleSearch(
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
    console.log(`[Local Search] Scraping DDG for: "${query}"`);
    const results = await fetchDDGImages(query);
    res.setHeader("Content-Type", "application/json");

    res.end(JSON.stringify(results));
  } catch (error) {
    console.error("[Local Search] Error:", error);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        error: "Search failed",
        details: error instanceof Error ? error.message : String(error),
      }),
    );
  }
}
